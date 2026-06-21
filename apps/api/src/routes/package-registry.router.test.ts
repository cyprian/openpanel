import { mkdtemp, readFile, rm } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import packageRegistryRouter from './package-registry.router';

const TOKEN = 'test-package-registry-token';

let app: FastifyInstance;
let registryDir: string;
let previousRegistryDir: string | undefined;
let previousToken: string | undefined;

beforeEach(async () => {
  previousRegistryDir = process.env.PACKAGE_REGISTRY_DIR;
  previousToken = process.env.PACKAGE_REGISTRY_TOKEN;
  registryDir = await mkdtemp(path.join(os.tmpdir(), 'openpanel-packages-'));
  process.env.PACKAGE_REGISTRY_DIR = registryDir;
  process.env.PACKAGE_REGISTRY_TOKEN = TOKEN;
  app = Fastify({ logger: false });
  app.register(packageRegistryRouter, { prefix: '/packages' });
  await app.ready();
});

afterEach(async () => {
  await app.close();
  await rm(registryDir, { recursive: true, force: true });
  if (previousRegistryDir === undefined) {
    delete process.env.PACKAGE_REGISTRY_DIR;
  } else {
    process.env.PACKAGE_REGISTRY_DIR = previousRegistryDir;
  }
  if (previousToken === undefined) {
    delete process.env.PACKAGE_REGISTRY_TOKEN;
  } else {
    process.env.PACKAGE_REGISTRY_TOKEN = previousToken;
  }
});

function upload(filename: string, token = TOKEN) {
  return app.inject({
    method: 'PUT',
    url: `/packages/api/openpanel-ml/${filename}`,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/octet-stream',
    },
    payload: Buffer.from('package-bytes'),
  });
}

describe('package registry', () => {
  it('requires a bearer token for uploads', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/packages/api/openpanel-ml/openpanel_ml-0.0.1-py3-none-any.whl',
      headers: {
        'content-type': 'application/octet-stream',
      },
      payload: Buffer.from('package-bytes'),
    });

    expect(res.statusCode).toBe(401);
  });

  it('uploads a package file and serves it from the simple index', async () => {
    const filename = 'openpanel_ml-0.0.1-py3-none-any.whl';
    const uploadRes = await upload(filename);

    expect(uploadRes.statusCode).toBe(201);
    expect(uploadRes.json()).toMatchObject({
      package: 'openpanel-ml',
      filename,
      sizeBytes: 13,
      indexUrl: '/packages/simple/openpanel-ml/',
      fileUrl: `/packages/files/openpanel-ml/${filename}`,
    });
    await expect(
      readFile(path.join(registryDir, 'openpanel-ml', filename), 'utf8')
    ).resolves.toBe('package-bytes');

    const indexRes = await app.inject({
      method: 'GET',
      url: '/packages/simple/openpanel-ml/',
    });
    expect(indexRes.statusCode).toBe(200);
    expect(indexRes.headers['content-type']).toContain('text/html');
    expect(indexRes.body).toContain(
      `../../files/openpanel-ml/${filename}`
    );

    const downloadRes = await app.inject({
      method: 'GET',
      url: `/packages/files/openpanel-ml/${filename}`,
    });
    expect(downloadRes.statusCode).toBe(200);
    expect(downloadRes.headers['content-type']).toContain('application/zip');
    expect(downloadRes.body).toBe('package-bytes');
  });

  it('normalizes package names for pip-compatible lookups', async () => {
    const filename = 'openpanel_ml-0.0.1.tar.gz';
    await upload(filename);

    const res = await app.inject({
      method: 'GET',
      url: '/packages/simple/OpenPanel_ML/',
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain(filename);
  });

  it('rejects unsafe distribution filenames', async () => {
    const res = await upload('openpanel_ml-0.0.1.txt');

    expect(res.statusCode).toBe(400);
  });
});
