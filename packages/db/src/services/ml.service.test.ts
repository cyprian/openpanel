import { describe, expect, it, vi } from 'vitest';
import {
  getMlKeyMetricNamesFromRunColumns,
  getMlRunColumnsWithKeyMetrics,
  isKeyMetricsOnlyMlRunUpdate,
} from './ml.service';

vi.mock('../buffers', () => ({
  mlMetricBuffer: {},
}));

vi.mock('../clickhouse/client', () => ({
  chQuery: vi.fn(),
  TABLE_NAMES: {},
}));

vi.mock('../prisma-client', () => ({
  db: {},
}));

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
