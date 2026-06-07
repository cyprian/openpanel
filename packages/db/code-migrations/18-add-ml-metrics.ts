import {
  createTable,
  getExistingTables,
  runClickhouseMigrationCommands,
} from '../src/clickhouse/migration';
import { getIsCluster, printBoxMessage } from './helpers';

export async function up() {
  const existingTables = await getExistingTables();
  if (existingTables.includes('ml_metric_points')) {
    printBoxMessage('✅ ML metrics table already exists', []);
    return;
  }

  const isClustered = getIsCluster();
  const replicatedVersion = '1';
  const sqls = createTable({
    name: 'ml_metric_points',
    columns: [
      '`project_id` String CODEC(ZSTD(3))',
      '`ml_project_id` String CODEC(ZSTD(3))',
      '`run_id` String CODEC(ZSTD(3))',
      '`metric` LowCardinality(String)',
      '`value` Float64 CODEC(Gorilla, LZ4)',
      '`step` UInt64 CODEC(Delta(8), LZ4)',
      '`epoch` Nullable(UInt64) CODEC(Delta(8), LZ4)',
      '`created_at` DateTime64(3) CODEC(DoubleDelta, ZSTD(3))',
      '`logged_at` DateTime64(3) CODEC(DoubleDelta, ZSTD(3))',
    ],
    indices: [
      'INDEX idx_run_id run_id TYPE bloom_filter GRANULARITY 1',
      'INDEX idx_metric metric TYPE bloom_filter GRANULARITY 1',
    ],
    orderBy: ['project_id', 'ml_project_id', 'run_id', 'metric', 'step'],
    partitionBy: 'toYYYYMM(created_at)',
    distributionHash: 'cityHash64(project_id, run_id)',
    replicatedVersion,
    isClustered,
  });

  await runClickhouseMigrationCommands(sqls);
}
