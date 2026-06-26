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
  runColumns: z.array(z.string().min(1)).optional(),
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
  keyMetrics: z.array(z.string().min(1)).optional(),
});

export const zMlMetricLog = z.object({
  step: z.number().int().nonnegative().optional(),
  epoch: z.number().int().nonnegative().nullish(),
  timestamp: z.string().datetime().optional(),
  metrics: z.record(z.string().min(1), z.number().finite()),
});

export const zMlImageName = z.string().trim().min(1).max(80);

export const zMlImageLog = z.object({
  name: zMlImageName,
  step: z.number().int().nonnegative().optional(),
  epoch: z.number().int().nonnegative().nullish(),
  caption: z.string().nullish(),
  filename: z.string().min(1).optional(),
  contentType: z.enum(['image/png', 'image/jpeg', 'image/webp']).optional(),
  image: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const zMlEvaluationImage = z.object({
  name: zMlImageName,
  image: z.string().min(1),
  filename: z.string().min(1).optional(),
  contentType: z.enum(['image/png', 'image/jpeg', 'image/webp']).optional(),
  caption: z.string().nullish(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const zMlEvaluationLog = z.object({
  sampleId: z.string().min(1).nullish(),
  step: z.number().int().nonnegative().optional(),
  epoch: z.number().int().nonnegative().nullish(),
  metrics: z.record(z.string().min(1), z.number().finite()).default({}),
  metadata: z.record(z.string(), z.unknown()).default({}),
  images: z.array(zMlEvaluationImage).default([]),
});

export type IMlRunStatus = z.infer<typeof zMlRunStatus>;
export type IMlMetricLog = z.infer<typeof zMlMetricLog>;
export type IMlImageName = z.infer<typeof zMlImageName>;
export type IMlImageLog = z.infer<typeof zMlImageLog>;
export type IMlEvaluationLog = z.infer<typeof zMlEvaluationLog>;
