import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { MlStatusBadge } from '@/components/ml/status-badge';
import {
  ChartTooltipContainer,
  ChartTooltipHeader,
  ChartTooltipItem,
} from '@/components/charts/chart-tooltip';
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
import { X_AXIS_STYLE_PROPS } from '@/components/report-chart/common/axis';
import { useTRPC } from '@/integrations/trpc/react';
import { createProjectTitle } from '@/utils/title';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/ml/compare',
)({
  component: Component,
  head: () => ({
    meta: [{ title: createProjectTitle('Compare ML Runs') }],
  }),
});

const COLORS = [
  '#2563eb',
  '#16a34a',
  '#dc2626',
  '#9333ea',
  '#ea580c',
  '#0891b2',
  '#c026d3',
  '#65a30d',
  '#db2777',
  '#4f46e5',
  '#ca8a04',
  '#0d9488',
];

function Component() {
  const { projectId } = Route.useParams();
  const trpc = useTRPC();
  const runs = useQuery(trpc.ml.runs.queryOptions({ projectId }));
  const metricNames = useQuery(trpc.ml.metricNames.queryOptions({ projectId }));
  const [selectedRunIds, setSelectedRunIds] = useState<string[] | null>(null);
  const [metric, setMetric] = useState('');
  const selectedMetric = metric || metricNames.data?.[0]?.metric || '';
  const availableRuns = runs.data ?? [];
  const availableRunIds = availableRuns.map((run) => run.id);
  const selectedRunIdSet = new Set(selectedRunIds ?? availableRunIds);
  const effectiveRunIds = availableRuns
    .filter((run) => selectedRunIdSet.has(run.id))
    .map((run) => run.id);
  const selectedRuns = availableRuns.filter((run) =>
    effectiveRunIds.includes(run.id)
  );
  const runColors = useMemo(
    () =>
      new Map(
        availableRuns.map((run, index) => [run.id, getRunColor(index)] as const)
      ),
    [availableRuns]
  );
  const allRunsChecked =
    availableRuns.length > 0 && effectiveRunIds.length === availableRuns.length;
  const someRunsChecked = effectiveRunIds.length > 0 && !allRunsChecked;
  const compareProjectName = getSingleMlProjectName(availableRuns);
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
  const selectedMetricValues = selectedRuns.map((run) =>
    normalizeNumberRecord(run.summary)
  );
  const bestRunId = selectedMetric
    ? getBestRunId(selectedMetric, selectedMetricValues, selectedRuns)
    : null;
  const bestRun = selectedRuns.find((run) => run.id === bestRunId);

  return (
    <PageContainer>
      <PageHeader
        title={
          compareProjectName
            ? `Compare Runs for: ${compareProjectName}`
            : 'Compare Runs'
        }
        description="Overlay training metrics and compare final values, hyperparameters, and metadata."
        className="mb-8"
      />
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <section className="rounded-md border bg-card p-4">
          <div className="mb-3 row justify-between gap-3">
            <div className="font-medium">Runs</div>
            {availableRuns.length > 0 && (
              <label className="row cursor-pointer gap-2 text-muted-foreground text-sm">
                <Checkbox
                  checked={someRunsChecked ? 'indeterminate' : allRunsChecked}
                  onCheckedChange={(value) => {
                    setSelectedRunIds(value === true ? null : []);
                  }}
                />
                <span>Check all</span>
              </label>
            )}
          </div>
          <div className="col max-h-[480px] gap-2 overflow-auto pr-1">
            {availableRuns.map((run, index) => {
              const checked = effectiveRunIds.includes(run.id);
              const color = runColors.get(run.id) ?? getRunColor(index);
              return (
                <label
                  key={run.id}
                  className="row cursor-pointer gap-3 rounded-md px-2 py-2 hover:bg-def-100"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(value) => {
                      const isChecked = value === true;
                      setSelectedRunIds((current) => {
                        const currentIds = current ?? availableRunIds;
                        return isChecked
                          ? [...new Set([...currentIds, run.id])]
                          : currentIds.filter((id) => id !== run.id);
                      });
                    }}
                  />
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {run.name}
                    </span>
                    <MlStatusBadge status={run.status} className="mt-1" />
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
            {bestRun && (
              <Badge className="ml-2" variant="success">
                Best final: {bestRun.name}
              </Badge>
            )}
            <select
              className="ml-auto rounded-md border bg-background px-2 py-1 text-sm"
              value={selectedMetric}
              onChange={(event) => setMetric(event.target.value)}
              disabled={(metricNames.data ?? []).length === 0}
            >
              {(metricNames.data ?? []).map((item) => (
                <option key={item.metric} value={item.metric}>
                  {item.metric}
                </option>
              ))}
            </select>
          </div>
          <CompareMetricChart
            data={series.data ?? []}
            metric={selectedMetric}
            runs={selectedRuns.map((run) => ({
              id: run.id,
              name: run.name,
              color: runColors.get(run.id) ?? COLORS[0],
            }))}
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
      <div className="mt-4 grid gap-4">
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
            <TableHead>Experiment</TableHead>
            {keys.map((key) => (
              <TableHead key={key}>{key}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.map((run) => (
            <TableRow key={run.id}>
              <TableCell className="font-medium">{run.name}</TableCell>
              {keys.map((key) => {
                const badge = getBadge?.(key, run);
                return (
                  <TableCell key={key}>
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

function CompareMetricChart({
  data,
  metric,
  runs,
}: {
  data: Array<{ run_id: string; step: number; value: number }>;
  metric: string;
  runs: Array<{ id: string; name: string; color: string }>;
}) {
  const chartData = useMemo(() => {
    const rows = new Map<number, { step: number } & Record<string, number>>();
    for (const item of data) {
      const row = rows.get(item.step) ?? { step: item.step };
      row[item.run_id] = item.value;
      rows.set(item.step, row);
    }

    return [...rows.values()].sort((a, b) => a.step - b.step);
  }, [data]);

  if (chartData.length === 0 || runs.length === 0) {
    return (
      <div className="center-center h-[280px] text-muted-foreground text-sm">
        No chart data yet.
      </div>
    );
  }

  return (
    <div>
      <div className="h-[340px]">
        <ResponsiveContainer height="100%" width="100%">
          <LineChart
            data={chartData}
            margin={{ top: 12, right: 20, bottom: 28, left: 12 }}
          >
            <CartesianGrid
              className="stroke-border"
              horizontal
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis
              {...X_AXIS_STYLE_PROPS}
              dataKey="step"
              label={{
                value: 'Step',
                position: 'insideBottom',
                offset: -16,
                className: 'fill-muted-foreground font-mono text-[10px]',
              }}
              type="number"
            />
            <YAxis
              axisLine={false}
              className="font-mono"
              label={{
                value: metric,
                angle: -90,
                position: 'insideLeft',
                className: 'fill-muted-foreground font-mono text-[10px]',
              }}
              tickFormatter={formatAxisNumber}
              tickLine={false}
              width={64}
            />
            <Tooltip
              content={<CompareMetricTooltip metric={metric} />}
              cursor={{ stroke: COLORS[0], strokeDasharray: '4 4' }}
            />
            {runs.map((run) => (
              <Line
                activeDot={{
                  r: 5,
                  fill: run.color,
                  stroke: 'var(--background)',
                  strokeWidth: 2,
                }}
                connectNulls
                dataKey={run.id}
                dot={{
                  r: 2,
                  fill: run.color,
                  stroke: run.color,
                  strokeWidth: 1,
                }}
                isAnimationActive={false}
                key={run.id}
                name={run.name}
                stroke={run.color}
                strokeWidth={2.5}
                type="monotone"
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function CompareMetricTooltip({
  active,
  payload,
  metric,
}: TooltipProps<number, string> & { metric: string }) {
  const step = payload?.[0]?.payload?.step as number | undefined;

  if (!active || step === undefined || !payload?.length) {
    return null;
  }

  return (
    <ChartTooltipContainer>
      <ChartTooltipHeader>
        <div className="font-medium">Step {step}</div>
      </ChartTooltipHeader>
      {payload
        .filter((item) => typeof item.value === 'number')
        .map((item) => (
          <ChartTooltipItem
            color={item.color ?? COLORS[0]}
            key={`${item.dataKey}-${item.name}`}
          >
            <div className="flex justify-between gap-8 font-medium font-mono">
              <span>{item.name ?? metric}</span>
              <span>{formatNumber(item.value as number)}</span>
            </div>
          </ChartTooltipItem>
        ))}
    </ChartTooltipContainer>
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

function getRunColor(index: number) {
  return COLORS[index % COLORS.length];
}

function getSingleMlProjectName(
  runs: Array<{ mlProject: { id: string; name: string } }>
) {
  const projectNamesById = new Map(
    runs.map((run) => [run.mlProject.id, run.mlProject.name] as const)
  );

  return projectNamesById.size === 1
    ? [...projectNamesById.values()][0]
    : null;
}

function formatValue(value: unknown) {
  if (typeof value === 'number') {
    return formatNumber(value);
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

function formatNumber(value: number) {
  return Number.isInteger(value) ? value.toString() : value.toFixed(4);
}

function formatAxisNumber(value: number) {
  if (Math.abs(value) >= 1000) {
    return value.toExponential(1);
  }

  if (Number.isInteger(value)) {
    return value.toString();
  }

  if (Math.abs(value) < 0.01) {
    return value.toExponential(1);
  }

  return value.toFixed(3);
}
