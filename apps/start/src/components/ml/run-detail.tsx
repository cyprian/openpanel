import { MlStatusBadge } from '@/components/ml/status-badge';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { useTRPC } from '@/integrations/trpc/react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { formatDistanceToNow } from 'date-fns';
import { ArrowLeftIcon } from 'lucide-react';
import type React from 'react';
import { useMemo, useState } from 'react';

export function MlRunDetail({
  organizationId,
  projectId,
  runId,
  fallbackMlProjectId,
}: {
  organizationId: string;
  projectId: string;
  runId: string;
  fallbackMlProjectId?: string;
}) {
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
  const summary = normalizeNumberRecord(run.data?.summary);
  const config = normalizeRecord(run.data?.config);
  const metadata = normalizeRecord(run.data?.metadata);
  const mlProjectId = run.data?.mlProjectId ?? fallbackMlProjectId;

  return (
    <PageContainer>
      <div className="mb-4">
        {mlProjectId && (
          <Link
            className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-input bg-card px-2 font-medium text-sm transition-all hover:translate-y-[-0.5px] hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            to="/$organizationId/$projectId/ml/projects/$mlProjectId"
            params={{ organizationId, projectId, mlProjectId }}
          >
            <ArrowLeftIcon className="size-3.5" />
            Project runs
          </Link>
        )}
      </div>
      <PageHeader
        title={run.data?.name ?? 'Run'}
        description={run.data ? run.data.mlProject.name : undefined}
        className="mb-6"
      />
      {run.data && (
        <div className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <InfoCard label="Status">
            <MlStatusBadge status={run.data.status} />
          </InfoCard>
          <InfoCard label="Run ID">
            <span className="break-all font-mono text-xs">{run.data.id}</span>
          </InfoCard>
          <InfoCard label="Created">
            {formatDistanceToNow(run.data.createdAt, { addSuffix: true })}
          </InfoCard>
          <InfoCard label="Updated">
            {formatDistanceToNow(run.data.updatedAt, { addSuffix: true })}
          </InfoCard>
        </div>
      )}
      {run.data && run.data.tags.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {run.data.tags.map((tag) => (
            <Badge key={tag} variant="outline">
              {tag}
            </Badge>
          ))}
        </div>
      )}
      {run.data?.notes && (
        <section className="mb-4 rounded-md border bg-card p-4">
          <div className="mb-2 font-medium">Notes</div>
          <p className="whitespace-pre-wrap text-sm">{run.data.notes}</p>
        </section>
      )}
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <section className="rounded-md border bg-card p-4">
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
                <span className="font-medium">{formatNumber(value)}</span>
              </button>
            ))}
            {Object.keys(summary).length === 0 && (
              <div className="rounded-md bg-def-100 p-3 text-muted-foreground text-sm">
                No scalar metrics have been logged for this run yet.
              </div>
            )}
          </div>
        </section>
        <section className="rounded-md border bg-card p-4">
          <div className="mb-4 row gap-2">
            <div className="font-medium">Metric chart</div>
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
          <MetricSvg data={series.data ?? []} />
        </section>
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <JsonPanel title="Config" value={config} emptyText="No config logged." />
        <JsonPanel
          title="Metadata"
          value={metadata}
          emptyText="No metadata logged."
        />
      </div>
    </PageContainer>
  );
}

function InfoCard({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border bg-card p-4">
      <div className="mb-1 text-muted-foreground text-xs">{label}</div>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function JsonPanel({
  title,
  value,
  emptyText,
}: {
  title: string;
  value: Record<string, unknown>;
  emptyText: string;
}) {
  const isEmpty = Object.keys(value).length === 0;

  return (
    <section className="rounded-md border bg-card p-4">
      <div className="mb-3 font-medium">{title}</div>
      {isEmpty ? (
        <div className="text-muted-foreground text-sm">{emptyText}</div>
      ) : (
        <pre className="max-h-[320px] overflow-auto rounded-md bg-def-100 p-3 text-xs">
          {JSON.stringify(value, null, 2)}
        </pre>
      )}
    </section>
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

function normalizeRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function normalizeNumberRecord(value: unknown): Record<string, number> {
  const record = normalizeRecord(value);
  const result: Record<string, number> = {};
  for (const [key, item] of Object.entries(record)) {
    if (typeof item === 'number') {
      result[key] = item;
    }
  }

  return result;
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? value : value.toFixed(4);
}
