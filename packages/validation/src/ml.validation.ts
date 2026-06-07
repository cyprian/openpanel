import { z } from 'zod';

export const zMlRunStatus = z.enum([
  'created',
  'running',
  'finished',
  'failed',
  'crashed',
]);

export const zMlProjectCreate = z.object({
  projectId: z.string(),
  name: z.string().min(1),
  description: z.string().nullish(),
});

export const zMlProjectUpdate = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string().min(1).optional(),
  description: z.string().nullish(),
});

export const zMlRunCreate = z.object({
  projectId: z.string(),
  mlProjectId: z.string(),
  name: z.string().min(1).optional(),
  status: zMlRunStatus.default('created'),
  notes: z.string().nullish(),
  tags: z.array(z.string().min(1)).default([]),
  config: z.record(z.string(), z.unknown()).default({}),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const zMlRunUpdate = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string().min(1).optional(),
  status: zMlRunStatus.optional(),
  notes: z.string().nullish(),
  tags: z.array(z.string().min(1)).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const zMlMetricLog = z.object({
  step: z.number().int().nonnegative().optional(),
  epoch: z.number().int().nonnegative().nullish(),
  timestamp: z.string().datetime().optional(),
  metrics: z.record(z.string().min(1), z.number().finite()),
});

export type IMlRunStatus = z.infer<typeof zMlRunStatus>;
export type IMlMetricLog = z.infer<typeof zMlMetricLog>;
