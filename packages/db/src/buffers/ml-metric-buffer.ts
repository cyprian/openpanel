import { getRedisCache, type Redis } from '@openpanel/redis';
import { ch, TABLE_NAMES } from '../clickhouse/client';
import { BaseBuffer } from './base-buffer';

export type IMlMetricBufferInput = {
  projectId: string;
  mlProjectId: string;
  runId: string;
  metric: string;
  value: number;
  step: number;
  epoch?: number | null;
  createdAt?: Date;
};

type IMlMetricBufferEntry = {
  project_id: string;
  ml_project_id: string;
  run_id: string;
  metric: string;
  value: number;
  step: number;
  epoch: number | null;
  created_at: string;
  logged_at: string;
};

export class MlMetricBuffer extends BaseBuffer {
  private batchSize = process.env.ML_METRIC_BUFFER_BATCH_SIZE
    ? Number.parseInt(process.env.ML_METRIC_BUFFER_BATCH_SIZE, 10)
    : 1000;
  private chunkSize = process.env.ML_METRIC_BUFFER_CHUNK_SIZE
    ? Number.parseInt(process.env.ML_METRIC_BUFFER_CHUNK_SIZE, 10)
    : 1000;
  private readonly redisKey = 'ml-metric-buffer';
  private redis: Redis;

  constructor() {
    super({
      name: 'mlMetric',
      onFlush: async () => {
        await this.processBuffer();
      },
    });
    this.redis = getRedisCache();
  }

  async add(input: IMlMetricBufferInput): Promise<void> {
    return this.timeAdd(async () => {
      const now = new Date();
      const entry: IMlMetricBufferEntry = {
        project_id: input.projectId,
        ml_project_id: input.mlProjectId,
        run_id: input.runId,
        metric: input.metric,
        value: input.value,
        step: input.step,
        epoch: input.epoch ?? null,
        created_at: (input.createdAt ?? now).toISOString(),
        logged_at: now.toISOString(),
      };

      const result = await this.redis
        .multi()
        .rpush(this.redisKey, JSON.stringify(entry))
        .llen(this.redisKey)
        .exec();

      const bufferLength = (result?.[1]?.[1] as number) ?? 0;
      if (bufferLength >= this.batchSize) {
        await this.tryFlush({ trigger: 'add' });
      }
    });
  }

  async bulkAdd(inputs: IMlMetricBufferInput[]): Promise<void> {
    for (const input of inputs) {
      await this.add(input);
    }
  }

  protected getRedisListKey(): string {
    return this.redisKey;
  }

  async processBuffer(): Promise<void> {
    const lrangeStart = performance.now();
    const items = await this.redis.lrange(this.redisKey, 0, this.batchSize - 1);
    const lrangeMs = performance.now() - lrangeStart;

    if (items.length === 0) {
      this.reportFlushStats({ rowsProcessed: 0, phases: { lrangeMs } });
      return;
    }

    const chStart = performance.now();
    await this.parallelLimit(this.chunks(items, this.chunkSize), (chunk) =>
      ch.insert({
        table: TABLE_NAMES.ml_metric_points,
        values: this.jsonEachRowStream(chunk),
        format: 'JSONEachRow',
        clickhouse_settings: this.getClickhouseSettings(),
      })
    );
    const chInsertMs = performance.now() - chStart;

    const trimStart = performance.now();
    await this.redis.ltrim(this.redisKey, items.length, -1);
    const trimMs = performance.now() - trimStart;

    this.reportFlushStats({
      rowsProcessed: items.length,
      phases: { lrangeMs, chInsertMs, trimMs },
    });
  }
}
