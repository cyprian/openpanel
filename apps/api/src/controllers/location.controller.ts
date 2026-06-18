import { getGeoLocation } from '@openpanel/geo';
import type { FastifyReply, FastifyRequest } from 'fastify';

export async function lookupLocation(
  request: FastifyRequest,
  reply: FastifyReply
) {
  if (!request.client?.project?.enableLocationLookup) {
    return reply.status(403).send({
      error: 'Forbidden',
      message: 'Location lookup is not enabled for this project',
    });
  }

  const geo = await getGeoLocation(request.clientIp);

  return reply.send({
    country: geo.country ?? null,
  });
}
