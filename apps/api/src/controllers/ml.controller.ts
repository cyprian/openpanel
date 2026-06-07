import {
  createMlRun,
  getMlRunById,
  logMlMetrics,
  resolveMlProject,
  updateMlRun,
} from '@openpanel/db';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { HttpError } from '@/utils/errors';

export const zCreateMlRun = z.object({
  project: z.string().min(1),
  name: z.string().min(1).optional(),
  notes: z.string().nullish(),
  tags: z.array(z.string().min(1)).default([]),
  config: z.record(z.string(), z.unknown()).default({}),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const zUpdateMlRun = z.object({
  name: z.string().min(1).optional(),
  status: z
    .enum(['created', 'running', 'finished', 'failed', 'crashed'])
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
  });
  const run = await createMlRun({
    projectId: project.id,
    mlProjectId: mlProject.id,
    name: request.body.name,
    status: 'running',
    notes: request.body.notes,
    tags: request.body.tags,
    config: request.body.config,
    metadata: request.body.metadata,
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
  const result = await logMlMetrics({
    projectId: project.id,
    runId: request.params.runId,
    metrics: request.body.metrics,
    step: request.body.step,
    epoch: request.body.epoch,
    createdAt: request.body.timestamp ? new Date(request.body.timestamp) : undefined,
  });

  return reply.status(202).send(result);
}
