import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi';
import {
  createRun,
  logEvaluation,
  logImage,
  logMetrics,
  updateRun,
  zCreateMlRun,
  zLogMlEvaluation,
  zLogMlImage,
  zLogMlMetrics,
  zUpdateMlRun,
} from '@/controllers/ml.controller';
import { clientHook } from '@/hooks/client.hook';
import { z } from 'zod';

const params = z.object({
  runId: z.string(),
});

const mlRouter: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  fastify.addHook('preHandler', clientHook);

  fastify.route({
    method: 'POST',
    url: '/runs',
    schema: {
      body: zCreateMlRun.and(
        z.object({
          clientId: z.string().optional(),
          clientSecret: z.string().optional(),
        })
      ),
      tags: ['ML'],
      description: 'Create an ML tracking run.',
    },
    handler: createRun,
  });

  fastify.route({
    method: 'PATCH',
    url: '/runs/:runId',
    schema: {
      params,
      body: zUpdateMlRun,
      tags: ['ML'],
      description: 'Update an ML tracking run.',
    },
    handler: updateRun,
  });

  fastify.route({
    method: 'POST',
    url: '/runs/:runId/log',
    schema: {
      params,
      body: zLogMlMetrics,
      tags: ['ML'],
      description: 'Log scalar metrics for an ML tracking run.',
    },
    handler: logMetrics,
  });

  fastify.route({
    method: 'POST',
    url: '/runs/:runId/images',
    schema: {
      params,
      body: zLogMlImage,
      tags: ['ML'],
      description: 'Log an image for an ML tracking run.',
    },
    handler: logImage,
  });

  fastify.route({
    method: 'POST',
    url: '/runs/:runId/evaluations',
    schema: {
      params,
      body: zLogMlEvaluation,
      tags: ['ML'],
      description: 'Log a visual evaluation table row for an ML tracking run.',
    },
    handler: logEvaluation,
  });
};

export default mlRouter;
