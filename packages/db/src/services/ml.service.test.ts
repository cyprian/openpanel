import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMlRun,
  getMlKeyMetricNamesFromRunColumns,
  getMlMetricDirectionsFromMetadata,
  getMlMetricImprovementDirection,
  getMlRunColumnsWithAddedKeyMetrics,
  getMlRunColumnsWithKeyMetrics,
  getMlRunTags,
  getMlRunTagsFromMetadata,
  hasMlMetricImproved,
  isKeyMetricsOnlyMlRunUpdate,
  logMlMetrics,
  ML_RUN_ERROR_EVENT,
  ML_RUN_KEY_METRIC_IMPROVED_EVENT,
  ML_RUN_STARTED_EVENT,
  updateMlRun,
} from './ml.service';

const mocks = vi.hoisted(() => ({
  bulkAdd: vi.fn(),
  createEvent: vi.fn(),
  checkNotificationRulesForEvent: vi.fn(),
  db: {
    mlProject: {
      findFirstOrThrow: vi.fn(),
      update: vi.fn(),
    },
    mlRun: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('../buffers', () => ({
  mlMetricBuffer: {
    bulkAdd: mocks.bulkAdd,
  },
}));

vi.mock('../clickhouse/client', () => ({
  chQuery: vi.fn(),
  TABLE_NAMES: {},
}));

vi.mock('../prisma-client', () => ({
  db: mocks.db,
}));

vi.mock('./event.service', () => ({
  createEvent: mocks.createEvent,
}));

vi.mock('./notification.service', () => ({
  checkNotificationRulesForEvent: mocks.checkNotificationRulesForEvent,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('isKeyMetricsOnlyMlRunUpdate', () => {
  it('detects key metric-only updates', () => {
    expect(
      isKeyMetricsOnlyMlRunUpdate({
        id: 'run-id',
        projectId: 'project-id',
        keyMetrics: ['loss', 'accuracy'],
      })
    ).toBe(true);
  });

  it('treats real run edits as updated run data', () => {
    expect(
      isKeyMetricsOnlyMlRunUpdate({
        id: 'run-id',
        projectId: 'project-id',
        keyMetrics: ['loss'],
        status: 'running',
      })
    ).toBe(false);
    expect(
      isKeyMetricsOnlyMlRunUpdate({
        id: 'run-id',
        projectId: 'project-id',
        name: 'Experiment 1',
      })
    ).toBe(false);
  });
});

describe('getMlKeyMetricNamesFromRunColumns', () => {
  it('extracts metric columns and ignores standard columns', () => {
    expect(
      getMlKeyMetricNamesFromRunColumns([
        'apiSource',
        'metric:loss',
        'accuracy',
        'tags',
        'metric:loss',
      ])
    ).toEqual(['loss', 'accuracy']);
  });
});

describe('getMlRunColumnsWithKeyMetrics', () => {
  it('preserves standard columns and replaces metric columns', () => {
    expect(
      getMlRunColumnsWithKeyMetrics(
        ['tags', 'metric:loss', 'accuracy', 'apiSource'],
        ['loss', 'dice', 'loss']
      )
    ).toEqual(['tags', 'apiSource', 'metric:loss', 'metric:dice']);
  });
});

describe('getMlRunColumnsWithAddedKeyMetrics', () => {
  it('adds new key metric columns without removing existing columns', () => {
    expect(
      getMlRunColumnsWithAddedKeyMetrics(
        ['tags', 'metric:loss', 'apiSource'],
        ['loss', 'accuracy', 'dice']
      )
    ).toEqual([
      'tags',
      'metric:loss',
      'apiSource',
      'metric:accuracy',
      'metric:dice',
    ]);
  });
});

describe('getMlRunTags', () => {
  it('uses explicit run tags when present', () => {
    expect(getMlRunTags(['manual'], { tags: ['sdk'] })).toEqual(['manual']);
  });

  it('falls back to tags embedded in SDK metadata', () => {
    expect(getMlRunTags(undefined, { tags: ['baseline', 'mobile'] })).toEqual([
      'baseline',
      'mobile',
    ]);
  });

  it('ignores invalid metadata tags', () => {
    expect(
      getMlRunTagsFromMetadata({ tags: ['baseline', '', 123, null] })
    ).toEqual(['baseline']);
  });
});

describe('getMlMetricDirectionsFromMetadata', () => {
  it('normalizes explicit metric direction metadata', () => {
    expect(
      getMlMetricDirectionsFromMetadata({
        metricDirections: {
          loss: 'down',
          psnr: 'up',
          ignored: 'sideways',
        },
      })
    ).toEqual({
      loss: 'down',
      psnr: 'up',
    });
  });

  it('accepts snake case metadata from local SDK state', () => {
    expect(
      getMlMetricDirectionsFromMetadata({
        metric_directions: {
          lpips: 'lower',
          ssim: 'higher',
        },
      })
    ).toEqual({
      lpips: 'down',
      ssim: 'up',
    });
  });
});

describe('ML metric improvement detection', () => {
  it('treats loss-like metrics as lower-is-better', () => {
    expect(getMlMetricImprovementDirection('val_loss')).toBe('lower');
    expect(
      hasMlMetricImproved({
        metric: 'val_loss',
        previousValue: 0.42,
        value: 0.31,
      })
    ).toBe(true);
  });

  it('treats other metrics as higher-is-better', () => {
    expect(getMlMetricImprovementDirection('accuracy')).toBe('higher');
    expect(
      hasMlMetricImproved({
        metric: 'accuracy',
        previousValue: 0.91,
        value: 0.93,
      })
    ).toBe(true);
  });

  it('uses explicit metric directions over name-based defaults', () => {
    expect(
      getMlMetricImprovementDirection('val_loss', {
        val_loss: 'up',
      })
    ).toBe('higher');
    expect(
      hasMlMetricImproved({
        metric: 'lpips',
        previousValue: 0.3,
        value: 0.2,
        metricDirections: {
          lpips: 'down',
        },
      })
    ).toBe(true);
  });
});

describe('logMlMetrics', () => {
  it('emits an event when a logged key metric improves', async () => {
    const createdAt = new Date('2026-07-02T10:00:00.000Z');
    mocks.db.mlRun.findFirst.mockResolvedValue({
      id: 'run-id',
      mlProjectId: 'ml-project-id',
      name: 'Run 1',
      keyMetrics: ['loss', 'accuracy'],
      metadata: {},
      summary: {
        loss: 0.5,
        accuracy: 0.9,
      },
      status: 'running',
      startedAt: createdAt,
      mlProject: {
        name: 'Compression',
      },
    });
    mocks.db.mlRun.update.mockResolvedValue({});
    mocks.bulkAdd.mockResolvedValue(undefined);
    mocks.createEvent.mockResolvedValue({});
    mocks.checkNotificationRulesForEvent.mockResolvedValue(undefined);

    await logMlMetrics({
      projectId: 'project-id',
      runId: 'run-id',
      metrics: {
        loss: 0.4,
        accuracy: 0.89,
      },
      step: 12,
      epoch: 3,
      createdAt,
    });

    expect(mocks.createEvent).toHaveBeenCalledTimes(1);
    expect(mocks.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: ML_RUN_KEY_METRIC_IMPROVED_EVENT,
        projectId: 'project-id',
        deviceId: 'ml-run:run-id',
        sessionId: 'ml-run:run-id',
        createdAt,
        properties: expect.objectContaining({
          ml_project_id: 'ml-project-id',
          ml_project_name: 'Compression',
          ml_run_id: 'run-id',
          ml_run_name: 'Run 1',
          metric: 'loss',
          value: 0.4,
          previous_value: 0.5,
          improvement_direction: 'lower',
          step: 12,
          epoch: 3,
        }),
      })
    );
    expect(mocks.checkNotificationRulesForEvent).toHaveBeenCalledWith(
      mocks.createEvent.mock.calls[0]?.[0]
    );
  });

  it('emits improved events using explicit metric directions', async () => {
    const createdAt = new Date('2026-07-02T10:30:00.000Z');
    mocks.db.mlRun.findFirst.mockResolvedValue({
      id: 'run-id',
      mlProjectId: 'ml-project-id',
      name: 'Run 1',
      keyMetrics: ['lpips'],
      metadata: {
        metricDirections: {
          lpips: 'down',
        },
      },
      summary: {
        lpips: 0.3,
      },
      status: 'running',
      startedAt: createdAt,
      mlProject: {
        name: 'Compression',
      },
    });
    mocks.db.mlRun.update.mockResolvedValue({});
    mocks.bulkAdd.mockResolvedValue(undefined);
    mocks.createEvent.mockResolvedValue({});
    mocks.checkNotificationRulesForEvent.mockResolvedValue(undefined);

    await logMlMetrics({
      projectId: 'project-id',
      runId: 'run-id',
      metrics: {
        lpips: 0.2,
      },
      step: 13,
      createdAt,
    });

    expect(mocks.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: ML_RUN_KEY_METRIC_IMPROVED_EVENT,
        properties: expect.objectContaining({
          metric: 'lpips',
          value: 0.2,
          previous_value: 0.3,
          improvement_direction: 'lower',
        }),
      })
    );
  });

  it('emits a started event when metrics move a created run to running', async () => {
    const createdAt = new Date('2026-07-02T11:00:00.000Z');
    mocks.db.mlRun.findFirst.mockResolvedValue({
      id: 'run-id',
      mlProjectId: 'ml-project-id',
      name: 'Run 1',
      keyMetrics: [],
      metadata: {},
      summary: {},
      status: 'created',
      startedAt: null,
      mlProject: {
        name: 'Compression',
      },
    });
    mocks.db.mlRun.update.mockResolvedValue({});
    mocks.bulkAdd.mockResolvedValue(undefined);
    mocks.createEvent.mockResolvedValue({});
    mocks.checkNotificationRulesForEvent.mockResolvedValue(undefined);

    await logMlMetrics({
      projectId: 'project-id',
      runId: 'run-id',
      metrics: {
        loss: 0.4,
      },
      createdAt,
    });

    expect(mocks.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: ML_RUN_STARTED_EVENT,
        projectId: 'project-id',
        createdAt,
        properties: expect.objectContaining({
          ml_project_id: 'ml-project-id',
          ml_run_id: 'run-id',
          status: 'running',
          previous_status: 'created',
        }),
      })
    );
  });
});

describe('ML run status events', () => {
  it('stores metric directions in run metadata when creating a run', async () => {
    const startedAt = new Date('2026-07-02T11:30:00.000Z');
    mocks.db.mlProject.findFirstOrThrow.mockResolvedValue({
      organizationId: 'org-id',
      name: 'Compression',
      runColumns: [],
    });
    mocks.db.mlRun.create.mockResolvedValue({
      id: 'run-id',
      projectId: 'project-id',
      mlProjectId: 'ml-project-id',
      name: 'Run 1',
      status: 'running',
      startedAt,
      endedAt: null,
      createdAt: startedAt,
      updatedAt: startedAt,
      tags: [],
      metadata: {
        dataset: 'val',
        metricDirections: {
          psnr: 'up',
          lpips: 'down',
        },
      },
      client: null,
      mlProject: {
        id: 'ml-project-id',
        name: 'Compression',
      },
    });
    mocks.createEvent.mockResolvedValue({});
    mocks.checkNotificationRulesForEvent.mockResolvedValue(undefined);

    await createMlRun({
      projectId: 'project-id',
      mlProjectId: 'ml-project-id',
      name: 'Run 1',
      status: 'running',
      metadata: {
        dataset: 'val',
      },
      metricDirections: {
        psnr: 'up',
        lpips: 'down',
      },
    });

    expect(mocks.db.mlRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: {
            dataset: 'val',
            metricDirections: {
              psnr: 'up',
              lpips: 'down',
            },
          },
        }),
      })
    );
  });

  it('emits a started event when a run is created as running', async () => {
    const startedAt = new Date('2026-07-02T12:00:00.000Z');
    mocks.db.mlProject.findFirstOrThrow.mockResolvedValue({
      organizationId: 'org-id',
      name: 'Compression',
      runColumns: [],
    });
    mocks.db.mlRun.create.mockResolvedValue({
      id: 'run-id',
      projectId: 'project-id',
      mlProjectId: 'ml-project-id',
      name: 'Run 1',
      status: 'running',
      startedAt,
      endedAt: null,
      createdAt: startedAt,
      updatedAt: startedAt,
      tags: [],
      metadata: {},
      client: null,
      mlProject: {
        id: 'ml-project-id',
        name: 'Compression',
      },
    });
    mocks.createEvent.mockResolvedValue({});
    mocks.checkNotificationRulesForEvent.mockResolvedValue(undefined);

    await createMlRun({
      projectId: 'project-id',
      mlProjectId: 'ml-project-id',
      name: 'Run 1',
      status: 'running',
    });

    expect(mocks.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: ML_RUN_STARTED_EVENT,
        projectId: 'project-id',
        createdAt: startedAt,
        properties: expect.objectContaining({
          ml_project_id: 'ml-project-id',
          ml_project_name: 'Compression',
          ml_run_id: 'run-id',
          ml_run_name: 'Run 1',
          status: 'running',
          previous_status: null,
        }),
      })
    );
  });

  it('emits an error event when a run transitions to failed', async () => {
    const updatedAt = new Date('2026-07-02T13:00:00.000Z');
    const endedAt = new Date('2026-07-02T13:05:00.000Z');
    mocks.db.mlRun.findFirst.mockResolvedValue({
      id: 'run-id',
      projectId: 'project-id',
      mlProjectId: 'ml-project-id',
      name: 'Run 1',
      status: 'running',
      startedAt: new Date('2026-07-02T12:00:00.000Z'),
      endedAt: null,
      updatedAt,
      tags: [],
      metadata: {},
      client: null,
      mlProject: {
        id: 'ml-project-id',
        name: 'Compression',
        runColumns: [],
      },
    });
    mocks.db.mlRun.update.mockResolvedValue({
      id: 'run-id',
      projectId: 'project-id',
      mlProjectId: 'ml-project-id',
      name: 'Run 1 failed',
      status: 'failed',
      startedAt: new Date('2026-07-02T12:00:00.000Z'),
      endedAt,
      updatedAt: endedAt,
      tags: [],
      metadata: {},
      client: null,
      mlProject: {
        id: 'ml-project-id',
        name: 'Compression',
        runColumns: [],
      },
    });
    mocks.createEvent.mockResolvedValue({});
    mocks.checkNotificationRulesForEvent.mockResolvedValue(undefined);

    await updateMlRun({
      projectId: 'project-id',
      id: 'run-id',
      status: 'failed',
      name: 'Run 1 failed',
    });

    expect(mocks.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: ML_RUN_ERROR_EVENT,
        projectId: 'project-id',
        createdAt: endedAt,
        properties: expect.objectContaining({
          ml_project_id: 'ml-project-id',
          ml_project_name: 'Compression',
          ml_run_id: 'run-id',
          ml_run_name: 'Run 1 failed',
          status: 'failed',
          previous_status: 'running',
        }),
      })
    );
  });
});
