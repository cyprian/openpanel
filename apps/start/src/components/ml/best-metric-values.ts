type MetricDirection = 'up' | 'down';

const LOWER_IS_BETTER = /(^|[_\s/.-])(loss|error|err|mae|mse|rmse|mape|nll|perplexity|ppl|wer|cer|latency|duration|time|cost|lpips)($|[_\s/.-])/i;
const HIGHER_IS_BETTER = /(^|[_\s/.-])(psnr|ssim|accuracy|acc|precision|recall|f1|iou|dice|auc)($|[_\s/.-])/i;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function getDirections(metadata: unknown) {
  const record = asRecord(metadata);
  return asRecord(
    record.metricDirections ?? record.metric_directions ??
    record.performanceDirections ?? record.performance_directions
  );
}

function normalizeDirection(value: unknown): MetricDirection | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.toLowerCase();
  if (normalized === 'up' || normalized === 'higher') {
    return 'up';
  }
  if (normalized === 'down' || normalized === 'lower') {
    return 'down';
  }
  return undefined;
}

export function getBestMetricValues(
  runs: Array<{ summary: unknown; metadata: unknown }>,
  metrics: string[]
): Map<string, { value: number; direction: MetricDirection }> {
  const normalizedRuns = runs.map((run) => ({
    summary: asRecord(run.summary),
    directions: getDirections(run.metadata),
  }));
  const bestValues = new Map<string, { value: number; direction: MetricDirection }>();

  for (const metric of metrics) {
    const explicitDirections = new Set<MetricDirection>();
    const values: number[] = [];
    for (const run of normalizedRuns) {
      const direction = normalizeDirection(run.directions[metric]);
      if (direction) {
        explicitDirections.add(direction);
      }
      const value = run.summary[metric];
      if (typeof value === 'number' && Number.isFinite(value)) {
        values.push(value);
      }
    }
    if (explicitDirections.size > 1 || values.length === 0) {
      continue;
    }
    let direction = explicitDirections.values().next().value;
    if (!direction && LOWER_IS_BETTER.test(metric)) {
      direction = 'down';
    }
    if (!direction && HIGHER_IS_BETTER.test(metric)) {
      direction = 'up';
    }
    if (direction) {
      const value = values.reduce((best, current) =>
        direction === 'down' ? Math.min(best, current) : Math.max(best, current)
      );
      bestValues.set(metric, { value, direction });
    }
  }
  return bestValues;
}
