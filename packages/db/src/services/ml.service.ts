import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sqlstring from 'sqlstring';
import { chQuery, TABLE_NAMES } from '../clickhouse/client';
import { db } from '../prisma-client';
import { mlMetricBuffer } from '../buffers';

export type MlRunSummary = Record<string, number>;

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
      name: input.name,
      description: input.description,
    },
  });
}

export async function resolveMlProject(input: {
  projectId: string;
  name: string;
  description?: string | null;
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
    },
    create: {
      projectId: input.projectId,
      organizationId: project.organizationId,
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
}) {
  const project = await getMlProjectById(input);
  if (!project) {
    throw new Error('ML project not found');
  }

  return db.mlProject.update({
    where: {
      id: input.id,
    },
    data: {
      name: input.name,
      description: input.description,
    },
  });
}

export async function archiveMlProject(input: {
  id: string;
  projectId: string;
}) {
  const project = await getMlProjectById(input);
  if (!project) {
    throw new Error('ML project not found');
  }

  return db.mlProject.update({
    where: {
      id: input.id,
    },
    data: {
      archivedAt: new Date(),
    },
  });
}

export async function listMlRuns(input: {
  projectId: string;
  mlProjectId?: string;
}) {
  return db.mlRun.findMany({
    where: {
      projectId: input.projectId,
      mlProjectId: input.mlProjectId,
      archivedAt: null,
    },
    include: {
      mlProject: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
}

export async function getMlRunById(input: {
  id: string;
  projectId: string;
}) {
  return db.mlRun.findFirst({
    where: {
      id: input.id,
      projectId: input.projectId,
      archivedAt: null,
    },
    include: {
      mlProject: true,
    },
  });
}

export async function createMlRun(input: {
  projectId: string;
  mlProjectId: string;
  name?: string;
  status?: string;
  notes?: string | null;
  tags?: string[];
  config?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}) {
  const mlProject = await db.mlProject.findFirstOrThrow({
    where: {
      id: input.mlProjectId,
      projectId: input.projectId,
      archivedAt: null,
    },
    select: {
      organizationId: true,
    },
  });

  return db.mlRun.create({
    data: {
      projectId: input.projectId,
      organizationId: mlProject.organizationId,
      mlProjectId: input.mlProjectId,
      name: input.name ?? `Run ${new Date().toISOString()}`,
      status: input.status ?? 'created',
      startedAt: input.status === 'running' ? new Date() : undefined,
      notes: input.notes,
      tags: input.tags ?? [],
      config: input.config ?? {},
      metadata: input.metadata ?? {},
      summary: {},
    },
    include: {
      mlProject: true,
    },
  });
}

export async function updateMlRun(input: {
  id: string;
  projectId: string;
  name?: string;
  status?: string;
  notes?: string | null;
  tags?: string[];
  config?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}) {
  const run = await getMlRunById(input);
  if (!run) {
    throw new Error('ML run not found');
  }

  const endedAt =
    input.status && ['finished', 'failed', 'crashed'].includes(input.status)
      ? new Date()
      : undefined;
  const startedAt =
    input.status === 'running' && !run.startedAt ? new Date() : undefined;

  return db.mlRun.update({
    where: {
      id: input.id,
    },
    data: {
      name: input.name,
      status: input.status,
      notes: input.notes,
      tags: input.tags,
      config: input.config,
      metadata: input.metadata,
      startedAt,
      endedAt,
    },
    include: {
      mlProject: true,
    },
  });
}

export async function archiveMlRun(input: {
  id: string;
  projectId: string;
}) {
  const run = await getMlRunById(input);
  if (!run) {
    throw new Error('ML run not found');
  }

  return db.mlRun.update({
    where: {
      id: input.id,
    },
    data: {
      archivedAt: new Date(),
    },
  });
}

export async function logMlMetrics(input: {
  projectId: string;
  runId: string;
  metrics: Record<string, number>;
  step?: number;
  epoch?: number | null;
  createdAt?: Date;
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
      summary: true,
      status: true,
      startedAt: true,
    },
  });
  const summary = {
    ...((run.summary ?? {}) as MlRunSummary),
    ...input.metrics,
  };
  const step = input.step ?? Date.now();

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
  ]);

  return {
    accepted: Object.keys(input.metrics).length,
    step,
  };
}

export async function getMlMetricNames(input: {
  projectId: string;
  runId?: string;
}) {
  const where = [
    `project_id = ${sqlstring.escape(input.projectId)}`,
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
  kind: string;
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
      kind: input.kind,
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
  kind?: string;
  step?: number;
  epoch?: number;
  limit?: number;
}) {
  return db.mlImage.findMany({
    where: {
      projectId: input.projectId,
      runId: input.runId,
      kind: input.kind,
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
  kind?: string;
  step?: number;
  epoch?: number;
  limit?: number;
}) {
  const images = await listMlImages(input);

  return Promise.all(
    images.map(async (image) => {
      if (image.storageProvider !== ML_IMAGE_STORAGE_PROVIDER_LOCAL) {
        return {
          ...image,
          dataUrl: image.url,
        };
      }

      try {
        const buffer = await readFile(getMlImageStoragePath(image.storageKey));
        return {
          ...image,
          dataUrl: `data:${image.contentType};base64,${buffer.toString('base64')}`,
        };
      } catch {
        return {
          ...image,
          dataUrl: '',
        };
      }
    })
  );
}
