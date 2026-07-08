import { readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import sqlstring from 'sqlstring';
import {
  ch,
  chQuery,
  getReplicatedTableName,
  TABLE_NAMES,
} from '../clickhouse/client';
import { db } from '../prisma-client';
import { mlMetricBuffer } from '../buffers';
import { createEvent } from './event.service';
import { checkNotificationRulesForEvent } from './notification.service';

export type MlRunSummary = Record<string, number>;
export type MlMetricPerformanceDirection = 'up' | 'down';
export type MlMetricDirections = Record<string, MlMetricPerformanceDirection>;

type MlRunUpdateInput = {
  id: string;
  projectId: string;
  name?: string;
  status?: string;
  notes?: string | null;
  tags?: string[];
  config?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  keyMetrics?: string[];
  metricDirections?: MlMetricDirections;
};

const ML_RUN_COLUMN_METRIC_PREFIX = 'metric:';
const ML_STANDARD_RUN_COLUMNS = new Set(['apiSource', 'tags']);
const LOWER_IS_BETTER_ML_METRIC_PATTERNS = [
  /(^|[_\s/.-])loss($|[_\s/.-])/i,
  /(^|[_\s/.-])error($|[_\s/.-])/i,
  /(^|[_\s/.-])err($|[_\s/.-])/i,
  /(^|[_\s/.-])mae($|[_\s/.-])/i,
  /(^|[_\s/.-])mse($|[_\s/.-])/i,
  /(^|[_\s/.-])rmse($|[_\s/.-])/i,
  /(^|[_\s/.-])mape($|[_\s/.-])/i,
  /(^|[_\s/.-])nll($|[_\s/.-])/i,
  /(^|[_\s/.-])perplexity($|[_\s/.-])/i,
  /(^|[_\s/.-])ppl($|[_\s/.-])/i,
  /(^|[_\s/.-])wer($|[_\s/.-])/i,
  /(^|[_\s/.-])cer($|[_\s/.-])/i,
  /(^|[_\s/.-])latency($|[_\s/.-])/i,
  /(^|[_\s/.-])duration($|[_\s/.-])/i,
  /(^|[_\s/.-])time($|[_\s/.-])/i,
  /(^|[_\s/.-])cost($|[_\s/.-])/i,
];

export const ML_RUN_KEY_METRIC_IMPROVED_EVENT =
  'ml_run_key_metric_improved';
export const ML_RUN_CREATED_EVENT = 'ml_run_created';
export const ML_RUN_STARTED_EVENT = 'ml_run_started';
export const ML_RUN_FINISHED_EVENT = 'ml_run_finished';
export const ML_RUN_ERROR_EVENT = 'ml_run_error';

export const ML_IMAGE_STORAGE_PROVIDER_LOCAL = 'local';
export const ML_IMAGE_STORAGE_ROOT =
  process.env.ML_STORAGE_DIR || '/var/lib/openpanel/ml';

export function getMlImageStoragePath(storageKey: string) {
  const storageRoot = path.resolve(ML_IMAGE_STORAGE_ROOT);
  const filePath = path.resolve(storageRoot, storageKey);
  const relativePath = path.relative(storageRoot, filePath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error('Invalid ML image storage key');
  }

  return filePath;
}

export async function listMlProjects(projectId: string) {
  return db.mlProject.findMany({
    where: {
      projectId,
      archivedAt: null,
    },
    include: {
      client: {
        select: {
          id: true,
          name: true,
        },
      },
      _count: {
        select: {
          runs: true,
        },
      },
    },
    orderBy: {
      updatedAt: 'desc',
    },
  });
}

export async function getMlProjectById(input: {
  id: string;
  projectId: string;
}) {
  return db.mlProject.findFirst({
    where: {
      id: input.id,
      projectId: input.projectId,
      archivedAt: null,
    },
  });
}

export async function createMlProject(input: {
  projectId: string;
  name: string;
  description?: string | null;
  clientId?: string | null;
}) {
  const project = await db.project.findUniqueOrThrow({
    where: {
      id: input.projectId,
    },
    select: {
      organizationId: true,
    },
  });

  return db.mlProject.create({
    data: {
      projectId: input.projectId,
      organizationId: project.organizationId,
      clientId: input.clientId,
      name: input.name,
      description: input.description,
    },
  });
}

export async function resolveMlProject(input: {
  projectId: string;
  name: string;
  description?: string | null;
  clientId?: string | null;
}) {
  const project = await db.project.findUniqueOrThrow({
    where: {
      id: input.projectId,
    },
    select: {
      organizationId: true,
    },
  });

  return db.mlProject.upsert({
    where: {
      projectId_name: {
        projectId: input.projectId,
        name: input.name,
      },
    },
    update: {
      archivedAt: null,
      description: input.description ?? undefined,
      clientId: input.clientId ?? undefined,
    },
    create: {
      projectId: input.projectId,
      organizationId: project.organizationId,
      clientId: input.clientId,
      name: input.name,
      description: input.description,
    },
  });
}

export async function updateMlProject(input: {
  id: string;
  projectId: string;
  name?: string;
  description?: string | null;
  runColumns?: string[];
}) {
  const project = await getMlProjectById(input);
  if (!project) {
    throw new Error('ML project not found');
  }

  const updatedProject = await db.mlProject.update({
    where: {
      id: input.id,
    },
    data: {
      name: input.name,
      description: input.description,
      runColumns: input.runColumns,
    },
  });

  if (input.runColumns !== undefined) {
    await syncMlProjectRunKeyMetrics({
      projectId: input.projectId,
      mlProjectId: input.id,
      keyMetrics: getMlKeyMetricNamesFromRunColumns(input.runColumns),
    });
  }

  return updatedProject;
}

export async function archiveMlProject(input: {
  id: string;
  projectId: string;
}) {
  const project = await getMlProjectById(input);
  if (!project) {
    throw new Error('ML project not found');
  }

  const localImages = await listLocalMlImageStorageKeys({
    projectId: input.projectId,
    mlProjectId: input.id,
  });

  await db.mlProject.delete({
    where: {
      id: input.id,
    },
  });

  await deleteMlMetricPoints({
    projectId: input.projectId,
    mlProjectId: input.id,
  });
  await deleteLocalMlImageFiles(localImages);

  return project;
}

export async function listMlRuns(input: {
  projectId: string;
  mlProjectId?: string;
  limit?: number;
}) {
  const runs = await db.mlRun.findMany({
    where: {
      projectId: input.projectId,
      mlProjectId: input.mlProjectId,
      archivedAt: null,
    },
    include: {
      client: {
        select: {
          id: true,
          name: true,
        },
      },
      mlProject: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: input.limit,
  });

  return runs.map(withMlRunDisplayTags);
}

async function listLocalMlImageStorageKeys(input: {
  projectId: string;
  mlProjectId?: string;
  runId?: string;
  runIds?: string[];
}) {
  const images = await db.mlImage.findMany({
    where: {
      projectId: input.projectId,
      mlProjectId: input.mlProjectId,
      runId: input.runId,
      ...(input.runIds ? { runId: { in: input.runIds } } : {}),
      storageProvider: ML_IMAGE_STORAGE_PROVIDER_LOCAL,
    },
    select: {
      storageKey: true,
    },
  });

  return images.map((image) => image.storageKey);
}

async function deleteMlMetricPoints(input: {
  projectId: string;
  mlProjectId?: string;
  runId?: string;
  runIds?: string[];
}) {
  const where = [
    `project_id = ${sqlstring.escape(input.projectId)}`,
    input.mlProjectId
      ? `ml_project_id = ${sqlstring.escape(input.mlProjectId)}`
      : '',
    input.runId ? `run_id = ${sqlstring.escape(input.runId)}` : '',
    input.runIds?.length
      ? `run_id IN (${input.runIds.map((id) => sqlstring.escape(id)).join(', ')})`
      : '',
  ].filter(Boolean);

  await ch.command({
    query: `DELETE FROM ${getReplicatedTableName(
      TABLE_NAMES.ml_metric_points
    )} WHERE ${where.join(' AND ')}`,
    clickhouse_settings: {
      lightweight_deletes_sync: '0',
    },
  });
}

async function deleteLocalMlImageFiles(storageKeys: string[]) {
  for (const storageKey of storageKeys) {
    try {
      await unlink(getMlImageStoragePath(storageKey));
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        continue;
      }
      console.error('Failed to delete ML image file', { storageKey, error });
    }
  }
}

export async function getMlRunById(input: {
  id: string;
  projectId: string;
}) {
  const run = await db.mlRun.findFirst({
    where: {
      id: input.id,
      projectId: input.projectId,
      archivedAt: null,
    },
    include: {
      client: {
        select: {
          id: true,
          name: true,
        },
      },
      mlProject: true,
    },
  });

  return run ? withMlRunDisplayTags(run) : null;
}

export async function createMlRun(input: {
  projectId: string;
  mlProjectId: string;
  clientId?: string | null;
  name?: string;
  status?: string;
  notes?: string | null;
  tags?: string[];
  config?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  keyMetrics?: string[];
  metricDirections?: MlMetricDirections;
}) {
  const mlProject = await db.mlProject.findFirstOrThrow({
    where: {
      id: input.mlProjectId,
      projectId: input.projectId,
      archivedAt: null,
    },
    select: {
      organizationId: true,
      name: true,
      runColumns: true,
    },
  });
  const keyMetrics = getUniqueStrings(input.keyMetrics ?? []);
  const metricDirections =
    input.metricDirections === undefined
      ? undefined
      : normalizeMlMetricDirections(input.metricDirections);
  const metadata = getMlRunMetadata(input.metadata, metricDirections);

  if (keyMetrics.length > 0) {
    const runColumns = getMlRunColumnsWithAddedKeyMetrics(
      mlProject.runColumns,
      keyMetrics
    );

    if (!areStringArraysEqual(runColumns, mlProject.runColumns)) {
      await db.mlProject.update({
        where: {
          id: input.mlProjectId,
        },
        data: {
          runColumns,
        },
      });
    }
  }

  const run = await db.mlRun.create({
    data: {
      projectId: input.projectId,
      organizationId: mlProject.organizationId,
      clientId: input.clientId,
      mlProjectId: input.mlProjectId,
      name: input.name ?? `Run ${new Date().toISOString()}`,
      status: input.status ?? 'created',
      startedAt: input.status === 'running' ? new Date() : undefined,
      notes: input.notes,
      tags: getMlRunTags(input.tags, metadata),
      config: input.config ?? {},
      metadata,
      keyMetrics,
      summary: {},
    },
    include: {
      client: {
        select: {
          id: true,
          name: true,
        },
      },
      mlProject: true,
    },
  });

  await emitMlRunStatusEvent({
    projectId: input.projectId,
    mlProjectId: input.mlProjectId,
    mlProjectName: mlProject.name,
    runId: run.id,
    runName: run.name,
    status: run.status,
    previousStatus: null,
    createdAt: getMlRunStatusEventCreatedAt(run),
  }).catch(() => null);

  return run;
}

export function getMlRunTags(
  tags: string[] | undefined,
  metadata: Record<string, unknown> | undefined
) {
  return tags?.length ? tags : getMlRunTagsFromMetadata(metadata);
}

export function getMlRunTagsFromMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return [];
  }

  const tags = (metadata as Record<string, unknown>).tags;
  if (!Array.isArray(tags)) {
    return [];
  }

  return tags.filter((tag): tag is string => typeof tag === 'string' && !!tag);
}

export function getMlMetricDirectionsFromMetadata(metadata: unknown) {
  const record = getRecord(metadata);
  return normalizeMlMetricDirections(
    record.metricDirections ??
      record.metric_directions ??
      record.performanceDirections ??
      record.performance_directions
  );
}

function getMlRunMetadata(
  metadata: Record<string, unknown> | undefined,
  metricDirections: MlMetricDirections | undefined
) {
  const base = metadata ?? {};
  if (metricDirections === undefined) {
    return base;
  }

  return {
    ...base,
    metricDirections,
  };
}

function getUpdatedMlRunMetadata(input: {
  currentMetadata: unknown;
  metadata?: Record<string, unknown>;
  metricDirections?: MlMetricDirections;
}) {
  if (input.metadata === undefined && input.metricDirections === undefined) {
    return undefined;
  }

  const metricDirections =
    input.metricDirections === undefined
      ? undefined
      : normalizeMlMetricDirections(input.metricDirections);

  return getMlRunMetadata(
    input.metadata ?? getRecord(input.currentMetadata),
    metricDirections
  );
}

function normalizeMlMetricDirections(value: unknown): MlMetricDirections {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const result: MlMetricDirections = {};
  for (const [metric, direction] of Object.entries(value)) {
    const normalizedDirection = normalizeMlMetricDirection(direction);
    if (metric && normalizedDirection) {
      result[metric] = normalizedDirection;
    }
  }

  return result;
}

function normalizeMlMetricDirection(
  value: unknown
): MlMetricPerformanceDirection | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.toLowerCase();
  if (normalized === 'up' || normalized === 'higher') {
    return 'up';
  }

  if (normalized === 'down' || normalized === 'lower') {
    return 'down';
  }

  return null;
}

function getRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function withMlRunDisplayTags<T extends { tags: string[]; metadata: unknown }>(
  run: T
) {
  if (run.tags.length > 0) {
    return run;
  }

  const tags = getMlRunTagsFromMetadata(run.metadata);
  return tags.length > 0 ? { ...run, tags } : run;
}

export function isKeyMetricsOnlyMlRunUpdate(input: MlRunUpdateInput) {
  return (
    input.keyMetrics !== undefined &&
    input.metricDirections === undefined &&
    input.name === undefined &&
    input.status === undefined &&
    input.notes === undefined &&
    input.tags === undefined &&
    input.config === undefined &&
    input.metadata === undefined
  );
}

export async function updateMlRun(input: MlRunUpdateInput) {
  const run = await getMlRunById(input);
  if (!run) {
    throw new Error('ML run not found');
  }
  const keyMetrics =
    input.keyMetrics === undefined
      ? undefined
      : getUniqueStrings(input.keyMetrics);
  const metadata = getUpdatedMlRunMetadata({
    currentMetadata: run.metadata,
    metadata: input.metadata,
    metricDirections: input.metricDirections,
  });

  const endedAt =
    input.status && ['finished', 'failed', 'crashed'].includes(input.status)
      ? new Date()
      : undefined;
  const startedAt =
    input.status === 'running' && !run.startedAt ? new Date() : undefined;

  const updatedRun = await db.mlRun.update({
    where: {
      id: input.id,
    },
    data: {
      name: input.name,
      status: input.status,
      notes: input.notes,
      tags: input.tags,
      config: input.config,
      metadata,
      keyMetrics,
      startedAt,
      endedAt,
      updatedAt: isKeyMetricsOnlyMlRunUpdate(input)
        ? run.updatedAt
        : undefined,
    },
    include: {
      client: {
        select: {
          id: true,
          name: true,
        },
      },
      mlProject: true,
    },
  });

  if (keyMetrics !== undefined) {
    const runColumns = getMlRunColumnsWithKeyMetrics(
      run.mlProject.runColumns,
      keyMetrics
    );

    if (!areStringArraysEqual(runColumns, run.mlProject.runColumns)) {
      await db.mlProject.update({
        where: {
          id: run.mlProjectId,
        },
        data: {
          runColumns,
        },
      });
    }

    await syncMlProjectRunKeyMetrics({
      projectId: input.projectId,
      mlProjectId: run.mlProjectId,
      keyMetrics,
    });
  }

  if (input.status && input.status !== run.status) {
    await emitMlRunStatusEvent({
      projectId: input.projectId,
      mlProjectId: run.mlProjectId,
      mlProjectName: run.mlProject.name,
      runId: run.id,
      runName: updatedRun.name,
      status: input.status,
      previousStatus: run.status,
      createdAt: getMlRunStatusEventCreatedAt(updatedRun),
    }).catch(() => null);
  }

  return updatedRun;
}

export function getMlKeyMetricNamesFromRunColumns(columns: string[]) {
  const metrics: string[] = [];
  const seen = new Set<string>();

  for (const column of columns) {
    const metric = getMlKeyMetricNameFromRunColumn(column);

    if (metric && !seen.has(metric)) {
      seen.add(metric);
      metrics.push(metric);
    }
  }

  return metrics;
}

function getMlKeyMetricNameFromRunColumn(column: string) {
  if (column.startsWith(ML_RUN_COLUMN_METRIC_PREFIX)) {
    return column.slice(ML_RUN_COLUMN_METRIC_PREFIX.length);
  }

  return ML_STANDARD_RUN_COLUMNS.has(column) ? '' : column;
}

export function getMlRunColumnsWithKeyMetrics(
  columns: string[],
  keyMetrics: string[]
) {
  const standardColumns = columns.filter(
    (column) =>
      ML_STANDARD_RUN_COLUMNS.has(column) &&
      !column.startsWith(ML_RUN_COLUMN_METRIC_PREFIX)
  );
  const metricColumns = getUniqueStrings(keyMetrics).map(
    (metric) => `${ML_RUN_COLUMN_METRIC_PREFIX}${metric}`
  );

  return [...standardColumns, ...metricColumns];
}

export function getMlRunColumnsWithAddedKeyMetrics(
  columns: string[],
  keyMetrics: string[]
) {
  const existingMetricNames = new Set(
    columns.map(getMlKeyMetricNameFromRunColumn).filter(Boolean)
  );
  const addedMetricColumns = getUniqueStrings(keyMetrics)
    .filter((metric) => !existingMetricNames.has(metric))
    .map((metric) => `${ML_RUN_COLUMN_METRIC_PREFIX}${metric}`);

  return [...columns, ...addedMetricColumns];
}

async function syncMlProjectRunKeyMetrics(input: {
  projectId: string;
  mlProjectId: string;
  keyMetrics: string[];
}) {
  const runs = await db.mlRun.findMany({
    where: {
      projectId: input.projectId,
      mlProjectId: input.mlProjectId,
      archivedAt: null,
    },
    select: {
      id: true,
      keyMetrics: true,
      updatedAt: true,
    },
  });
  const keyMetrics = getUniqueStrings(input.keyMetrics);
  const updates = runs
    .filter((run) => !areStringArraysEqual(run.keyMetrics, keyMetrics))
    .map((run) =>
      db.mlRun.update({
        where: {
          id: run.id,
        },
        data: {
          keyMetrics,
          updatedAt: run.updatedAt,
        },
      })
    );

  await Promise.all(updates);
}

function getUniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function areStringArraysEqual(a: string[], b: string[]) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export async function archiveMlRun(input: {
  id: string;
  projectId: string;
}) {
  const run = await getMlRunById(input);
  if (!run) {
    throw new Error('ML run not found');
  }

  const localImages = await listLocalMlImageStorageKeys({
    projectId: input.projectId,
    runId: input.id,
  });

  await db.mlRun.delete({
    where: {
      id: input.id,
    },
  });

  await deleteMlMetricPoints({
    projectId: input.projectId,
    runId: input.id,
  });
  await deleteLocalMlImageFiles(localImages);

  return run;
}

export async function archiveMlRuns(input: {
  ids: string[];
  projectId: string;
}) {
  const ids = getUniqueStrings(input.ids);
  if (ids.length === 0) {
    return [];
  }

  const runs = await db.mlRun.findMany({
    where: {
      id: {
        in: ids,
      },
      projectId: input.projectId,
      archivedAt: null,
    },
  });

  if (runs.length !== ids.length) {
    throw new Error('One or more ML runs were not found');
  }

  const localImages = await listLocalMlImageStorageKeys({
    projectId: input.projectId,
    runIds: ids,
  });

  await db.mlRun.deleteMany({
    where: {
      id: {
        in: ids,
      },
      projectId: input.projectId,
    },
  });

  await deleteMlMetricPoints({
    projectId: input.projectId,
    runIds: ids,
  });
  await deleteLocalMlImageFiles(localImages);

  return runs;
}

export async function logMlMetrics(input: {
  projectId: string;
  runId: string;
  metrics: Record<string, number>;
  step?: number;
  epoch?: number | null;
  createdAt?: Date;
}) {
  const run = await db.mlRun.findFirst({
    where: {
      id: input.runId,
      projectId: input.projectId,
      archivedAt: null,
    },
    select: {
      id: true,
      mlProjectId: true,
      name: true,
      keyMetrics: true,
      metadata: true,
      summary: true,
      status: true,
      startedAt: true,
      mlProject: {
        select: {
          name: true,
        },
      },
    },
  });
  if (!run) {
    throw new Error('ML run not found');
  }

  const previousSummary = (run.summary ?? {}) as MlRunSummary;
  const summary = {
    ...previousSummary,
    ...input.metrics,
  };
  const step = input.step ?? Date.now();
  const metricDirections = getMlMetricDirectionsFromMetadata(run.metadata);
  const improvedKeyMetrics = getImprovedMlRunKeyMetrics({
    keyMetrics: run.keyMetrics,
    previousSummary,
    metrics: input.metrics,
    metricDirections,
  });

  await Promise.all([
    mlMetricBuffer.bulkAdd(
      Object.entries(input.metrics).map(([metric, value]) => ({
        projectId: input.projectId,
        mlProjectId: run.mlProjectId,
        runId: input.runId,
        metric,
        value,
        step,
        epoch: input.epoch,
        createdAt: input.createdAt,
      }))
    ),
    db.mlRun.update({
      where: {
        id: input.runId,
      },
      data: {
        summary,
        status: run.status === 'created' ? 'running' : undefined,
        startedAt: run.startedAt ?? new Date(),
      },
    }),
    emitMlRunKeyMetricImprovedEvents({
      projectId: input.projectId,
      mlProjectId: run.mlProjectId,
      mlProjectName: run.mlProject.name,
      runId: input.runId,
      runName: run.name,
      improvedKeyMetrics,
      step,
      epoch: input.epoch,
      createdAt: input.createdAt,
    }).catch(() => null),
    run.status === 'created'
      ? emitMlRunStatusEvent({
          projectId: input.projectId,
          mlProjectId: run.mlProjectId,
          mlProjectName: run.mlProject.name,
          runId: input.runId,
          runName: run.name,
          status: 'running',
          previousStatus: run.status,
          createdAt: input.createdAt,
        }).catch(() => null)
      : Promise.resolve(),
  ]);

  return {
    accepted: Object.keys(input.metrics).length,
    step,
  };
}

export type MlMetricImprovementDirection = 'higher' | 'lower';

export function getMlMetricImprovementDirection(
  metric: string,
  metricDirections?: MlMetricDirections
): MlMetricImprovementDirection {
  const explicitDirection = metricDirections?.[metric];
  if (explicitDirection === 'down') {
    return 'lower';
  }
  if (explicitDirection === 'up') {
    return 'higher';
  }

  return LOWER_IS_BETTER_ML_METRIC_PATTERNS.some((pattern) =>
    pattern.test(metric)
  )
    ? 'lower'
    : 'higher';
}

export function hasMlMetricImproved(input: {
  metric: string;
  previousValue: number;
  value: number;
  metricDirections?: MlMetricDirections;
}) {
  if (!Number.isFinite(input.previousValue) || !Number.isFinite(input.value)) {
    return false;
  }

  const direction = getMlMetricImprovementDirection(
    input.metric,
    input.metricDirections
  );
  return direction === 'lower'
    ? input.value < input.previousValue
    : input.value > input.previousValue;
}

function getImprovedMlRunKeyMetrics(input: {
  keyMetrics: string[];
  previousSummary: MlRunSummary;
  metrics: Record<string, number>;
  metricDirections: MlMetricDirections;
}) {
  const keyMetrics = new Set(input.keyMetrics);

  return Object.entries(input.metrics).flatMap(([metric, value]) => {
    if (!keyMetrics.has(metric)) {
      return [];
    }

    const previousValue = input.previousSummary[metric];
    if (
      typeof previousValue !== 'number' ||
      !hasMlMetricImproved({
        metric,
        previousValue,
        value,
        metricDirections: input.metricDirections,
      })
    ) {
      return [];
    }

    const direction = getMlMetricImprovementDirection(
      metric,
      input.metricDirections
    );
    const improvement =
      direction === 'lower' ? previousValue - value : value - previousValue;
    const relativeImprovement =
      previousValue === 0 ? null : improvement / Math.abs(previousValue);

    return [
      {
        metric,
        value,
        previousValue,
        direction,
        improvement,
        relativeImprovement,
      },
    ];
  });
}

async function emitMlRunKeyMetricImprovedEvents(input: {
  projectId: string;
  mlProjectId: string;
  mlProjectName: string;
  runId: string;
  runName: string;
  improvedKeyMetrics: ReturnType<typeof getImprovedMlRunKeyMetrics>;
  step: number;
  epoch?: number | null;
  createdAt?: Date;
}) {
  const createdAt = input.createdAt ?? new Date();

  await Promise.all(
    input.improvedKeyMetrics.map(async (metric) => {
      const payload = {
        name: ML_RUN_KEY_METRIC_IMPROVED_EVENT,
        deviceId: `ml-run:${input.runId}`,
        profileId: `ml-run:${input.runId}`,
        projectId: input.projectId,
        sessionId: `ml-run:${input.runId}`,
        path: '',
        origin: '',
        referrer: undefined,
        referrerName: undefined,
        referrerType: undefined,
        createdAt,
        properties: {
          ml_project_id: input.mlProjectId,
          ml_project_name: input.mlProjectName,
          ml_run_id: input.runId,
          ml_run_name: input.runName,
          metric: metric.metric,
          value: metric.value,
          previous_value: metric.previousValue,
          improvement: metric.improvement,
          relative_improvement: metric.relativeImprovement,
          improvement_direction: metric.direction,
          step: input.step,
          epoch: input.epoch ?? null,
        },
        sdkName: 'openpanel-ml',
        sdkVersion: undefined,
        groups: [],
      };

      await Promise.all([
        createEvent(payload),
        checkNotificationRulesForEvent(payload).catch(() => null),
      ]);
    })
  );
}

function getMlRunStatusEventName(status: string) {
  switch (status) {
    case 'created':
      return ML_RUN_CREATED_EVENT;
    case 'running':
      return ML_RUN_STARTED_EVENT;
    case 'finished':
      return ML_RUN_FINISHED_EVENT;
    case 'failed':
    case 'crashed':
      return ML_RUN_ERROR_EVENT;
    default:
      return `ml_run_${status}`;
  }
}

function getMlRunStatusEventCreatedAt(run: {
  status: string;
  startedAt?: Date | null;
  endedAt?: Date | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
}) {
  if (run.status === 'running' && run.startedAt) {
    return run.startedAt;
  }

  if (['finished', 'failed', 'crashed'].includes(run.status) && run.endedAt) {
    return run.endedAt;
  }

  return run.updatedAt ?? run.createdAt ?? new Date();
}

async function emitMlRunStatusEvent(input: {
  projectId: string;
  mlProjectId: string;
  mlProjectName: string;
  runId: string;
  runName: string;
  status: string;
  previousStatus: string | null;
  createdAt?: Date | null;
}) {
  const payload = {
    name: getMlRunStatusEventName(input.status),
    deviceId: `ml-run:${input.runId}`,
    profileId: `ml-run:${input.runId}`,
    projectId: input.projectId,
    sessionId: `ml-run:${input.runId}`,
    path: '',
    origin: '',
    referrer: undefined,
    referrerName: undefined,
    referrerType: undefined,
    createdAt: input.createdAt ?? new Date(),
    properties: {
      ml_project_id: input.mlProjectId,
      ml_project_name: input.mlProjectName,
      ml_run_id: input.runId,
      ml_run_name: input.runName,
      status: input.status,
      previous_status: input.previousStatus,
    },
    sdkName: 'openpanel-ml',
    sdkVersion: undefined,
    groups: [],
  };

  await Promise.all([
    createEvent(payload),
    checkNotificationRulesForEvent(payload).catch(() => null),
  ]);
}

export async function getMlMetricNames(input: {
  projectId: string;
  mlProjectId?: string;
  runId?: string;
}) {
  const where = [
    `project_id = ${sqlstring.escape(input.projectId)}`,
    input.mlProjectId
      ? `ml_project_id = ${sqlstring.escape(input.mlProjectId)}`
      : '',
    input.runId ? `run_id = ${sqlstring.escape(input.runId)}` : '',
  ].filter(Boolean);
  return chQuery<{ metric: string }>(
    `SELECT DISTINCT metric
     FROM ${TABLE_NAMES.ml_metric_points}
     WHERE ${where.join(' AND ')}
     ORDER BY metric ASC`
  );
}

export async function getMlMetricSeries(input: {
  projectId: string;
  runIds: string[];
  metric: string;
}) {
  if (input.runIds.length === 0) {
    return [];
  }
  const runIds = input.runIds.map((id) => sqlstring.escape(id)).join(', ');
  return chQuery<{
    run_id: string;
    step: number;
    value: number;
    created_at: string;
  }>(
    `SELECT run_id, step, value, created_at
     FROM ${TABLE_NAMES.ml_metric_points}
     WHERE project_id = ${sqlstring.escape(input.projectId)}
       AND run_id IN (${runIds})
       AND metric = ${sqlstring.escape(input.metric)}
     ORDER BY step ASC, created_at ASC`
  );
}

export async function createMlImage(input: {
  projectId: string;
  runId: string;
  name: string;
  step?: number;
  epoch?: number | null;
  caption?: string | null;
  filename: string;
  contentType: string;
  sizeBytes: number;
  width?: number | null;
  height?: number | null;
  storageProvider?: string;
  storageKey: string;
  url?: string;
  metadata?: Record<string, unknown>;
}) {
  const run = await db.mlRun.findFirstOrThrow({
    where: {
      id: input.runId,
      projectId: input.projectId,
      archivedAt: null,
    },
    select: {
      id: true,
      mlProjectId: true,
      organizationId: true,
    },
  });

  return db.mlImage.create({
    data: {
      projectId: input.projectId,
      organizationId: run.organizationId,
      mlProjectId: run.mlProjectId,
      runId: run.id,
      kind: input.name,
      step: input.step,
      epoch: input.epoch,
      caption: input.caption,
      filename: input.filename,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      width: input.width,
      height: input.height,
      storageProvider: input.storageProvider ?? ML_IMAGE_STORAGE_PROVIDER_LOCAL,
      storageKey: input.storageKey,
      url: input.url ?? `ml://${input.storageProvider ?? ML_IMAGE_STORAGE_PROVIDER_LOCAL}/${input.storageKey}`,
      metadata: input.metadata ?? {},
    },
  });
}

export async function listMlImages(input: {
  projectId: string;
  runId: string;
  name?: string;
  step?: number;
  epoch?: number;
  limit?: number;
}) {
  return db.mlImage.findMany({
    where: {
      projectId: input.projectId,
      runId: input.runId,
      kind: input.name,
      step: input.step,
      epoch: input.epoch,
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: Math.min(input.limit ?? 60, 100),
  });
}

export async function listMlImagesWithData(input: {
  projectId: string;
  runId: string;
  name?: string;
  step?: number;
  epoch?: number;
  limit?: number;
}) {
  const images = await listMlImages(input);

  return Promise.all(
    images.map(async (image) => {
      if (image.storageProvider !== ML_IMAGE_STORAGE_PROVIDER_LOCAL) {
        return attachMlImageDisplayFields(image, image.url);
      }

      try {
        const buffer = await readFile(getMlImageStoragePath(image.storageKey));
        return attachMlImageDisplayFields(
          image,
          `data:${image.contentType};base64,${buffer.toString('base64')}`
        );
      } catch {
        return attachMlImageDisplayFields(image, '');
      }
    })
  );
}

export async function createMlEvaluationRow(input: {
  projectId: string;
  runId: string;
  sampleId?: string | null;
  step?: number;
  epoch?: number | null;
  imageIds?: string[];
  metrics?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}) {
  const run = await db.mlRun.findFirstOrThrow({
    where: {
      id: input.runId,
      projectId: input.projectId,
      archivedAt: null,
    },
    select: {
      id: true,
      mlProjectId: true,
      organizationId: true,
    },
  });

  return db.mlEvaluationRow.create({
    data: {
      projectId: input.projectId,
      organizationId: run.organizationId,
      mlProjectId: run.mlProjectId,
      runId: run.id,
      sampleId: input.sampleId,
      step: input.step,
      epoch: input.epoch,
      imageIds: input.imageIds ?? [],
      metrics: input.metrics ?? {},
      metadata: input.metadata ?? {},
    },
  });
}

export async function listMlEvaluationRows(input: {
  projectId: string;
  runId: string;
  step?: number;
  search?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
}) {
  const pageSize = Math.min(input.pageSize ?? 25, 100);
  const page = Math.max(input.page ?? 1, 1);
  const where = {
    projectId: input.projectId,
    runId: input.runId,
    step: input.step,
    ...(input.search
      ? {
          sampleId: {
            contains: input.search,
            mode: 'insensitive' as const,
          },
        }
      : {}),
  };
  const orderBy = getEvaluationRowOrderBy(input.sortBy, input.sortDirection);
  const [rows, total] = await Promise.all([
    db.mlEvaluationRow.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.mlEvaluationRow.count({ where }),
  ]);

  const imageIds = [...new Set(rows.flatMap((row) => row.imageIds))];
  const images = imageIds.length
    ? await listMlImagesByIdsWithData({
        projectId: input.projectId,
        runId: input.runId,
        ids: imageIds,
      })
    : [];
  const imagesById = new Map(images.map((image) => [image.id, image]));
  const rowsWithImages = rows.map((row) => ({
    ...row,
    images: row.imageIds
      .map((id) => imagesById.get(id))
      .filter((image): image is NonNullable<typeof image> => !!image),
  }));
  const metricKeys = getUniqueMetricKeys(rows.map((row) => row.metrics));

  return {
    rows: rowsWithImages,
    metricKeys,
    page,
    pageSize,
    total,
    totalPages: Math.max(Math.ceil(total / pageSize), 1),
  };
}

export async function listMlEvaluationSteps(input: {
  projectId: string;
  runId: string;
}) {
  const steps = await db.mlEvaluationRow.groupBy({
    by: ['step'],
    where: {
      projectId: input.projectId,
      runId: input.runId,
      step: {
        not: null,
      },
    },
    _count: {
      _all: true,
    },
    orderBy: {
      step: 'desc',
    },
  });

  return steps.flatMap((step) => {
    if (step.step === null) {
      return [];
    }

    return [
      {
        step: step.step,
        count: step._count._all,
      },
    ];
  });
}

async function listMlImagesByIdsWithData(input: {
  projectId: string;
  runId: string;
  ids: string[];
}) {
  const images = await db.mlImage.findMany({
    where: {
      projectId: input.projectId,
      runId: input.runId,
      id: {
        in: input.ids,
      },
    },
  });

  return Promise.all(
    images.map(async (image) => {
      if (image.storageProvider !== ML_IMAGE_STORAGE_PROVIDER_LOCAL) {
        return attachMlImageDisplayFields(image, image.url);
      }

      try {
        const buffer = await readFile(getMlImageStoragePath(image.storageKey));
        return attachMlImageDisplayFields(
          image,
          `data:${image.contentType};base64,${buffer.toString('base64')}`
        );
      } catch {
        return attachMlImageDisplayFields(image, '');
      }
    })
  );
}

function attachMlImageDisplayFields<T extends { kind: string }>(
  image: T,
  dataUrl: string
) {
  return {
    ...image,
    name: image.kind,
    dataUrl,
  };
}

function getEvaluationRowOrderBy(
  sortBy: string | undefined,
  sortDirection: 'asc' | 'desc' | undefined
) {
  const direction = sortDirection ?? 'desc';
  if (sortBy === 'sampleId') {
    return { sampleId: direction };
  }
  if (sortBy === 'step') {
    return { step: direction };
  }
  if (sortBy === 'epoch') {
    return { epoch: direction };
  }

  return { createdAt: direction };
}

function getUniqueMetricKeys(values: unknown[]) {
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
