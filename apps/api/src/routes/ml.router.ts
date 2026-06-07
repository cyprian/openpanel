import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi';
import {
  createRun,
  logImage,
  logMetrics,
  updateRun,
  zCreateMlRun,
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
};

export default mlRouter;
