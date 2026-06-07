import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { useTRPC } from '@/integrations/trpc/react';
import { createProjectTitle } from '@/utils/title';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useMemo, useState } from 'react';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/ml/runs/$runId',
)({
  component: Component,
  head: () => ({
    meta: [{ title: createProjectTitle('ML Run') }],
  }),
});

function Component() {
  const { projectId, runId } = Route.useParams();
  const trpc = useTRPC();
  const run = useQuery(trpc.ml.run.queryOptions({ projectId, id: runId }));
  const metricNames = useQuery(
    trpc.ml.metricNames.queryOptions({ projectId, runId })
  );
  const [metric, setMetric] = useState('');
  const selectedMetric = metric || metricNames.data?.[0]?.metric || '';
  const series = useQuery({
    ...trpc.ml.metricSeries.queryOptions({
      projectId,
      runIds: [runId],
      metric: selectedMetric,
    }),
    enabled: !!selectedMetric,
  });
  const summary = (run.data?.summary ?? {}) as Record<string, number>;

  return (
    <PageContainer>
      <PageHeader
        title={run.data?.name ?? 'Run'}
        description={run.data ? `${run.data.mlProject.name} · ${run.data.status}` : undefined}
        className="mb-8"
      />
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <div className="rounded-md border bg-card p-4">
          <div className="mb-3 font-medium">Final metrics</div>
          <div className="col gap-2">
            {Object.entries(summary).map(([key, value]) => (
              <button
                key={key}
                type="button"
                className="row rounded-md px-2 py-1 text-left hover:bg-def-100"
                onClick={() => setMetric(key)}
              >
                <span className="flex-1 text-muted-foreground">{key}</span>
                <span className="font-medium">{value}</span>
              </button>
            ))}
            {Object.keys(summary).length === 0 && (
              <div className="text-muted-foreground text-sm">
                No metrics logged yet.
              </div>
            )}
          </div>
        </div>
        <div className="rounded-md border bg-card p-4">
          <div className="mb-4 row gap-2">
            <div className="font-medium">Metric chart</div>
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
          <MetricSvg data={series.data ?? []} />
        </div>
      </div>
    </PageContainer>
  );
}

function MetricSvg({
  data,
}: {
  data: Array<{ step: number; value: number }>;
}) {
  const points = useMemo(() => {
    if (data.length === 0) {
      return '';
    }
    const width = 720;
    const height = 260;
    const minStep = Math.min(...data.map((item) => item.step));
    const maxStep = Math.max(...data.map((item) => item.step));
    const minValue = Math.min(...data.map((item) => item.value));
    const maxValue = Math.max(...data.map((item) => item.value));
    const stepRange = Math.max(maxStep - minStep, 1);
    const valueRange = Math.max(maxValue - minValue, 1);

    return data
      .map((item) => {
        const x = ((item.step - minStep) / stepRange) * width;
        const y = height - ((item.value - minValue) / valueRange) * height;
        return `${x},${y}`;
      })
      .join(' ');
  }, [data]);

  if (!points) {
    return (
      <div className="center-center h-[280px] text-muted-foreground text-sm">
        No chart data yet.
      </div>
    );
  }

  return (
    <svg
      className="h-[280px] w-full overflow-visible"
      viewBox="0 0 720 260"
      role="img"
      aria-label="Metric series"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
