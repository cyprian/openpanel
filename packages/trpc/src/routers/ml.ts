import {
  archiveMlProject,
  archiveMlRun,
  createMlProject,
  createMlRun,
  getMlMetricNames,
  getMlMetricSeries,
  getMlProjectById,
  getMlRunById,
  listMlImagesWithData,
  listMlProjects,
  listMlRuns,
  logMlMetrics,
  updateMlProject,
  updateMlRun,
} from '@openpanel/db';
import {
  zMlMetricLog,
  zMlProjectCreate,
  zMlProjectUpdate,
  zMlRunCreate,
  zMlRunUpdate,
} from '@openpanel/validation';
import { z } from 'zod';
import { TRPCNotFoundError } from '../errors';
import { createTRPCRouter, protectedProcedure } from '../trpc';

export const mlRouter = createTRPCRouter({
  projects: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(({ input }) => listMlProjects(input.projectId)),

  project: protectedProcedure
    .input(z.object({ id: z.string(), projectId: z.string() }))
    .query(async ({ input }) => {
      const project = await getMlProjectById(input);
      if (!project) {
        throw new TRPCNotFoundError('ML project not found');
      }
      return project;
    }),

  createProject: protectedProcedure
    .input(zMlProjectCreate)
    .mutation(({ input }) => createMlProject(input)),

  updateProject: protectedProcedure
    .input(zMlProjectUpdate)
    .mutation(({ input }) => updateMlProject(input)),

  archiveProject: protectedProcedure
    .input(z.object({ id: z.string(), projectId: z.string() }))
    .mutation(({ input }) => archiveMlProject(input)),

  runs: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        mlProjectId: z.string().optional(),
      })
    )
    .query(({ input }) => listMlRuns(input)),

  run: protectedProcedure
    .input(z.object({ id: z.string(), projectId: z.string() }))
    .query(async ({ input }) => {
      const run = await getMlRunById(input);
      if (!run) {
        throw new TRPCNotFoundError('ML run not found');
      }
      return run;
    }),

  createRun: protectedProcedure
    .input(zMlRunCreate)
    .mutation(({ input }) => createMlRun(input)),

  updateRun: protectedProcedure
    .input(zMlRunUpdate)
    .mutation(({ input }) => updateMlRun(input)),

  archiveRun: protectedProcedure
    .input(z.object({ id: z.string(), projectId: z.string() }))
    .mutation(({ input }) => archiveMlRun(input)),

  logMetrics: protectedProcedure
    .input(
      zMlMetricLog.extend({
        projectId: z.string(),
        runId: z.string(),
      })
    )
    .mutation(({ input }) =>
      logMlMetrics({
        projectId: input.projectId,
        runId: input.runId,
        metrics: input.metrics,
        step: input.step,
        epoch: input.epoch,
        createdAt: input.timestamp ? new Date(input.timestamp) : undefined,
      })
    ),

  metricNames: protectedProcedure
    .input(z.object({ projectId: z.string(), runId: z.string().optional() }))
    .query(({ input }) => getMlMetricNames(input)),

  metricSeries: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        runIds: z.array(z.string()).default([]),
        metric: z.string(),
      })
    )
    .query(({ input }) => getMlMetricSeries(input)),

  images: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        runId: z.string(),
        kind: z.string().optional(),
        limit: z.number().int().positive().max(100).default(60),
      })
    )
    .query(({ input }) => listMlImagesWithData(input)),
});
