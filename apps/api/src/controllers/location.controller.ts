import { getCountry } from '@openpanel/constants';
import { getGeoLocation } from '@openpanel/geo';
import type { FastifyReply, FastifyRequest } from 'fastify';

const EU_COUNTRY_CODES = new Set([
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IE',
  'IT',
  'LV',
  'LT',
  'LU',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SK',
  'SI',
  'ES',
  'SE',
]);

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
  const countryCode = geo.country ?? null;

  return reply.send({
    country: countryCode ? (getCountry(countryCode) ?? null) : null,
    country_code: countryCode,
    is_eu: countryCode ? EU_COUNTRY_CODES.has(countryCode) : false,
  });
}
