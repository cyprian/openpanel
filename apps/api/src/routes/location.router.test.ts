import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@openpanel/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@openpanel/db')>();
  return { ...actual, getClientByIdCached: vi.fn() };
});

vi.mock('@openpanel/common/server', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@openpanel/common/server')>();
  return { ...actual, verifyPassword: vi.fn().mockResolvedValue(true) };
});

vi.mock('@openpanel/redis', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@openpanel/redis')>();
  return {
    ...actual,
    getCache: async <T>(_key: string, _ttl: number, fn: () => Promise<T>) =>
      fn(),
  };
});

vi.mock('@openpanel/geo', () => ({
  getGeoLocation: vi.fn().mockResolvedValue({
    country: 'US',
    city: undefined,
    region: undefined,
    latitude: undefined,
    longitude: undefined,
  }),
}));

import { ClientType, getClientByIdCached } from '@openpanel/db';
import { getGeoLocation } from '@openpanel/geo';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app';

const CLIENT_ID = '00000000-0000-0000-0000-000000000099';
const CLIENT_SECRET = 'test-secret';
const PROJECT_ID = 'project-id';
const ORGANIZATION_ID = 'organization-id';

const AUTH = {
  'openpanel-client-id': CLIENT_ID,
  'openpanel-client-secret': CLIENT_SECRET,
  'x-forwarded-for': '8.8.8.8',
};

const createClient = (enableLocationLookup: boolean) => ({
  id: CLIENT_ID,
  type: ClientType.write,
  projectId: PROJECT_ID,
  organizationId: ORGANIZATION_ID,
  secret: 'hashed-secret',
  name: 'Mobile client',
  ignoreCorsAndSecret: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  project: {
    id: PROJECT_ID,
    name: 'Mobile app',
    organizationId: ORGANIZATION_ID,
    eventsCount: 0,
    types: [],
    domain: null,
    cors: [],
    crossDomain: false,
    allowUnsafeRevenueTracking: false,
    enableLocationLookup,
    filters: [],
    deleteAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
});

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp({ testing: true });
  await app.ready();
}, 30_000);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getClientByIdCached).mockResolvedValue(createClient(true) as any);
  vi.mocked(getGeoLocation).mockResolvedValue({
    country: 'US',
    city: undefined,
    region: undefined,
    latitude: undefined,
    longitude: undefined,
  });
});

afterAll(async () => {
  await app.close();
}, 10_000);

function getLocation(headers: Record<string, string> = AUTH) {
  return app.inject({ method: 'GET', url: '/location', headers });
}

describe('GET /location', () => {
  it('returns 401 when no client id is present', async () => {
    const res = await getLocation({
      'openpanel-client-secret': CLIENT_SECRET,
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 401 when client id is not a valid UUID', async () => {
    const res = await getLocation({
      'openpanel-client-id': 'not-a-uuid',
      'openpanel-client-secret': CLIENT_SECRET,
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 401 when client secret is missing', async () => {
    const res = await getLocation({
      'openpanel-client-id': CLIENT_ID,
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 403 when location lookup is not enabled for the project', async () => {
    vi.mocked(getClientByIdCached).mockResolvedValue(createClient(false) as any);

    const res = await getLocation();

    expect(res.statusCode).toBe(403);
    expect(getGeoLocation).not.toHaveBeenCalled();
  });

  it('returns the request country when enabled', async () => {
    const res = await getLocation();

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ country: 'US' });
    expect(getGeoLocation).toHaveBeenCalledWith('8.8.8.8');
  });

  it('returns null when the request country cannot be resolved', async () => {
    vi.mocked(getGeoLocation).mockResolvedValue({
      country: undefined,
      city: undefined,
      region: undefined,
      latitude: undefined,
      longitude: undefined,
    });

    const res = await getLocation();

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ country: null });
  });
});
