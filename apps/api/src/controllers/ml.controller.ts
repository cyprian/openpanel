import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  createMlEvaluationRow,
  createMlImage,
  createMlRun,
  getMlImageStoragePath,
  getMlRunById,
  logMlMetrics,
  resolveMlProject,
  updateMlRun,
} from '@openpanel/db';
import { zMlEvaluationLog, zMlImageLog } from '@openpanel/validation';
import type { FastifyReply, FastifyRequest } from 'fastify';
import sharp from 'sharp';
import { z } from 'zod';
import { HttpError } from '@/utils/errors';

const ML_IMAGE_MAX_BYTES = Number.parseInt(
  process.env.ML_IMAGE_MAX_BYTES ?? `${10 * 1024 * 1024}`,
  10
);
const DATA_URL_PATTERN = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/i;

export const zCreateMlRun = z.object({
  project: z.string().min(1),
  name: z.string().min(1).optional(),
  notes: z.string().nullish(),
  tags: z.array(z.string().min(1)).default([]),
  config: z.record(z.string(), z.unknown()).default({}),
  metadata: z.record(z.string(), z.unknown()).default({}),
  keyMetrics: z.array(z.string().min(1)).optional(),
});

export const zUpdateMlRun = z.object({
  name: z.string().min(1).optional(),
  status: z
    .enum(['created', 'running', 'finished', 'failed', 'crashed', 'completed'])
    .transform((status) => (status === 'completed' ? 'finished' : status))
    .optional(),
  notes: z.string().nullish(),
  tags: z.array(z.string().min(1)).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const zLogMlMetrics = z.object({
  step: z.number().int().nonnegative().optional(),
  epoch: z.number().int().nonnegative().nullish(),
  timestamp: z.string().datetime().optional(),
  metrics: z.record(z.string().min(1), z.number().finite()),
});

export const zLogMlImage = zMlImageLog;
export const zLogMlEvaluation = zMlEvaluationLog;

function getClientProject(request: FastifyRequest) {
  const project = request.client?.project;
  if (!project) {
    throw new HttpError('Missing project', { status: 400 });
  }
  if (!project.types.includes('ml')) {
    throw new HttpError('Client is not attached to an ML project', {
      status: 400,
    });
  }
  return project;
}

export async function createRun(
  request: FastifyRequest<{ Body: z.infer<typeof zCreateMlRun> }>,
  reply: FastifyReply
) {
  const project = getClientProject(request);
  const mlProject = await resolveMlProject({
    projectId: project.id,
    name: request.body.project,
    clientId: request.client?.id,
  });
  const run = await createMlRun({
    projectId: project.id,
    mlProjectId: mlProject.id,
    clientId: request.client?.id,
    name: request.body.name,
    status: 'running',
    notes: request.body.notes,
    tags: request.body.tags,
    config: request.body.config,
    metadata: request.body.metadata,
    keyMetrics: request.body.keyMetrics,
  });

  return reply.status(201).send({
    id: run.id,
    projectId: project.id,
    mlProjectId: mlProject.id,
    name: run.name,
    status: run.status,
  });
}

export async function updateRun(
  request: FastifyRequest<{
    Params: { runId: string };
    Body: z.infer<typeof zUpdateMlRun>;
  }>,
  reply: FastifyReply
) {
  const project = getClientProject(request);
  const run = await getMlRunById({
    projectId: project.id,
    id: request.params.runId,
  });
  if (!run) {
    throw new HttpError('Run not found', { status: 404 });
  }

  const updated = await updateMlRun({
    projectId: project.id,
    id: request.params.runId,
    ...request.body,
  });

  return reply.status(200).send({
    id: updated.id,
    status: updated.status,
  });
}

export async function logMetrics(
  request: FastifyRequest<{
    Params: { runId: string };
    Body: z.infer<typeof zLogMlMetrics>;
  }>,
  reply: FastifyReply
) {
  const project = getClientProject(request);
  const run = await getMlRunById({
    projectId: project.id,
    id: request.params.runId,
  });
  if (!run) {
    throw new HttpError('Run not found', { status: 404 });
  }

  const result = await logMlMetrics({
    projectId: project.id,
    runId: run.id,
    metrics: request.body.metrics,
    step: request.body.step,
    epoch: request.body.epoch,
    createdAt: request.body.timestamp ? new Date(request.body.timestamp) : undefined,
  });

  return reply.status(202).send(result);
}

export async function logImage(
  request: FastifyRequest<{
    Params: { runId: string };
    Body: z.infer<typeof zLogMlImage>;
  }>,
  reply: FastifyReply
) {
  const project = getClientProject(request);
  const run = await getMlRunById({
    projectId: project.id,
    id: request.params.runId,
  });
  if (!run) {
    throw new HttpError('Run not found', { status: 404 });
  }

  const image = await persistMlImage({
    projectId: project.id,
    run,
    name: request.body.name,
    image: request.body,
    step: request.body.step,
    epoch: request.body.epoch,
  });

  return reply.status(202).send({
    id: image.id,
    name: image.kind,
    step: image.step,
    epoch: image.epoch,
    width: image.width,
    height: image.height,
    sizeBytes: image.sizeBytes,
  });
}

export async function logEvaluation(
  request: FastifyRequest<{
    Params: { runId: string };
    Body: z.infer<typeof zLogMlEvaluation>;
  }>,
  reply: FastifyReply
) {
  const project = getClientProject(request);
  const run = await getMlRunById({
    projectId: project.id,
    id: request.params.runId,
  });
  if (!run) {
    throw new HttpError('Run not found', { status: 404 });
  }

  const images: Awaited<ReturnType<typeof createMlImage>>[] = [];
  for (const image of request.body.images) {
    images.push(
      await persistMlImage({
        projectId: project.id,
        run,
        name: image.name,
        image,
        step: request.body.step,
        epoch: request.body.epoch,
      })
    );
  }

  const row = await createMlEvaluationRow({
    projectId: project.id,
    runId: run.id,
    sampleId: request.body.sampleId,
    step: request.body.step,
    epoch: request.body.epoch,
    imageIds: images.map((image) => image.id),
    metrics: request.body.metrics,
    metadata: request.body.metadata,
  });

  return reply.status(202).send({
    id: row.id,
    sampleId: row.sampleId,
    step: row.step,
    epoch: row.epoch,
    metrics: row.metrics,
    imageIds: row.imageIds,
  });
}

async function persistMlImage({
  projectId,
  run,
  name,
  image,
  step,
  epoch,
}: {
  projectId: string;
  run: NonNullable<Awaited<ReturnType<typeof getMlRunById>>>;
  name: string;
  image: {
    name: string;
    image: string;
    filename?: string;
    contentType?: string;
    caption?: string | null;
    metadata?: Record<string, unknown>;
  };
  step?: number;
  epoch?: number | null;
}) {
  const decoded = decodeImagePayload(image);
  const imageMetadata = await readImageMetadata(decoded.buffer);
  const filename = getSafeImageFilename(image.filename, decoded.contentType);
  const storageKey = path.posix.join(
    'images',
    projectId,
    run.mlProjectId,
    run.id,
    `${randomUUID()}-${filename}`
  );
  const filePath = getMlImageStoragePath(storageKey);

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, decoded.buffer);

  return createMlImage({
    projectId,
    runId: run.id,
    name,
    step,
    epoch,
    caption: image.caption,
    filename,
    contentType: decoded.contentType,
    sizeBytes: decoded.buffer.byteLength,
    width: imageMetadata.width,
    height: imageMetadata.height,
    storageKey,
    metadata: image.metadata,
  });
}

function decodeImagePayload(input: {
  image: string;
  contentType?: string;
}) {
  const match = input.image.match(DATA_URL_PATTERN);
  const contentType = match?.[1] ?? input.contentType;
  const encoded = match?.[2] ?? input.image;
  if (!contentType) {
    throw new HttpError('Missing image content type', { status: 400 });
  }
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(contentType)) {
    throw new HttpError('Unsupported image content type', { status: 400 });
  }

  const buffer = Buffer.from(encoded, 'base64');
  if (buffer.byteLength === 0) {
    throw new HttpError('Image payload is empty', { status: 400 });
  }
  if (buffer.byteLength > ML_IMAGE_MAX_BYTES) {
    throw new HttpError('Image payload exceeds the configured size limit', {
      status: 413,
    });
  }

  return {
    buffer,
    contentType,
  };
}

async function readImageMetadata(buffer: Buffer) {
  try {
    const metadata = await sharp(buffer).metadata();
    if (!['png', 'jpeg', 'webp'].includes(metadata.format ?? '')) {
      throw new HttpError('Unsupported image format', { status: 400 });
    }

    return {
      width: metadata.width,
      height: metadata.height,
    };
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
    throw new HttpError('Invalid image payload', { status: 400 });
  }
}

function getSafeImageFilename(filename: string | undefined, contentType: string) {
  const fallback = `image.${contentType.split('/')[1] ?? 'png'}`;
  const selected = filename?.trim() || fallback;
  const withoutPath = selected.split(/[\\/]/).at(-1) ?? fallback;
  return withoutPath.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || fallback;
}
