import { createHash, timingSafeEqual } from 'node:crypto';
import {
  mkdir,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import * as path from 'node:path';
import type { FastifyPluginCallback, FastifyReply, FastifyRequest } from 'fastify';

const DEFAULT_PACKAGE_REGISTRY_DIR = '/var/lib/openpanel/packages';
const PACKAGE_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DISTRIBUTION_FILENAME_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9._+!-]*(?:\.whl|\.tar\.gz)$/;

type PackageParams = {
  packageName: string;
};

type FileParams = PackageParams & {
  filename: string;
};

const packageRegistryRouter: FastifyPluginCallback = async (fastify) => {
  fastify.addContentTypeParser(
    'application/octet-stream',
    { parseAs: 'buffer' },
    (_request, body, done) => done(null, body)
  );

  fastify.get('/simple', async (_request, reply) => {
    const packages = await listPackages();
    return sendHtml(
      reply,
      'OpenPanel Package Index',
      packages
        .map((packageName) => `<a href="./${packageName}/">${packageName}</a>`)
        .join('\n')
    );
  });

  fastify.get('/simple/', async (_request, reply) => {
    const packages = await listPackages();
    return sendHtml(
      reply,
      'OpenPanel Package Index',
      packages
        .map((packageName) => `<a href="./${packageName}/">${packageName}</a>`)
        .join('\n')
    );
  });

  fastify.get<{
    Params: PackageParams;
  }>('/simple/:packageName', async (request, reply) => {
    return sendPackageIndex(request, reply);
  });

  fastify.get<{
    Params: PackageParams;
  }>('/simple/:packageName/', async (request, reply) => {
    return sendPackageIndex(request, reply);
  });

  fastify.get<{
    Params: FileParams;
  }>('/files/:packageName/:filename', async (request, reply) => {
    const packageName = normalizePackageName(request.params.packageName);
    const filename = validateDistributionFilename(request.params.filename);
    const filePath = getDistributionPath(packageName, filename);

    try {
      await stat(filePath);
    } catch {
      return reply.status(404).send({ message: 'Package file not found' });
    }

    return reply
      .header('Content-Type', getDistributionContentType(filename))
      .header('Cache-Control', 'public, max-age=31536000, immutable')
      .send(createReadStream(filePath));
  });

  fastify.put<{
    Params: FileParams;
    Body: Buffer;
  }>('/api/:packageName/:filename', async (request, reply) => {
    authenticateUpload(request);
    const packageName = normalizePackageName(request.params.packageName);
    const filename = validateDistributionFilename(request.params.filename);
    const body = request.body;

    if (!Buffer.isBuffer(body) || body.length === 0) {
      return reply.status(400).send({ message: 'Package file body is required' });
    }

    const packageDir = getPackagePath(packageName);
    await mkdir(packageDir, { recursive: true });
    const filePath = getDistributionPath(packageName, filename);
    const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmpPath, body);
    try {
      await rename(tmpPath, filePath);
    } catch (error) {
      await rm(tmpPath, { force: true });
      throw error;
    }

    return reply.status(201).send({
      package: packageName,
      filename,
      sizeBytes: body.length,
      sha256: createHash('sha256').update(body).digest('hex'),
      indexUrl: `/packages/simple/${packageName}/`,
      fileUrl: `/packages/files/${packageName}/${filename}`,
    });
  });
};

async function sendPackageIndex(
  request: FastifyRequest<{ Params: PackageParams }>,
  reply: FastifyReply
) {
  const packageName = normalizePackageName(request.params.packageName);
  const files = await listDistributionFiles(packageName);
  if (files.length === 0) {
    return reply.status(404).send({ message: 'Package not found' });
  }

  return sendHtml(
    reply,
    `Links for ${packageName}`,
    files
      .map((filename) => {
        const escapedFilename = escapeHtml(filename);
        return `<a href="../../files/${packageName}/${encodeURIComponent(filename)}">${escapedFilename}</a>`;
      })
      .join('\n')
  );
}

async function listPackages() {
  const root = getRegistryRoot();
  try {
    const entries = await readdir(root, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => PACKAGE_NAME_PATTERN.test(name))
      .sort();
  } catch {
    return [];
  }
}

async function listDistributionFiles(packageName: string) {
  try {
    const entries = await readdir(getPackagePath(packageName), {
      withFileTypes: true,
    });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((filename) => DISTRIBUTION_FILENAME_PATTERN.test(filename))
      .sort();
  } catch {
    return [];
  }
}

function authenticateUpload(request: FastifyRequest) {
  const token = process.env.PACKAGE_REGISTRY_TOKEN;
  if (!token) {
    throw Object.assign(new Error('Package registry upload is not configured'), {
      statusCode: 503,
    });
  }

  const authorization = request.headers.authorization ?? '';
  const provided = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : '';
  if (!constantTimeEqual(provided, token)) {
    throw Object.assign(new Error('Invalid package registry token'), {
      statusCode: 401,
    });
  }
}

function constantTimeEqual(value: string, expected: string) {
  const valueBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);
  return (
    valueBuffer.length === expectedBuffer.length &&
    timingSafeEqual(valueBuffer, expectedBuffer)
  );
}

function getRegistryRoot() {
  return path.resolve(
    process.env.PACKAGE_REGISTRY_DIR || DEFAULT_PACKAGE_REGISTRY_DIR
  );
}

function getPackagePath(packageName: string) {
  return getSafePath(getRegistryRoot(), packageName);
}

function getDistributionPath(packageName: string, filename: string) {
  return getSafePath(getPackagePath(packageName), filename);
}

function getSafePath(root: string, segment: string) {
  const resolvedRoot = path.resolve(root);
  const resolvedPath = path.resolve(resolvedRoot, segment);
  const relativePath = path.relative(resolvedRoot, resolvedPath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw Object.assign(new Error('Invalid package registry path'), {
      statusCode: 400,
    });
  }
  return resolvedPath;
}

function normalizePackageName(packageName: string) {
  const normalized = packageName.toLowerCase().replace(/[-_.]+/g, '-');
  if (!PACKAGE_NAME_PATTERN.test(normalized)) {
    throw Object.assign(new Error('Invalid package name'), { statusCode: 400 });
  }
  return normalized;
}

function validateDistributionFilename(filename: string) {
  if (
    filename !== path.basename(filename) ||
    !DISTRIBUTION_FILENAME_PATTERN.test(filename)
  ) {
    throw Object.assign(new Error('Invalid distribution filename'), {
      statusCode: 400,
    });
  }
  return filename;
}

function sendHtml(reply: FastifyReply, title: string, body: string) {
  return reply
    .header('Content-Type', 'text/html; charset=utf-8')
    .send(`<!doctype html>
<html>
  <head>
    <title>${escapeHtml(title)}</title>
  </head>
  <body>
${body}
  </body>
</html>
`);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getDistributionContentType(filename: string) {
  if (filename.endsWith('.whl')) {
    return 'application/zip';
  }
  return 'application/gzip';
}

export default packageRegistryRouter;
