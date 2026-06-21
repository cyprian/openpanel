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
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpAuthContext } from '../auth';
import { dashboardBaseUrl } from './dashboard-links';
import { projectIdSchema, resolveProjectId, withErrorHandling } from './shared';

const MAX_RUNS = 100;
const MAX_METRIC_RUNS = 20;
const MAX_METRIC_POINTS = 5_000;
const MAX_EVALUATION_ROWS = 100;
const MAX_IMAGES = 100;

function mlBaseUrl(organizationId: string, projectId: string) {
  return `${dashboardBaseUrl()}/${organizationId}/${projectId}/ml`;
}

function mlProjectUrl(
  organizationId: string,
  projectId: string,
  mlProjectId: string,
) {
  return `${mlBaseUrl(organizationId, projectId)}/projects/${mlProjectId}`;
}

function mlRunUrl(
  organizationId: string,
  projectId: string,
  mlProjectId: string,
  runId: string,
) {
  return `${mlProjectUrl(organizationId, projectId, mlProjectId)}/runs/${runId}`;
}

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

export function registerMlTools(server: McpServer, context: McpAuthContext) {
  server.tool(
    'list_ml_projects',
    'List ML experiment projects for an OpenPanel project. Returns ML project IDs, names, descriptions, run counts, timestamps, and dashboard links.',
    {
      projectId: projectIdSchema(context),
    },
    async ({ projectId: inputProjectId }) =>
      withErrorHandling(async () => {
        const projectId = await resolveProjectId(context, inputProjectId);
        await assertMlProject(projectId);
        const projects = await listMlProjects(projectId);
        return {
          projects: projects.map((project) => ({
            ...project,
            dashboard_url: mlProjectUrl(context.organizationId, projectId, project.id),
          })),
        };
      }),
  );

  server.tool(
    'get_ml_project',
    'Get one ML experiment project by ID, including metadata and dashboard link.',
    {
      projectId: projectIdSchema(context),
      mlProjectId: z.string().describe('The ML project ID to look up'),
    },
    async ({ projectId: inputProjectId, mlProjectId }) =>
      withErrorHandling(async () => {
        const projectId = await resolveProjectId(context, inputProjectId);
        await assertMlProject(projectId);
        const project = await getMlProjectById({ projectId, id: mlProjectId });
        if (!project) {
          return { error: 'ML project not found', mlProjectId };
        }

        return {
          ...project,
          dashboard_url: mlProjectUrl(context.organizationId, projectId, project.id),
        };
      }),
  );

  server.tool(
    'list_ml_runs',
    'List ML tracking runs. Optionally filter by ML project, status, or tag. Returns run summaries, configs, metadata, timestamps, and dashboard links.',
    {
      projectId: projectIdSchema(context),
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
    },
    async ({ projectId: inputProjectId, mlProjectId, status, tag, limit }) =>
      withErrorHandling(async () => {
        const projectId = await resolveProjectId(context, inputProjectId);
        await assertMlProject(projectId);
        const runs = await listMlRuns({ projectId, mlProjectId });
        const filtered = runs
          .filter((run) => !status || run.status === status)
          .filter((run) => !tag || run.tags.includes(tag))
          .slice(0, limit ?? 25);

        return {
          runs: filtered.map((run) => ({
            ...run,
            dashboard_url: mlRunUrl(
              context.organizationId,
              projectId,
              run.mlProjectId,
              run.id,
            ),
          })),
        };
      }),
  );

  server.tool(
    'get_ml_run',
    'Get a specific ML run by ID, including project, status, tags, config, metadata, summary metrics, timestamps, and dashboard link.',
    {
      projectId: projectIdSchema(context),
      runId: z.string().describe('The ML run ID to look up'),
    },
    async ({ projectId: inputProjectId, runId }) =>
      withErrorHandling(async () => {
        const projectId = await resolveProjectId(context, inputProjectId);
        await assertMlProject(projectId);
        const run = await getMlRunById({ projectId, id: runId });
        if (!run) {
          return { error: 'ML run not found', runId };
        }

        return {
          ...run,
          dashboard_url: mlRunUrl(
            context.organizationId,
            projectId,
            run.mlProjectId,
            run.id,
          ),
        };
      }),
  );

  server.tool(
    'list_ml_metric_names',
    'List scalar metric names logged for ML runs. Use this before requesting metric series.',
    {
      projectId: projectIdSchema(context),
      runId: z.string().optional().describe('Optional run ID to list metrics for only that run'),
    },
    async ({ projectId: inputProjectId, runId }) =>
      withErrorHandling(async () => {
        const projectId = await resolveProjectId(context, inputProjectId);
        await assertMlProject(projectId);
        const metrics = await getMlMetricNames({ projectId, runId });
        return {
          metrics: metrics.map((item) => item.metric),
        };
      }),
  );

  server.tool(
    'get_ml_latest_metrics',
    'Get the latest scalar metrics for one ML run. Uses the run summary for current values like learning rate, loss, PSNR, SSIM, accuracy, or Dice, and can optionally include recent metric points.',
    {
      projectId: projectIdSchema(context),
      runId: z.string().describe('The ML run ID to inspect'),
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
    },
    async ({
      projectId: inputProjectId,
      runId,
      metrics,
      includeRecentPoints,
      recentPointCount,
    }) =>
      withErrorHandling(async () => {
        const projectId = await resolveProjectId(context, inputProjectId);
        await assertMlProject(projectId);
        const run = await getMlRunById({ projectId, id: runId });
        if (!run) {
          return { error: 'ML run not found', runId };
        }

        const summary =
          run.summary && typeof run.summary === 'object' && !Array.isArray(run.summary)
            ? run.summary
            : {};
        const selectedMetrics = metrics ?? Object.keys(summary);
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
                projectId,
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
          dashboard_url: mlRunUrl(
            context.organizationId,
            projectId,
            run.mlProjectId,
            run.id,
          ),
        };
      }),
  );

  server.tool(
    'get_ml_metric_series',
    'Fetch scalar metric time series for one metric across one or more ML runs. Useful for plotting loss, accuracy, IoU, Dice, precision, recall, and similar training metrics.',
    {
      projectId: projectIdSchema(context),
      runIds: z
        .array(z.string())
        .min(1)
        .max(MAX_METRIC_RUNS)
        .describe('Run IDs to compare, maximum 20'),
      metric: z.string().describe('Metric name to fetch, e.g. loss, accuracy, dice'),
      maxPoints: z
        .number()
        .int()
        .min(1)
        .max(MAX_METRIC_POINTS)
        .default(2_000)
        .optional()
        .describe('Maximum number of points to return after querying'),
    },
    async ({ projectId: inputProjectId, runIds, metric, maxPoints }) =>
      withErrorHandling(async () => {
        const projectId = await resolveProjectId(context, inputProjectId);
        await assertMlProject(projectId);
        const series = await getMlMetricSeries({ projectId, runIds, metric });
        return {
          metric,
          runIds,
          points: series.slice(0, maxPoints ?? 2_000),
          truncated: series.length > (maxPoints ?? 2_000),
          totalPoints: series.length,
        };
      }),
  );

  server.tool(
    'list_ml_images',
    'List image artifacts logged for an ML run. Returns image metadata and URLs only, not embedded image bytes.',
    {
      projectId: projectIdSchema(context),
      runId: z.string().describe('Run ID to list images for'),
      kind: z
        .enum(['input', 'ground_truth', 'prediction', 'error_map'])
        .optional()
        .describe('Optional image kind filter'),
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
    },
    async ({ projectId: inputProjectId, runId, kind, step, epoch, limit }) =>
      withErrorHandling(async () => {
        const projectId = await resolveProjectId(context, inputProjectId);
        await assertMlProject(projectId);
        const run = await getMlRunById({ projectId, id: runId });
        if (!run) {
          return { error: 'ML run not found', runId };
        }

        const images = await listMlImages({
          projectId,
          runId,
          kind,
          step,
          epoch,
          limit,
        });

        return {
          runId,
          dashboard_url: mlRunUrl(
            context.organizationId,
            projectId,
            run.mlProjectId,
            run.id,
          ),
          images: images.map((image) => ({
            id: image.id,
            kind: image.kind,
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
      }),
  );

  server.tool(
    'list_ml_evaluation_rows',
    'List visual evaluation rows for an ML run. Returns sample IDs, metrics, metadata, image IDs, and pagination; image bytes are intentionally omitted.',
    {
      projectId: projectIdSchema(context),
      runId: z.string().describe('Run ID to list evaluation rows for'),
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
    },
    async ({
      projectId: inputProjectId,
      runId,
      search,
      page,
      pageSize,
      sortBy,
      sortDirection,
    }) =>
      withErrorHandling(async () => {
        const projectId = await resolveProjectId(context, inputProjectId);
        await assertMlProject(projectId);
        const run = await getMlRunById({ projectId, id: runId });
        if (!run) {
          return { error: 'ML run not found', runId };
        }

        const resolvedPage = Math.max(page ?? 1, 1);
        const resolvedPageSize = Math.min(pageSize ?? 25, MAX_EVALUATION_ROWS);
        const where = {
          projectId,
          runId,
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
          runId,
          dashboard_url: mlRunUrl(
            context.organizationId,
            projectId,
            run.mlProjectId,
            run.id,
          ),
          rows,
          metricKeys: getNumericMetricKeys(rows.map((row) => row.metrics)),
          page: resolvedPage,
          pageSize: resolvedPageSize,
          total,
          totalPages: Math.max(Math.ceil(total / resolvedPageSize), 1),
        };
      }),
  );
}
