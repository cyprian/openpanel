import { MlStatusBadge } from '@/components/ml/status-badge';
import { MlRunActions } from '@/components/ml/run-actions';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ChartTooltipContainer,
  ChartTooltipHeader,
  ChartTooltipItem,
} from '@/components/charts/chart-tooltip';
import { X_AXIS_STYLE_PROPS } from '@/components/report-chart/common/axis';
import { useTRPC } from '@/integrations/trpc/react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { formatDistanceToNow } from 'date-fns';
import {
  ArrowLeftIcon,
  BracesIcon,
  DatabaseIcon,
  type LucideIcon,
} from 'lucide-react';
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
  const navigate = useNavigate();
  const run = useQuery(trpc.ml.run.queryOptions({ projectId, id: runId }));
  const metricNames = useQuery(
    trpc.ml.metricNames.queryOptions({ projectId, runId })
  );
  const [evaluationSearch, setEvaluationSearch] = useState('');
  const [evaluationPage, setEvaluationPage] = useState(1);
  const [evaluationSortBy, setEvaluationSortBy] = useState('createdAt');
  const [evaluationSortDirection, setEvaluationSortDirection] = useState<
    'asc' | 'desc'
  >('desc');
  const metricItems = metricNames.data ?? [];
  const metricSeriesQueries = useQueries({
    queries: metricItems.map((item) =>
      trpc.ml.metricSeries.queryOptions({
        projectId,
        runIds: [runId],
        metric: item.metric,
      })
    ),
  });
  const images = useQuery({
    ...trpc.ml.images.queryOptions({ projectId, runId, limit: 100 }),
    enabled: !!run.data,
  });
  const evaluationSummary = useQuery({
    ...trpc.ml.evaluationRows.queryOptions({
      projectId,
      runId,
      page: 1,
      pageSize: 1,
    }),
    enabled: !!run.data,
  });
  const evaluationRows = useQuery({
    ...trpc.ml.evaluationRows.queryOptions({
      projectId,
      runId,
      search: evaluationSearch || undefined,
      page: evaluationPage,
      pageSize: 10,
      sortBy: evaluationSortBy,
      sortDirection: evaluationSortDirection,
    }),
    enabled: !!run.data,
  });
  const summary = normalizeNumberRecord(run.data?.summary);
  const config = normalizeRecord(run.data?.config);
  const metadata = normalizeRecord(run.data?.metadata);
  const mlProjectId = run.data?.mlProjectId ?? fallbackMlProjectId;
  const hasImages = (images.data?.length ?? 0) > 0;
  const hasEvaluationRows = (evaluationSummary.data?.total ?? 0) > 0;

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
        actions={
          run.data ? (
            <>
              <JsonDialogButton
                emptyText="No config logged."
                icon={BracesIcon}
                title="Config"
                value={config}
              />
              <JsonDialogButton
                emptyText="No metadata logged."
                icon={DatabaseIcon}
                title="Metadata"
                value={metadata}
              />
              <MlRunActions
                projectId={projectId}
                runId={run.data.id}
                runName={run.data.name}
                showLabel
                status={run.data.status}
                onDeleted={() => {
                  if (mlProjectId) {
                    navigate({
                      to: '/$organizationId/$projectId/ml/projects/$mlProjectId',
                      params: { organizationId, projectId, mlProjectId },
                    });
                    return;
                  }
                  navigate({
                    to: '/$organizationId/$projectId/ml/runs',
                    params: { organizationId, projectId },
                  });
                }}
              />
            </>
          ) : null
        }
      />
      {run.data && (
        <section className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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
        </section>
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
      <section className="mb-4 rounded-md border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div>
            <div className="font-medium">Final metrics</div>
            <div className="text-muted-foreground text-xs">
              Latest scalar values logged for this run
            </div>
          </div>
          {Object.keys(summary).length > 0 && (
            <Badge className="ml-auto" variant="outline">
              {Object.keys(summary).length} metrics
            </Badge>
          )}
        </div>
        <FinalMetricsGrid summary={summary} />
      </section>
      <MetricChartsSection
        isLoadingMetricNames={metricNames.isLoading}
        metricItems={metricItems}
        queries={metricSeriesQueries}
        summary={summary}
      />
      {hasImages && <ImageGallery images={images.data ?? []} />}
      {hasEvaluationRows && (
        <EvaluationTable
          data={evaluationRows.data}
          isLoading={evaluationRows.isLoading}
          onPageChange={setEvaluationPage}
          onSearchChange={(value) => {
            setEvaluationSearch(value);
            setEvaluationPage(1);
          }}
          onSortByChange={(value) => {
            setEvaluationSortBy(value);
            setEvaluationPage(1);
          }}
          onSortDirectionChange={(value) => {
            setEvaluationSortDirection(value);
            setEvaluationPage(1);
          }}
          page={evaluationPage}
          search={evaluationSearch}
          sortBy={evaluationSortBy}
          sortDirection={evaluationSortDirection}
        />
      )}
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

type MlEvaluationRow = {
  id: string;
  sampleId: string | null;
  step: number | null;
  epoch: number | null;
  metrics: unknown;
  metadata: unknown;
  images: MlRunImage[];
  createdAt: Date | string;
};

type MlEvaluationRowsData = {
  rows: MlEvaluationRow[];
  metricKeys: string[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type MlMetricSeriesPoint = {
  run_id: string;
  step: number;
  value: number;
  created_at: string;
};

type ImageGroup = {
  key: string;
  step: number | null;
  epoch: number | null;
  images: MlRunImage[];
  byKind: Partial<Record<(typeof IMAGE_KIND_COLUMNS)[number], MlRunImage[]>>;
};

type MetricSeriesQueryResult = {
  data?: MlMetricSeriesPoint[];
  isLoading: boolean;
};

function FinalMetricsGrid({ summary }: { summary: Record<string, number> }) {
  const entries = Object.entries(summary);

  if (entries.length === 0) {
    return (
      <div className="rounded-md bg-def-100 p-3 text-muted-foreground text-sm">
        No scalar metrics have been logged for this run yet.
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {entries.map(([key, value]) => (
        <article className="rounded-md border bg-background p-3" key={key}>
          <div className="truncate text-muted-foreground text-xs">{key}</div>
          <div className="mt-1 truncate font-mono font-semibold text-lg">
            {formatNumber(value)}
          </div>
        </article>
      ))}
    </div>
  );
}

function MetricChartsSection({
  isLoadingMetricNames,
  metricItems,
  queries,
  summary,
}: {
  isLoadingMetricNames: boolean;
  metricItems: Array<{ metric: string }>;
  queries: MetricSeriesQueryResult[];
  summary: Record<string, number>;
}) {
  return (
    <section className="rounded-md border bg-card p-4">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div>
          <div className="font-medium">Metric trends</div>
          <div className="text-muted-foreground text-xs">
            One chart per logged metric
          </div>
        </div>
        {metricItems.length > 0 && (
          <Badge className="ml-auto" variant="outline">
            {metricItems.length} charts
          </Badge>
        )}
      </div>
      {isLoadingMetricNames ? (
        <div className="center-center h-40 text-muted-foreground text-sm">
          Loading metrics...
        </div>
      ) : metricItems.length === 0 ? (
        <div className="rounded-md bg-def-100 p-3 text-muted-foreground text-sm">
          No metric series have been logged for this run yet.
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {metricItems.map((item, index) => {
            const query = queries[index];
            const data = query?.data ?? [];
            const latestValue =
              summary[item.metric] ?? getLatestMetricSeriesValue(data);

            return (
              <article
                className="overflow-hidden rounded-md border bg-background"
                key={item.metric}
              >
                <div className="flex min-h-14 flex-wrap items-center gap-2 border-b p-4">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{item.metric}</div>
                    <div className="text-muted-foreground text-xs">
                      {data.length} points
                    </div>
                  </div>
                  <div className="rounded-md bg-def-100 px-2 py-1 text-right font-mono text-sm">
                    {formatMetricValue(latestValue)}
                  </div>
                </div>
                {query?.isLoading ? (
                  <div className="center-center h-[280px] text-muted-foreground text-sm">
                    Loading chart...
                  </div>
                ) : (
                  <MetricChart data={data} metric={item.metric} />
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function EvaluationTable({
  data,
  isLoading,
  search,
  page,
  sortBy,
  sortDirection,
  onSearchChange,
  onPageChange,
  onSortByChange,
  onSortDirectionChange,
}: {
  data?: MlEvaluationRowsData;
  isLoading: boolean;
  search: string;
  page: number;
  sortBy: string;
  sortDirection: 'asc' | 'desc';
  onSearchChange: (value: string) => void;
  onPageChange: (value: number) => void;
  onSortByChange: (value: string) => void;
  onSortDirectionChange: (value: 'asc' | 'desc') => void;
}) {
  const metricKeys = data?.metricKeys ?? [];
  const rows = useMemo(() => {
    const currentRows = data?.rows ?? [];
    if (!metricKeys.includes(sortBy)) {
      return currentRows;
    }

    return [...currentRows].sort((a, b) => {
      const aValue = getNumericMetric(a.metrics, sortBy);
      const bValue = getNumericMetric(b.metrics, sortBy);
      const delta =
        (aValue ?? Number.NEGATIVE_INFINITY) -
        (bValue ?? Number.NEGATIVE_INFINITY);
      return sortDirection === 'asc' ? delta : -delta;
    });
  }, [data?.rows, metricKeys, sortBy, sortDirection]);
  const totalPages = data?.totalPages ?? 1;

  return (
    <section className="mt-4 rounded-md border bg-card p-4">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div>
          <div className="font-medium">Evaluation table</div>
          <div className="text-muted-foreground text-xs">
            {data?.total ?? 0} samples
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Input
            className="w-48"
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search sample"
            value={search}
          />
          <select
            className="h-8 rounded-md border bg-background px-2 text-sm"
            onChange={(event) => onSortByChange(event.target.value)}
            value={sortBy}
          >
            <option value="createdAt">Newest</option>
            <option value="sampleId">Sample</option>
            <option value="epoch">Epoch</option>
            <option value="step">Step</option>
            {metricKeys.map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>
          <select
            className="h-8 rounded-md border bg-background px-2 text-sm"
            onChange={(event) =>
              onSortDirectionChange(event.target.value as 'asc' | 'desc')
            }
            value={sortDirection}
          >
            <option value="desc">Desc</option>
            <option value="asc">Asc</option>
          </select>
        </div>
      </div>
      {isLoading ? (
        <div className="center-center h-40 text-muted-foreground text-sm">
          Loading evaluation rows...
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-md bg-def-100 p-3 text-muted-foreground text-sm">
          {search
            ? 'No evaluation rows match this search.'
            : 'No visual evaluation rows have been logged for this run yet.'}
        </div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sample</TableHead>
                <TableHead>Epoch</TableHead>
                <TableHead>Step</TableHead>
                {IMAGE_KIND_COLUMNS.map((kind) => (
                  <TableHead key={kind}>{formatImageKind(kind)}</TableHead>
                ))}
                {metricKeys.map((key) => (
                  <TableHead className="text-right" key={key}>
                    {key}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">
                    {row.sampleId ?? row.id.slice(0, 8)}
                  </TableCell>
                  <TableCell>{row.epoch ?? '-'}</TableCell>
                  <TableCell>{row.step ?? '-'}</TableCell>
                  {IMAGE_KIND_COLUMNS.map((kind) => (
                    <TableCell key={kind}>
                      <EvaluationImageThumb
                        image={row.images.find((image) => image.kind === kind)}
                      />
                    </TableCell>
                  ))}
                  {metricKeys.map((key) => (
                    <TableCell className="text-right font-mono" key={key}>
                      {formatMetricValue(getNumericMetric(row.metrics, key))}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <div className="text-muted-foreground text-sm">
              Page {page} of {totalPages}
            </div>
            <div className="row gap-2">
              <Button
                disabled={page <= 1}
                onClick={() => onPageChange(Math.max(page - 1, 1))}
                variant="outline"
              >
                Previous
              </Button>
              <Button
                disabled={page >= totalPages}
                onClick={() => onPageChange(Math.min(page + 1, totalPages))}
                variant="outline"
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function EvaluationImageThumb({ image }: { image?: MlRunImage }) {
  if (!image) {
    return <span className="text-muted-foreground text-xs">-</span>;
  }

  return (
    <div className="h-16 w-20 overflow-hidden rounded-md border bg-def-100">
      {image.dataUrl ? (
        <img
          alt={image.caption || image.filename}
          className="h-full w-full object-contain"
          src={image.dataUrl}
          title={image.caption || image.filename}
        />
      ) : (
        <div className="center-center h-full text-muted-foreground text-xs">
          Missing
        </div>
      )}
    </div>
  );
}

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

function JsonDialogButton({
  title,
  value,
  emptyText,
  icon,
}: {
  title: string;
  value: Record<string, unknown>;
  emptyText: string;
  icon: LucideIcon;
}) {
  const isEmpty = Object.keys(value).length === 0;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button icon={icon} variant="outline">
          {title}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl" showCloseButton>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {isEmpty ? (
          <div className="rounded-md bg-def-100 p-3 text-muted-foreground text-sm">
            {emptyText}
          </div>
        ) : (
          <pre className="max-h-[70vh] overflow-auto rounded-md bg-background p-3 text-xs">
            {JSON.stringify(value, null, 2)}
          </pre>
        )}
      </DialogContent>
    </Dialog>
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

function getNumericMetric(value: unknown, key: string) {
  const record = normalizeRecord(value);
  const item = record[key];

  return typeof item === 'number' ? item : null;
}

function formatMetricValue(value: number | null) {
  return typeof value === 'number' ? formatNumber(value) : '-';
}

function getLatestMetricSeriesValue(data: MlMetricSeriesPoint[]) {
  const latestPoint = data.at(-1);

  return typeof latestPoint?.value === 'number' ? latestPoint.value : null;
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
