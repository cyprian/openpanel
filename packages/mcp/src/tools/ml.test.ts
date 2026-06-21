import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  db: {
    project: {
      findFirst: vi.fn(),
    },
    mlEvaluationRow: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
  resolveClientProjectId: vi.fn(),
  listMlProjects: vi.fn(),
  getMlProjectById: vi.fn(),
  listMlRuns: vi.fn(),
  getMlRunById: vi.fn(),
  getMlMetricNames: vi.fn(),
  getMlMetricSeries: vi.fn(),
  listMlImages: vi.fn(),
}));

vi.mock('@openpanel/db', () => mocks);

import { registerMlTools } from './ml';

const CTX = {
  projectId: 'project-1',
  organizationId: 'org-1',
  clientType: 'read' as const,
};

function makeServer() {
  const handlers = new Map<string, (input: unknown) => Promise<unknown>>();
  return {
    tool: (
      name: string,
      _desc: string,
      _schema: unknown,
      fn: (input: unknown) => Promise<unknown>,
    ) => {
      handlers.set(name, fn);
    },
    invoke: async (name: string, input: unknown) => {
      const handler = handlers.get(name);
      if (!handler) {
        throw new Error(`Tool not registered: ${name}`);
      }
      const result = (await handler(input)) as any;
      const text = result.content[0].text as string;
      if (result.isError) {
        return { error: text.replace(/^Error:\s*/, '') };
      }
      return JSON.parse(text);
    },
    toolNames: () => [...handlers.keys()],
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.resolveClientProjectId.mockResolvedValue('project-1');
  mocks.db.project.findFirst.mockResolvedValue({
    id: 'project-1',
    types: ['ml'],
  });
});

describe('registerMlTools', () => {
  it('registers the ML MCP read tools', () => {
    const server = makeServer();
    registerMlTools(server as any, CTX);

    expect(server.toolNames()).toEqual([
      'list_ml_projects',
      'get_ml_project',
      'list_ml_runs',
      'get_ml_run',
      'list_ml_metric_names',
      'get_ml_latest_metrics',
      'get_ml_metric_series',
      'list_ml_images',
      'list_ml_evaluation_rows',
    ]);
  });

  it('lists ML projects with dashboard links', async () => {
    const server = makeServer();
    registerMlTools(server as any, CTX);
    mocks.listMlProjects.mockResolvedValue([
      {
        id: 'ml-project-1',
        name: 'iris',
        description: null,
        projectId: 'project-1',
        organizationId: 'org-1',
        archivedAt: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
        _count: { runs: 2 },
      },
    ]);

    const result = await server.invoke('list_ml_projects', {});

    expect(result.projects).toHaveLength(1);
    expect(result.projects[0].dashboard_url).toBe(
      'https://dashboard.openpanel.dev/org-1/project-1/ml/projects/ml-project-1',
    );
  });

  it('returns latest run summary metrics with optional recent points', async () => {
    const server = makeServer();
    registerMlTools(server as any, CTX);
    mocks.getMlRunById.mockResolvedValue({
      id: 'run-1',
      mlProjectId: 'ml-project-1',
      name: 'nafnet baseline',
      status: 'running',
      summary: {
        lr: 0.0001,
        psnr: 31.2,
      },
    });
    mocks.getMlMetricSeries.mockResolvedValue([
      {
        run_id: 'run-1',
        step: 10,
        value: 30.9,
        created_at: '2026-01-01 00:00:00.000',
      },
      {
        run_id: 'run-1',
        step: 20,
        value: 31.2,
        created_at: '2026-01-01 00:01:00.000',
      },
    ]);

    const result = await server.invoke('get_ml_latest_metrics', {
      runId: 'run-1',
      metrics: ['lr', 'psnr'],
      includeRecentPoints: true,
      recentPointCount: 1,
    });

    expect(result.latestMetrics).toEqual({
      lr: 0.0001,
      psnr: 31.2,
    });
    expect(result.recentPoints.lr).toHaveLength(1);
    expect(result.recentPoints.psnr).toHaveLength(1);
  });

  it('omits embedded image data from image listings', async () => {
    const server = makeServer();
    registerMlTools(server as any, CTX);
    mocks.getMlRunById.mockResolvedValue({
      id: 'run-1',
      mlProjectId: 'ml-project-1',
    });
    mocks.listMlImages.mockResolvedValue([
      {
        id: 'image-1',
        kind: 'prediction',
        step: 1,
        epoch: 1,
        caption: 'prediction',
        filename: 'prediction.png',
        contentType: 'image/png',
        sizeBytes: 123,
        width: 10,
        height: 10,
        url: 'ml://local/image-1',
        metadata: {},
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        dataUrl: 'data:image/png;base64,abc',
      },
    ]);

    const result = await server.invoke('list_ml_images', {
      runId: 'run-1',
    });

    expect(result.images[0].url).toBe('ml://local/image-1');
    expect(result.images[0].dataUrl).toBeUndefined();
  });

  it('rejects non-ML projects', async () => {
    const server = makeServer();
    registerMlTools(server as any, CTX);
    mocks.db.project.findFirst.mockResolvedValue({
      id: 'project-1',
      types: ['website'],
    });

    const result = await server.invoke('list_ml_projects', {});

    expect(result.error).toBe('Project is not an ML project');
  });
});
