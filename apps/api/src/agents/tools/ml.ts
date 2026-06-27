import { z } from 'zod';
import {
  db,
  getMlMetricNames,
  getMlMetricSeries,
  getMlProjectById,
  getMlRunById,
  listMlImages,
  listMlProjects,
  listMlRuns,
} from '@openpanel/db';
import { chatTool, dashboardUrl } from './helpers';

const MAX_RUNS = 100;
const MAX_METRIC_RUNS = 20;
const MAX_METRIC_POINTS = 5_000;
const MAX_EVALUATION_ROWS = 100;
const MAX_IMAGES = 100;

async function assertMlProject(projectId: string) {
  const project = await db.project.findFirst({
    where: { id: projectId },
    select: { id: true, types: true },
  });

  if (!project) {
    throw new Error('Project not found');
  }

  if (!project.types.includes('ml')) {
    throw new Error('Project is not an ML project');
  }
}

function mlProjectPath(mlProjectId: string) {
  return `/ml/projects/${mlProjectId}`;
}

function mlRunPath(mlProjectId: string, runId: string) {
  return `${mlProjectPath(mlProjectId)}/runs/${runId}`;
}

function getEvaluationRowOrderBy(
  sortBy: 'createdAt' | 'sampleId' | 'step' | 'epoch',
  sortDirection: 'asc' | 'desc',
) {
  if (sortBy === 'sampleId') {
    return { sampleId: sortDirection };
  }
  if (sortBy === 'step') {
    return { step: sortDirection };
  }
  if (sortBy === 'epoch') {
    return { epoch: sortDirection };
  }

  return { createdAt: sortDirection };
}

function getNumericMetricKeys(values: unknown[]) {
  const keys = new Set<string>();
  for (const value of values) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      continue;
    }
    for (const [key, item] of Object.entries(value)) {
      if (typeof item === 'number') {
        keys.add(key);
      }
    }
  }

  return [...keys].sort();
}

function getDefaultMlProjectId(contextMlProjectId?: string, inputMlProjectId?: string) {
  return inputMlProjectId || contextMlProjectId;
}

function getDefaultRunId(contextRunId?: string, inputRunId?: string) {
  return inputRunId || contextRunId;
}

export const listMlProjectsTool = chatTool(
  {
    name: 'list_ml_projects',
    description:
      'List ML experiment projects in the current OpenPanel project. Returns ML project IDs, names, descriptions, run counts, timestamps, and dashboard links.',
    schema: z.object({}),
  },
  async (_input, context) => {
    await assertMlProject(context.projectId);
    const projects = await listMlProjects(context.projectId);
    return {
      projects: projects.map((project) => ({
        ...project,
        dashboard_url: dashboardUrl(
          context.organizationId,
          context.projectId,
          mlProjectPath(project.id),
        ),
      })),
    };
  },
);

export const getMlProjectTool = chatTool(
  {
    name: 'get_ml_project',
    description:
      'Get one ML experiment project by ID. Defaults to the ML project currently being viewed when available.',
    schema: z.object({
      mlProjectId: z.string().optional().describe('The ML project ID to look up'),
    }),
  },
  async ({ mlProjectId }, context) => {
    await assertMlProject(context.projectId);
    const id = getDefaultMlProjectId(context.pageContext?.ids?.mlProjectId, mlProjectId);
    if (!id) {
      return { error: 'No ML project ID provided or available in the current view' };
    }

    const project = await getMlProjectById({ projectId: context.projectId, id });
    if (!project) {
      return { error: 'ML project not found', mlProjectId: id };
    }

    return {
      ...project,
      dashboard_url: dashboardUrl(
        context.organizationId,
        context.projectId,
        mlProjectPath(project.id),
      ),
    };
  },
);

export const listMlRunsTool = chatTool(
  {
    name: 'list_ml_runs',
    description:
      'List ML tracking runs. Optionally filter by ML project, status, or tag. Returns run summaries, configs, metadata, timestamps, and dashboard links.',
    schema: z.object({
      mlProjectId: z.string().optional().describe('Filter runs to a specific ML project ID'),
      status: z.string().optional().describe('Filter by run status, e.g. running, finished, failed'),
      tag: z.string().optional().describe('Filter to runs containing this tag'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(MAX_RUNS)
        .default(25)
        .optional()
        .describe('Maximum number of runs to return'),
    }),
  },
  async ({ mlProjectId, status, tag, limit }, context) => {
    await assertMlProject(context.projectId);
    const projectId = getDefaultMlProjectId(
      context.pageContext?.ids?.mlProjectId,
      mlProjectId,
    );
    const runs = await listMlRuns({
      projectId: context.projectId,
      mlProjectId: projectId,
    });
    const filtered = runs
      .filter((run) => !status || run.status === status)
      .filter((run) => !tag || run.tags.includes(tag))
      .slice(0, limit ?? 25);

    return {
      runs: filtered.map((run) => ({
        ...run,
        dashboard_url: dashboardUrl(
          context.organizationId,
          context.projectId,
          mlRunPath(run.mlProjectId, run.id),
        ),
      })),
      total_before_limit: runs.length,
    };
  },
);

export const getMlRunTool = chatTool(
  {
    name: 'get_ml_run',
    description:
      'Get a specific ML run by ID, including project, status, tags, config, metadata, summary metrics, timestamps, and dashboard link. Defaults to the currently viewed run.',
    schema: z.object({
      runId: z.string().optional().describe('The ML run ID to look up'),
    }),
  },
  async ({ runId }, context) => {
    await assertMlProject(context.projectId);
    const id = getDefaultRunId(context.pageContext?.ids?.runId, runId);
    if (!id) {
      return { error: 'No ML run ID provided or available in the current view' };
    }

    const run = await getMlRunById({ projectId: context.projectId, id });
    if (!run) {
      return { error: 'ML run not found', runId: id };
    }

    return {
      ...run,
      dashboard_url: dashboardUrl(
        context.organizationId,
        context.projectId,
        mlRunPath(run.mlProjectId, run.id),
      ),
    };
  },
);

export const listMlMetricNamesTool = chatTool(
  {
    name: 'list_ml_metric_names',
    description:
      'List scalar metric names logged for ML runs. Use this before requesting metric series unless the user named an obvious metric from a run summary.',
    schema: z.object({
      mlProjectId: z.string().optional().describe('Optional ML project ID to list metrics for'),
      runId: z.string().optional().describe('Optional run ID to list metrics for only that run'),
    }),
  },
  async ({ mlProjectId, runId }, context) => {
    await assertMlProject(context.projectId);
    const metrics = await getMlMetricNames({
      projectId: context.projectId,
      mlProjectId: getDefaultMlProjectId(
        context.pageContext?.ids?.mlProjectId,
        mlProjectId,
      ),
      runId: getDefaultRunId(context.pageContext?.ids?.runId, runId),
    });
    return {
      metrics: metrics.map((item) => item.metric),
    };
  },
);

export const getMlLatestMetricsTool = chatTool(
  {
    name: 'get_ml_latest_metrics',
    description:
      'Get the latest scalar metrics for one ML run. Uses the run summary for current values like learning rate, loss, PSNR, SSIM, accuracy, Dice, IoU, precision, or recall, and can optionally include recent metric points.',
    schema: z.object({
      runId: z.string().optional().describe('The ML run ID to inspect; defaults to the current run'),
      metrics: z
        .array(z.string())
        .max(MAX_METRIC_RUNS)
        .optional()
        .describe('Optional metric names to select, e.g. ["lr", "psnr"]'),
      includeRecentPoints: z
        .boolean()
        .default(false)
        .optional()
        .describe('Include recent ClickHouse points for the selected metrics'),
      recentPointCount: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(5)
        .optional()
        .describe('Number of recent points per selected metric when includeRecentPoints is true'),
    }),
  },
  async ({ runId, metrics, includeRecentPoints, recentPointCount }, context) => {
    await assertMlProject(context.projectId);
    const id = getDefaultRunId(context.pageContext?.ids?.runId, runId);
    if (!id) {
      return { error: 'No ML run ID provided or available in the current view' };
    }

    const run = await getMlRunById({ projectId: context.projectId, id });
    if (!run) {
      return { error: 'ML run not found', runId: id };
    }

    const summary: Record<string, unknown> =
      run.summary && typeof run.summary === 'object' && !Array.isArray(run.summary)
        ? (run.summary as Record<string, unknown>)
        : {};
    const selectedMetrics: string[] = metrics ?? Object.keys(summary);
    const latestMetrics = Object.fromEntries(
      selectedMetrics.map((metric) => [metric, summary[metric] ?? null]),
    );

    const recentPoints: Record<
      string,
      Array<{ run_id: string; step: number; value: number; created_at: string }>
    > = {};
    if (includeRecentPoints) {
      await Promise.all(
        selectedMetrics.map(async (metric) => {
          const series = await getMlMetricSeries({
            projectId: context.projectId,
            runIds: [run.id],
            metric,
          });
          recentPoints[metric] = series.slice(-(recentPointCount ?? 5));
        }),
      );
    }

    return {
      runId: run.id,
      mlProjectId: run.mlProjectId,
      name: run.name,
      status: run.status,
      latestMetrics,
      summary,
      recentPoints: includeRecentPoints ? recentPoints : undefined,
      dashboard_url: dashboardUrl(
        context.organizationId,
        context.projectId,
        mlRunPath(run.mlProjectId, run.id),
      ),
    };
  },
);

export const getMlMetricSeriesTool = chatTool(
  {
    name: 'get_ml_metric_series',
    description:
      'Fetch scalar metric time series for one metric across one or more ML runs. Useful for comparing loss, accuracy, IoU, Dice, precision, recall, PSNR, SSIM, and similar training metrics.',
    schema: z.object({
      runIds: z
        .array(z.string())
        .min(1)
        .max(MAX_METRIC_RUNS)
        .optional()
        .describe('Run IDs to compare, maximum 20. Defaults to the current run when available.'),
      metric: z.string().describe('Metric name to fetch, e.g. loss, accuracy, dice'),
      maxPoints: z
        .number()
        .int()
        .min(1)
        .max(MAX_METRIC_POINTS)
        .default(2_000)
        .optional()
        .describe('Maximum number of points to return after querying'),
    }),
  },
  async ({ runIds, metric, maxPoints }, context) => {
    await assertMlProject(context.projectId);
    const ids = runIds ?? (context.pageContext?.ids?.runId ? [context.pageContext.ids.runId] : []);
    if (ids.length === 0) {
      return { error: 'No ML run IDs provided or available in the current view' };
    }

    const series = await getMlMetricSeries({
      projectId: context.projectId,
      runIds: ids,
      metric,
    });
    return {
      metric,
      runIds: ids,
      points: series.slice(0, maxPoints ?? 2_000),
      truncated: series.length > (maxPoints ?? 2_000),
      totalPoints: series.length,
    };
  },
);

export const listMlImagesTool = chatTool(
  {
    name: 'list_ml_images',
    description:
      'List image artifacts logged for an ML run. Returns image metadata and URLs only, not embedded image bytes.',
    schema: z.object({
      runId: z.string().optional().describe('Run ID to list images for; defaults to the current run'),
      name: z
        .string()
        .optional()
        .describe('Optional image display name filter, e.g. Input, GT, Heatmap'),
      step: z.number().int().nonnegative().optional().describe('Optional training step filter'),
      epoch: z.number().int().nonnegative().optional().describe('Optional epoch filter'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(MAX_IMAGES)
        .default(25)
        .optional()
        .describe('Maximum number of images to return'),
    }),
  },
  async ({ runId, name, step, epoch, limit }, context) => {
    await assertMlProject(context.projectId);
    const id = getDefaultRunId(context.pageContext?.ids?.runId, runId);
    if (!id) {
      return { error: 'No ML run ID provided or available in the current view' };
    }

    const run = await getMlRunById({ projectId: context.projectId, id });
    if (!run) {
      return { error: 'ML run not found', runId: id };
    }

    const images = await listMlImages({
      projectId: context.projectId,
      runId: id,
      name,
      step,
      epoch,
      limit,
    });

    return {
      runId: id,
      dashboard_url: dashboardUrl(
        context.organizationId,
        context.projectId,
        mlRunPath(run.mlProjectId, run.id),
      ),
      images: images.map((image) => ({
        id: image.id,
        name: image.kind,
        step: image.step,
        epoch: image.epoch,
        caption: image.caption,
        filename: image.filename,
        contentType: image.contentType,
        sizeBytes: image.sizeBytes,
        width: image.width,
        height: image.height,
        url: image.url,
        metadata: image.metadata,
        createdAt: image.createdAt,
      })),
    };
  },
);

export const listMlEvaluationRowsTool = chatTool(
  {
    name: 'list_ml_evaluation_rows',
    description:
      'List visual evaluation rows for an ML run. Returns sample IDs, metrics, metadata, image IDs, and pagination; image bytes are intentionally omitted.',
    schema: z.object({
      runId: z.string().optional().describe('Run ID to list evaluation rows for; defaults to the current run'),
      search: z.string().optional().describe('Optional case-insensitive sample ID search'),
      page: z.number().int().positive().default(1).optional(),
      pageSize: z
        .number()
        .int()
        .positive()
        .max(MAX_EVALUATION_ROWS)
        .default(25)
        .optional(),
      sortBy: z
        .enum(['createdAt', 'sampleId', 'step', 'epoch'])
        .default('createdAt')
        .optional(),
      sortDirection: z.enum(['asc', 'desc']).default('desc').optional(),
    }),
  },
  async ({ runId, search, page, pageSize, sortBy, sortDirection }, context) => {
    await assertMlProject(context.projectId);
    const id = getDefaultRunId(context.pageContext?.ids?.runId, runId);
    if (!id) {
      return { error: 'No ML run ID provided or available in the current view' };
    }

    const run = await getMlRunById({ projectId: context.projectId, id });
    if (!run) {
      return { error: 'ML run not found', runId: id };
    }

    const resolvedPage = Math.max(page ?? 1, 1);
    const resolvedPageSize = Math.min(pageSize ?? 25, MAX_EVALUATION_ROWS);
    const where = {
      projectId: context.projectId,
      runId: id,
      ...(search
        ? {
            sampleId: {
              contains: search,
              mode: 'insensitive' as const,
            },
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      db.mlEvaluationRow.findMany({
        where,
        orderBy: getEvaluationRowOrderBy(
          sortBy ?? 'createdAt',
          sortDirection ?? 'desc',
        ),
        skip: (resolvedPage - 1) * resolvedPageSize,
        take: resolvedPageSize,
      }),
      db.mlEvaluationRow.count({ where }),
    ]);

    return {
      runId: id,
      dashboard_url: dashboardUrl(
        context.organizationId,
        context.projectId,
        mlRunPath(run.mlProjectId, run.id),
      ),
      rows,
      metricKeys: getNumericMetricKeys(rows.map((row) => row.metrics)),
      page: resolvedPage,
      pageSize: resolvedPageSize,
      total,
      totalPages: Math.max(Math.ceil(total / resolvedPageSize), 1),
    };
  },
);
