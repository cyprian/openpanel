import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { useTRPC } from '@/integrations/trpc/react';
import { createProjectTitle } from '@/utils/title';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useMemo, useState } from 'react';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/ml/compare',
)({
  component: Component,
  head: () => ({
    meta: [{ title: createProjectTitle('Compare ML Runs') }],
  }),
});

const COLORS = ['#2563eb', '#16a34a', '#dc2626', '#9333ea', '#ea580c'];

function Component() {
  const { projectId } = Route.useParams();
  const trpc = useTRPC();
  const runs = useQuery(trpc.ml.runs.queryOptions({ projectId }));
  const metricNames = useQuery(trpc.ml.metricNames.queryOptions({ projectId }));
  const [selectedRunIds, setSelectedRunIds] = useState<string[]>([]);
  const [metric, setMetric] = useState('');
  const selectedMetric = metric || metricNames.data?.[0]?.metric || '';
  const availableRuns = runs.data ?? [];
  const effectiveRunIds =
    selectedRunIds.length > 0
      ? selectedRunIds
      : availableRuns.slice(0, 3).map((run) => run.id);
  const selectedRuns = availableRuns.filter((run) =>
    effectiveRunIds.includes(run.id)
  );
  const series = useQuery({
    ...trpc.ml.metricSeries.queryOptions({
      projectId,
      runIds: effectiveRunIds,
      metric: selectedMetric,
    }),
    enabled: effectiveRunIds.length > 0 && !!selectedMetric,
  });
  const metricKeys = getUniqueKeys(
    selectedRuns.map((run) => normalizeNumberRecord(run.summary))
  );
  const configKeys = getUniqueKeys(
    selectedRuns.map((run) => normalizeRecord(run.config))
  );
  const metadataKeys = getUniqueKeys(
    selectedRuns.map((run) => normalizeRecord(run.metadata))
  );

  return (
    <PageContainer>
      <PageHeader
        title="Compare Runs"
        description="Overlay training metrics and compare final values, hyperparameters, and metadata."
        className="mb-8"
      />
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <section className="rounded-md border bg-card p-4">
          <div className="mb-3 font-medium">Runs</div>
          <div className="col max-h-[480px] gap-2 overflow-auto pr-1">
            {availableRuns.map((run) => {
              const checked = effectiveRunIds.includes(run.id);
              return (
                <label
                  key={run.id}
                  className="row cursor-pointer gap-3 rounded-md px-2 py-2 hover:bg-def-100"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(value) => {
                      const isChecked = value === true;
                      setSelectedRunIds((current) =>
                        isChecked
                          ? [...new Set([...current, run.id])].slice(0, 5)
                          : current.filter((id) => id !== run.id)
                      );
                    }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {run.name}
                    </span>
                    <span className="block truncate text-muted-foreground text-xs">
                      {run.mlProject.name} · {run.status}
                    </span>
                  </span>
                </label>
              );
            })}
            {availableRuns.length === 0 && (
              <div className="text-muted-foreground text-sm">No runs yet.</div>
            )}
          </div>
        </section>
        <section className="rounded-md border bg-card p-4">
          <div className="mb-4 row gap-2">
            <div className="font-medium">Metric overlay</div>
            <select
              className="ml-auto rounded-md border bg-background px-2 py-1 text-sm"
              value={selectedMetric}
              onChange={(event) => setMetric(event.target.value)}
            >
              {(metricNames.data ?? []).map((item) => (
                <option key={item.metric} value={item.metric}>
                  {item.metric}
                </option>
              ))}
            </select>
          </div>
          <CompareMetricSvg
            data={series.data ?? []}
            runNames={Object.fromEntries(
              selectedRuns.map((run) => [run.id, run.name])
            )}
          />
        </section>
      </div>
      <section className="mt-4 rounded-md border bg-card p-4">
        <div className="mb-4 font-medium">Final metrics</div>
        <ComparisonTable
          keys={metricKeys}
          runs={selectedRuns}
          getValues={(run) => normalizeNumberRecord(run.summary)}
          getBadge={(key, run) => {
            const values = selectedRuns.map((item) =>
              normalizeNumberRecord(item.summary)
            );
            return getBestRunId(key, values, selectedRuns) === run.id
              ? 'Best'
              : null;
          }}
        />
      </section>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <section className="rounded-md border bg-card p-4">
          <div className="mb-4 font-medium">Hyperparameters</div>
          <ComparisonTable
            keys={configKeys}
            runs={selectedRuns}
            getValues={(run) => normalizeRecord(run.config)}
          />
        </section>
        <section className="rounded-md border bg-card p-4">
          <div className="mb-4 font-medium">Metadata</div>
          <ComparisonTable
            keys={metadataKeys}
            runs={selectedRuns}
            getValues={(run) => normalizeRecord(run.metadata)}
          />
        </section>
      </div>
    </PageContainer>
  );
}

function ComparisonTable<TRun extends { id: string; name: string }>({
  keys,
  runs,
  getValues,
  getBadge,
}: {
  keys: string[];
  runs: TRun[];
  getValues: (run: TRun) => Record<string, unknown>;
  getBadge?: (key: string, run: TRun) => string | null;
}) {
  if (runs.length === 0) {
    return <div className="text-muted-foreground text-sm">Select runs.</div>;
  }
  if (keys.length === 0) {
    return <div className="text-muted-foreground text-sm">No values yet.</div>;
  }

  return (
    <div className="overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Key</TableHead>
            {runs.map((run) => (
              <TableHead key={run.id}>{run.name}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {keys.map((key) => (
            <TableRow key={key}>
              <TableCell className="font-medium">{key}</TableCell>
              {runs.map((run) => {
                const badge = getBadge?.(key, run);
                return (
                  <TableCell key={run.id}>
                    <span className="row gap-2">
                      <span>{formatValue(getValues(run)[key])}</span>
                      {badge && <Badge variant="success">{badge}</Badge>}
                    </span>
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function CompareMetricSvg({
  data,
  runNames,
}: {
  data: Array<{ run_id: string; step: number; value: number }>;
  runNames: Record<string, string>;
}) {
  const { lines, names } = useMemo(() => {
    if (data.length === 0) {
      return { lines: [], names: [] };
    }
    const width = 720;
    const height = 260;
    const minStep = Math.min(...data.map((item) => item.step));
    const maxStep = Math.max(...data.map((item) => item.step));
    const minValue = Math.min(...data.map((item) => item.value));
    const maxValue = Math.max(...data.map((item) => item.value));
    const stepRange = Math.max(maxStep - minStep, 1);
    const valueRange = Math.max(maxValue - minValue, 1);
    const byRun = new Map<string, typeof data>();

    for (const item of data) {
      byRun.set(item.run_id, [...(byRun.get(item.run_id) ?? []), item]);
    }

    return {
      lines: Array.from(byRun.entries()).map(([runId, values], index) => ({
        runId,
        color: COLORS[index % COLORS.length],
        points: values
          .map((item) => {
            const x = ((item.step - minStep) / stepRange) * width;
            const y = height - ((item.value - minValue) / valueRange) * height;
            return `${x},${y}`;
          })
          .join(' '),
      })),
      names: Array.from(byRun.keys()),
    };
  }, [data]);

  if (lines.length === 0) {
    return (
      <div className="center-center h-[280px] text-muted-foreground text-sm">
        No chart data yet.
      </div>
    );
  }

  return (
    <div>
      <svg
        className="h-[280px] w-full overflow-visible"
        viewBox="0 0 720 260"
        role="img"
        aria-label="Compared metric series"
      >
        {lines.map((line) => (
          <polyline
            key={line.runId}
            points={line.points}
            fill="none"
            stroke={line.color}
            strokeWidth="3"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <div className="mt-3 row flex-wrap gap-3 text-sm">
        {names.map((runId, index) => (
          <div key={runId} className="row gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: COLORS[index % COLORS.length] }}
            />
            <span className="text-muted-foreground">
              {runNames[runId] ?? runId}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function normalizeNumberRecord(value: unknown): Record<string, number> {
  return Object.fromEntries(
    Object.entries(normalizeRecord(value)).filter(
      (entry): entry is [string, number] => typeof entry[1] === 'number'
    )
  );
}

function getUniqueKeys(values: Array<Record<string, unknown>>) {
  return [...new Set(values.flatMap((value) => Object.keys(value)))].sort();
}

function getBestRunId(
  key: string,
  values: Array<Record<string, number>>,
  runs: Array<{ id: string }>
) {
  const metricValues = values
    .map((value, index) => ({ runId: runs[index]?.id, value: value[key] }))
    .filter(
      (item): item is { runId: string; value: number } =>
        !!item.runId && typeof item.value === 'number'
    );
  if (metricValues.length === 0) {
    return null;
  }
  const lowerIsBetter = /loss|error|wer|cer|lpips|mae|mse|rmse/i.test(key);
  return metricValues.reduce((best, item) => {
    if (lowerIsBetter) {
      return item.value < best.value ? item : best;
    }
    return item.value > best.value ? item : best;
  }).runId;
}

function formatValue(value: unknown) {
  if (typeof value === 'number') {
    return Number.isInteger(value) ? value.toString() : value.toFixed(4);
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (value == null) {
    return '-';
  }
  return JSON.stringify(value);
}
