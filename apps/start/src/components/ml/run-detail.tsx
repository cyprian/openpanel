import { MlStatusBadge } from '@/components/ml/status-badge';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import {
  ChartTooltipContainer,
  ChartTooltipHeader,
  ChartTooltipItem,
} from '@/components/charts/chart-tooltip';
import { X_AXIS_STYLE_PROPS } from '@/components/report-chart/common/axis';
import { useTRPC } from '@/integrations/trpc/react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { formatDistanceToNow } from 'date-fns';
import { ArrowLeftIcon } from 'lucide-react';
import type React from 'react';
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

const ML_CHART_BLUE = '#2563eb';

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
  const images = useQuery({
    ...trpc.ml.images.queryOptions({ projectId, runId, limit: 100 }),
    enabled: !!run.data,
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
          <MetricChart data={series.data ?? []} metric={selectedMetric} />
        </section>
      </div>
      <ImageGallery images={images.data ?? []} />
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

const IMAGE_KIND_COLUMNS = [
  'input',
  'ground_truth',
  'prediction',
  'error_map',
] as const;

type MlRunImage = {
  id: string;
  kind: string;
  step: number | null;
  epoch: number | null;
  caption: string | null;
  filename: string;
  width: number | null;
  height: number | null;
  dataUrl: string;
};

type ImageGroup = {
  key: string;
  step: number | null;
  epoch: number | null;
  images: MlRunImage[];
  byKind: Partial<Record<(typeof IMAGE_KIND_COLUMNS)[number], MlRunImage[]>>;
};

function ImageGallery({
  images,
}: {
  images: MlRunImage[];
}) {
  const [selectedGroupKey, setSelectedGroupKey] = useState('');
  const groups = useMemo(() => groupImagesByTrainingPoint(images), [images]);
  const selectedGroup =
    groups.find((group) => group.key === selectedGroupKey) ?? groups[0];
  const recentGroups = groups.slice(0, 8);

  return (
    <section className="mt-4 rounded-md border bg-card p-4">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="font-medium">Visual evaluation</div>
        {images.length > 0 && (
          <Badge variant="outline">{images.length} latest</Badge>
        )}
        {groups.length > 0 && (
          <select
            className="ml-auto rounded-md border bg-background px-2 py-1 text-sm"
            onChange={(event) => setSelectedGroupKey(event.target.value)}
            value={selectedGroup?.key ?? ''}
          >
            {groups.map((group) => (
              <option key={group.key} value={group.key}>
                {formatImageGroupLabel(group)} - {group.images.length} images
              </option>
            ))}
          </select>
        )}
      </div>
      {images.length === 0 ? (
        <div className="rounded-md bg-def-100 p-3 text-muted-foreground text-sm">
          No images have been logged for this run yet.
        </div>
      ) : (
        <div className="col gap-4">
          {selectedGroup && (
            <VisualComparisonRow group={selectedGroup} size="large" />
          )}
          {recentGroups.length > 1 && (
            <div className="col gap-3">
              <div className="font-medium text-sm">Recent snapshots</div>
              {recentGroups.map((group) => (
                <VisualComparisonRow group={group} key={group.key} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function VisualComparisonRow({
  group,
  size = 'compact',
}: {
  group: ImageGroup;
  size?: 'compact' | 'large';
}) {
  return (
    <article className="rounded-md border bg-background p-3">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="font-medium text-sm">{formatImageGroupLabel(group)}</div>
        <Badge variant="outline">{group.images.length} images</Badge>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {IMAGE_KIND_COLUMNS.map((kind) => (
          <ImageKindCell
            image={group.byKind[kind]?.[0]}
            key={kind}
            kind={kind}
            size={size}
            total={group.byKind[kind]?.length ?? 0}
          />
        ))}
      </div>
    </article>
  );
}

function ImageKindCell({
  image,
  kind,
  size,
  total,
}: {
  image?: MlRunImage;
  kind: (typeof IMAGE_KIND_COLUMNS)[number];
  size: 'compact' | 'large';
  total: number;
}) {
  return (
    <div className="overflow-hidden rounded-md border">
      <div className={size === 'large' ? 'h-56 bg-def-100' : 'h-36 bg-def-100'}>
        {image?.dataUrl ? (
          <img
            alt={image.caption || image.filename}
            className="h-full w-full object-contain"
            src={image.dataUrl}
          />
        ) : (
          <div className="center-center h-full text-muted-foreground text-sm">
            {image ? 'Missing file' : 'No image'}
          </div>
        )}
      </div>
      <div className="col gap-2 p-3">
        <div className="row gap-2">
          <Badge variant="outline">{formatImageKind(kind)}</Badge>
          {total > 1 && <Badge variant="outline">+{total - 1}</Badge>}
        </div>
        {image ? (
          <>
            <div className="truncate font-medium text-sm">
              {image.caption || image.filename}
            </div>
            {image.width && image.height && (
              <div className="text-muted-foreground text-xs">
                {image.width} x {image.height}
              </div>
            )}
          </>
        ) : (
          <div className="text-muted-foreground text-xs">Not logged</div>
        )}
      </div>
    </div>
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

function MetricChart({
  data,
  metric,
}: {
  data: Array<{ step: number; value: number }>;
  metric: string;
}) {
  const chartData = useMemo(() => {
    return data
      .map((item) => ({
        step: item.step,
        value: item.value,
      }))
      .sort((a, b) => a.step - b.step);
  }, [data]);

  if (chartData.length === 0) {
    return (
      <div className="center-center h-[280px] text-muted-foreground text-sm">
        No chart data yet.
      </div>
    );
  }

  return (
    <div className="h-[320px]">
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
            content={<MetricTooltip metric={metric} />}
            cursor={{ stroke: ML_CHART_BLUE, strokeDasharray: '4 4' }}
          />
          <Line
            activeDot={{
              r: 5,
              fill: ML_CHART_BLUE,
              stroke: 'var(--background)',
              strokeWidth: 2,
            }}
            dataKey="value"
            dot={{
              r: 2,
              fill: ML_CHART_BLUE,
              stroke: ML_CHART_BLUE,
              strokeWidth: 1,
            }}
            isAnimationActive={false}
            stroke={ML_CHART_BLUE}
            strokeWidth={2.5}
            type="monotone"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function MetricTooltip({
  active,
  payload,
  metric,
}: TooltipProps<number, string> & { metric: string }) {
  const point = payload?.[0]?.payload as
    | { step: number; value: number }
    | undefined;

  if (!active || !point) {
    return null;
  }

  return (
    <ChartTooltipContainer>
      <ChartTooltipHeader>
        <div className="font-medium">Step {point.step}</div>
      </ChartTooltipHeader>
      <ChartTooltipItem color={ML_CHART_BLUE}>
        <div className="flex justify-between gap-8 font-medium font-mono">
          <span>{metric}</span>
          <span>{formatNumber(point.value)}</span>
        </div>
      </ChartTooltipItem>
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
  const record = normalizeRecord(value);
  const result: Record<string, number> = {};
  for (const [key, item] of Object.entries(record)) {
    if (typeof item === 'number') {
      result[key] = item;
    }
  }

  return result;
}

function groupImagesByTrainingPoint(images: MlRunImage[]): ImageGroup[] {
  const groups = new Map<string, ImageGroup>();

  for (const image of images) {
    const key = `${image.epoch ?? 'none'}:${image.step ?? 'none'}`;
    const group = groups.get(key) ?? {
      key,
      step: image.step,
      epoch: image.epoch,
      images: [],
      byKind: {},
    };
    group.images.push(image);

    if (isImageKindColumn(image.kind)) {
      group.byKind[image.kind] = [...(group.byKind[image.kind] ?? []), image];
    }

    groups.set(key, group);
  }

  return [...groups.values()].sort((a, b) => {
    const epochDelta = (b.epoch ?? -1) - (a.epoch ?? -1);
    if (epochDelta !== 0) {
      return epochDelta;
    }

    return (b.step ?? -1) - (a.step ?? -1);
  });
}

function isImageKindColumn(
  kind: string
): kind is (typeof IMAGE_KIND_COLUMNS)[number] {
  return IMAGE_KIND_COLUMNS.includes(kind as (typeof IMAGE_KIND_COLUMNS)[number]);
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? value : value.toFixed(4);
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

function formatImageKind(kind: string) {
  return kind
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatImageGroupLabel(group: Pick<ImageGroup, 'epoch' | 'step'>) {
  const parts = [];
  if (group.epoch !== null) {
    parts.push(`Epoch ${group.epoch}`);
  }
  if (group.step !== null) {
    parts.push(`Step ${group.step}`);
  }

  return parts.length > 0 ? parts.join(' - ') : 'Unscoped images';
}
