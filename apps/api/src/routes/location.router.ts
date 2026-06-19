import { Prisma } from '@openpanel/db';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi';
import { z } from 'zod';
import * as controller from '@/controllers/location.controller';
import { validateLocationRequest } from '@/utils/auth';
import { activateRateLimiter } from '@/utils/rate-limiter';

const TAGS = ['Location'] as const;

const locationRouter: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  await activateRateLimiter({ fastify, max: 60, timeWindow: '1 minute' });

  fastify.addHook('preHandler', async (req: FastifyRequest, reply) => {
    try {
      const client = await validateLocationRequest(req.headers);
      req.client = client;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        return reply.status(401).send({ error: 'Unauthorized', message: 'Client ID seems to be malformed' });
      }
      if (e instanceof Error) {
        return reply.status(401).send({ error: 'Unauthorized', message: e.message });
      }
      return reply.status(401).send({ error: 'Unauthorized', message: 'Unexpected error' });
    }
  });

  fastify.route({
    method: 'GET',
    url: '/',
    schema: {
      tags: TAGS,
      description: 'Resolve the current request IP address to country metadata.',
      response: {
        200: z.object({
          country: z.string().nullable(),
          country_code: z.string().nullable(),
          is_eu: z.boolean(),
        }),
      },
    },
    handler: controller.lookupLocation,
  });
};

export default locationRouter;
