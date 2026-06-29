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
import { Switch } from '@/components/ui/switch';
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
import { useMlPageContext } from '@/hooks/use-page-context-helpers';
import { handleErrorToastOptions, useTRPC } from '@/integrations/trpc/react';
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { formatDistanceToNow } from 'date-fns';
import {
  ArrowLeftIcon,
  BracesIcon,
  DatabaseIcon,
  KeyIcon,
  Settings2Icon,
  type LucideIcon,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
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
const KEY_METRIC_COLORS = [
  '#16a34a',
  '#9333ea',
  '#ca8a04',
  '#dc2626',
  '#0891b2',
  '#db2777',
  '#4f46e5',
];
const ML_RUN_COLUMN_METRIC_PREFIX = 'metric:';
const ML_STANDARD_RUN_COLUMNS = new Set(['apiSource', 'tags']);

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
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [selectedKeyMetrics, setSelectedKeyMetrics] = useState<string[]>([]);
  const [pendingScrollMetric, setPendingScrollMetric] = useState<string | null>(
    null
  );
  const [showOtherMetricCharts, setShowOtherMetricCharts] = useState(false);
  const [showZeroMetricCharts, setShowZeroMetricCharts] = useState(false);
  const [showZeroMetricValues, setShowZeroMetricValues] = useState(false);
  const selectedKeyMetricsKey = selectedKeyMetrics.join('\u0000');
  const run = useQuery(trpc.ml.run.queryOptions({ projectId, id: runId }));
  const contextMlProjectId = run.data?.mlProjectId ?? fallbackMlProjectId;
  useMlPageContext(
    'mlRun',
    {
      runId,
      ...(contextMlProjectId ? { mlProjectId: contextMlProjectId } : {}),
    },
    {
      runName: run.data?.name,
      runStatus: run.data?.status,
      mlProjectName: run.data?.mlProject.name,
      keyMetrics: run.data?.keyMetrics,
    },
  );
  const updateRun = useMutation(
    trpc.ml.updateRun.mutationOptions({
      onError: handleErrorToastOptions({}),
      onSettled() {
        queryClient.invalidateQueries(trpc.ml.run.pathFilter());
        queryClient.invalidateQueries(trpc.ml.runs.pathFilter());
        queryClient.invalidateQueries(trpc.ml.project.pathFilter());
        queryClient.invalidateQueries(trpc.ml.projects.pathFilter());
      },
    })
  );
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
  const visibleSummary = filterZeroMetrics(summary, showZeroMetricValues);
  const keyMetrics = selectedKeyMetrics.filter(
    (metric) => visibleSummary[metric] !== undefined
  );
  const keyMetricTextColors = useMemo(
    () =>
      new Map(
        selectedKeyMetrics.map(
          (metric, index) => [metric, getKeyMetricColor(index)] as const
        )
      ),
    [selectedKeyMetrics]
  );
  const metricSeriesQueryByName = useMemo(
    () =>
      new Map(
        metricItems.map(
          (item, index) =>
            [item.metric, metricSeriesQueries[index]] as const
        )
      ),
    [metricItems, metricSeriesQueries]
  );
  const keyMetricChartItems: MetricChartItem[] = selectedKeyMetrics.flatMap(
    (metric, index) => {
      const query = metricSeriesQueryByName.get(metric);
      if (!query) {
        return [];
      }

      return [
        {
          color: keyMetricTextColors.get(metric) ?? getKeyMetricColor(index),
          metric,
          query,
        },
      ];
    }
  ).filter((item) =>
    shouldShowMetricChart(item, summary, showZeroMetricCharts)
  );
  const keyMetricChartNameSet = new Set(
    keyMetricChartItems.map((item) => item.metric)
  );
  const regularMetricChartItems = metricItems
    .filter((item) => !keyMetricChartNameSet.has(item.metric))
    .map((item) => ({
      color: ML_CHART_BLUE,
      metric: item.metric,
      query: metricSeriesQueryByName.get(item.metric),
    }))
    .filter((item) =>
      shouldShowMetricChart(item, summary, showZeroMetricCharts)
    );
  const shouldCollapseOtherMetricCharts = keyMetricChartItems.length > 0;
  const visibleRegularMetricChartItems =
    shouldCollapseOtherMetricCharts && !showOtherMetricCharts
      ? []
      : regularMetricChartItems;
  const shouldShowRegularMetricSection =
    !shouldCollapseOtherMetricCharts || showOtherMetricCharts;
  const config = normalizeRecord(run.data?.config);
  const metadata = normalizeRecord(run.data?.metadata);
  const mlProjectId = contextMlProjectId;
  const hasEvaluationRows = (evaluationSummary.data?.total ?? 0) > 0;

  useEffect(() => {
    setSelectedKeyMetrics(
      getSyncedKeyMetrics(
        run.data?.keyMetrics ?? [],
        run.data?.mlProject.runColumns ?? []
      )
    );
  }, [run.data?.keyMetrics, run.data?.mlProject.runColumns]);

  useEffect(() => {
    setPendingScrollMetric(null);
    setShowOtherMetricCharts(false);
    setShowZeroMetricCharts(false);
    setShowZeroMetricValues(false);
  }, [runId]);

  useEffect(() => {
    setShowOtherMetricCharts(false);
  }, [selectedKeyMetricsKey]);

  useEffect(() => {
    if (!pendingScrollMetric) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      scrollToMetricChart(pendingScrollMetric);
      setPendingScrollMetric(null);
    });

    return () => cancelAnimationFrame(frame);
  }, [
    pendingScrollMetric,
    showOtherMetricCharts,
    showZeroMetricCharts,
    keyMetricChartItems,
    visibleRegularMetricChartItems,
  ]);

  const updateKeyMetrics = (metrics: string[]) => {
    setSelectedKeyMetrics(metrics);
    updateRun.mutate({
      id: runId,
      projectId,
      keyMetrics: metrics,
    });
  };

  const toggleKeyMetric = (metric: string) => {
    const metrics = selectedKeyMetrics.includes(metric)
      ? selectedKeyMetrics.filter((item) => item !== metric)
      : [...new Set([...selectedKeyMetrics, metric])];
    updateKeyMetrics(metrics);
  };

  const handleMetricChartClick = (metric: string) => {
    const hasMetricSeries = metricItems.some((item) => item.metric === metric);
    if (!hasMetricSeries) {
      return;
    }

    const isVisibleRegularMetric = visibleRegularMetricChartItems.some(
      (item) => item.metric === metric
    );
    const isVisibleKeyMetric = keyMetricChartItems.some(
      (item) => item.metric === metric
    );

    if (isVisibleKeyMetric || isVisibleRegularMetric) {
      scrollToMetricChart(metric);
      return;
    }

    const isConfiguredKeyMetric = selectedKeyMetrics.includes(metric);
    if (shouldCollapseOtherMetricCharts && !isConfiguredKeyMetric) {
      setShowOtherMetricCharts(true);
    }

    if (!showZeroMetricCharts) {
      setShowZeroMetricCharts(true);
    }

    setPendingScrollMetric(metric);
  };

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
              <ViewSettingsDialog
                onShowZeroMetricChartsChange={setShowZeroMetricCharts}
                onShowZeroMetricValuesChange={setShowZeroMetricValues}
                showZeroMetricCharts={showZeroMetricCharts}
                showZeroMetricValues={showZeroMetricValues}
              />
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
      {keyMetricChartItems.length > 0 && (
        <>
          <MetricChartsSection
            badgeText={`${keyMetricChartItems.length} key ${keyMetricChartItems.length === 1 ? 'metric' : 'metrics'}`}
            description="Configured key metrics, shown first in dashboard order"
            isLoadingMetricNames={metricNames.isLoading}
            metricItems={keyMetricChartItems}
            summary={summary}
            title="Key metric trends"
          />
          {regularMetricChartItems.length > 0 && !showOtherMetricCharts && (
            <div className="-mt-4 mb-4 rounded-b-md border border-t-0 bg-card p-3">
              <Button
                className="w-full"
                onClick={() => setShowOtherMetricCharts(true)}
                variant="outline"
              >
                Show all metric charts ({regularMetricChartItems.length} more)
              </Button>
            </div>
          )}
        </>
      )}
      {keyMetrics.length > 0 && (
        <section className="mb-4 rounded-md border bg-card p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div>
              <div className="font-medium">Key metrics</div>
              <div className="text-muted-foreground text-xs">
                Highlighted final values for this run
              </div>
            </div>
            <Badge className="ml-auto" variant="outline">
              {keyMetrics.length} metrics
            </Badge>
          </div>
          <MetricsGrid
            chartMetricNames={metricItems.map((item) => item.metric)}
            keyMetrics={selectedKeyMetrics}
            metricTextColors={keyMetricTextColors}
            metrics={Object.fromEntries(
              keyMetrics.map((metric) => [metric, visibleSummary[metric]])
            )}
            onMetricChartClick={handleMetricChartClick}
            onToggleKeyMetric={toggleKeyMetric}
            showKeyToggle={false}
          />
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
          {Object.keys(visibleSummary).length > 0 && (
            <Badge className="ml-auto" variant="outline">
              {Object.keys(visibleSummary).length} metrics
            </Badge>
          )}
        </div>
        <MetricsGrid
          chartMetricNames={metricItems.map((item) => item.metric)}
          emptyText={
            showZeroMetricValues || Object.keys(summary).length === 0
              ? 'No scalar metrics have been logged for this run yet.'
              : 'No non-zero scalar metrics to display.'
          }
          keyMetrics={selectedKeyMetrics}
          metrics={visibleSummary}
          onMetricChartClick={handleMetricChartClick}
          onToggleKeyMetric={toggleKeyMetric}
        />
      </section>
      {shouldShowRegularMetricSection && (
        <MetricChartsSection
          description={
            keyMetricChartItems.length > 0
              ? 'All remaining logged metric series'
              : 'One chart per logged metric'
          }
          isLoadingMetricNames={metricNames.isLoading}
          metricItems={visibleRegularMetricChartItems}
          noDataText={
            showZeroMetricCharts
              ? 'No metric series have been logged for this run yet.'
              : 'No non-zero metric series to display.'
          }
          summary={summary}
          title={
            keyMetricChartItems.length > 0
              ? 'Other metric trends'
              : 'Metric trends'
          }
        />
      )}
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

type MlRunImage = {
  id: string;
  name: string;
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

type MetricSeriesQueryResult = {
  data?: MlMetricSeriesPoint[];
  isLoading: boolean;
};

type MetricChartItem = {
  color: string;
  metric: string;
  query?: MetricSeriesQueryResult;
};

function ViewSettingsDialog({
  onShowZeroMetricChartsChange,
  onShowZeroMetricValuesChange,
  showZeroMetricCharts,
  showZeroMetricValues,
}: {
  onShowZeroMetricChartsChange: (value: boolean) => void;
  onShowZeroMetricValuesChange: (value: boolean) => void;
  showZeroMetricCharts: boolean;
  showZeroMetricValues: boolean;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button icon={Settings2Icon} variant="outline">
          View settings
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle>View settings</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <label className="flex items-center justify-between gap-4 rounded-md border bg-background p-3">
            <span className="min-w-0">
              <span className="block font-medium text-sm">
                Show zero-value metrics
              </span>
              <span className="block text-muted-foreground text-xs">
                Include final metric values equal to 0.
              </span>
            </span>
            <Switch
              checked={showZeroMetricValues}
              onCheckedChange={onShowZeroMetricValuesChange}
            />
          </label>
          <label className="flex items-center justify-between gap-4 rounded-md border bg-background p-3">
            <span className="min-w-0">
              <span className="block font-medium text-sm">
                Show zero-only charts
              </span>
              <span className="block text-muted-foreground text-xs">
                Include charts where every logged point is 0.
              </span>
            </span>
            <Switch
              checked={showZeroMetricCharts}
              onCheckedChange={onShowZeroMetricChartsChange}
            />
          </label>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MetricsGrid({
  chartMetricNames,
  emptyText = 'No scalar metrics have been logged for this run yet.',
  keyMetrics,
  metricTextColors,
  metrics,
  onMetricChartClick,
  onToggleKeyMetric,
  showKeyToggle = true,
}: {
  chartMetricNames: string[];
  emptyText?: string;
  keyMetrics: string[];
  metricTextColors?: Map<string, string>;
  metrics: Record<string, number>;
  onMetricChartClick: (metric: string) => void;
  onToggleKeyMetric: (metric: string) => void;
  showKeyToggle?: boolean;
}) {
  const entries = Object.entries(metrics);
  const chartMetricNameSet = new Set(chartMetricNames);
  const keyMetricSet = new Set(keyMetrics);

  if (entries.length === 0) {
    return (
      <div className="rounded-md bg-def-100 p-3 text-muted-foreground text-sm">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {entries.map(([key, value]) => {
        const hasChart = chartMetricNameSet.has(key);
        const isKeyMetric = keyMetricSet.has(key);
        const textColor = metricTextColors?.get(key);

        return (
          <article
            className="relative rounded-md border bg-background transition-colors hover:bg-accent"
            key={key}
          >
            {showKeyToggle && (
              <button
                aria-label={
                  isKeyMetric
                    ? `Remove ${key} from key metrics`
                    : `Add ${key} to key metrics`
                }
                className="absolute top-2 right-2 z-10 rounded-sm p-1 text-white/50 transition-colors hover:text-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[selected=true]:text-amber-400"
                data-selected={isKeyMetric}
                onClick={() => onToggleKeyMetric(key)}
                type="button"
              >
                <KeyIcon className="size-3.5" />
              </button>
            )}
            <button
              className="block w-full p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default data-[with-key-toggle=true]:pr-9"
              data-with-key-toggle={showKeyToggle}
              disabled={!hasChart}
              onClick={() => onMetricChartClick(key)}
              type="button"
            >
              <div className="truncate text-muted-foreground text-xs">{key}</div>
              <div
                className="mt-1 truncate font-mono font-semibold text-lg"
                style={{ color: textColor }}
              >
                {formatNumber(value)}
              </div>
            </button>
          </article>
        );
      })}
    </div>
  );
}

function MetricChartsSection({
  badgeText,
  description,
  isLoadingMetricNames,
  metricItems,
  noDataText = 'No metric series have been logged for this run yet.',
  summary,
  title,
}: {
  badgeText?: string;
  description: string;
  isLoadingMetricNames: boolean;
  metricItems: MetricChartItem[];
  noDataText?: string;
  summary: Record<string, number>;
  title: string;
}) {
  return (
    <section className="mb-4 rounded-md border bg-card p-4">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div>
          <div className="font-medium">{title}</div>
          <div className="text-muted-foreground text-xs">
            {description}
          </div>
        </div>
        {metricItems.length > 0 && (
          <Badge className="ml-auto" variant="outline">
            {badgeText ?? `${metricItems.length} charts`}
          </Badge>
        )}
      </div>
      {isLoadingMetricNames ? (
        <div className="center-center h-40 text-muted-foreground text-sm">
          Loading metrics...
        </div>
      ) : metricItems.length === 0 ? (
        <div className="rounded-md bg-def-100 p-3 text-muted-foreground text-sm">
          {noDataText}
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {metricItems.map((item) => {
            const data = item.query?.data ?? [];
            const latestValue =
              summary[item.metric] ?? getLatestMetricSeriesValue(data);

            return (
              <article
                className="scroll-mt-24 overflow-hidden rounded-md border bg-background"
                id={getMetricChartId(item.metric)}
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
                {item.query?.isLoading ? (
                  <div className="center-center h-[280px] text-muted-foreground text-sm">
                    Loading chart...
                  </div>
                ) : (
                  <MetricChart
                    color={item.color}
                    data={data}
                    metric={item.metric}
                  />
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
  const imageColumnNames = useMemo(
    () => getOrderedImageNames(rows.flatMap((row) => row.images)),
    [rows]
  );
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
          <div className="overflow-x-auto">
            <Table className="min-w-max">
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-32">Sample</TableHead>
                  <TableHead>Epoch</TableHead>
                  <TableHead>Step</TableHead>
                  {imageColumnNames.map((name) => (
                    <TableHead className="min-w-28" key={name}>
                      {name}
                    </TableHead>
                  ))}
                  {metricKeys.map((key) => (
                    <TableHead className="min-w-24 text-right" key={key}>
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
                    {imageColumnNames.map((name) => {
                      const images = row.images.filter(
                        (image) => image.name === name
                      );

                      return (
                        <TableCell key={name}>
                          <EvaluationImageThumb images={images} />
                        </TableCell>
                      );
                    })}
                    {metricKeys.map((key) => (
                      <TableCell className="text-right font-mono" key={key}>
                        {formatMetricValue(getNumericMetric(row.metrics, key))}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
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

function EvaluationImageThumb({ images }: { images: MlRunImage[] }) {
  const image = images[0];
  if (!image) {
    return <span className="text-muted-foreground text-xs">-</span>;
  }

  return (
    <div className="relative h-16 w-20 overflow-hidden rounded-md border bg-def-100">
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
      {images.length > 1 && (
        <div className="absolute right-1 bottom-1 rounded bg-background/90 px-1.5 py-0.5 font-medium text-[10px] shadow">
          +{images.length - 1}
        </div>
      )}
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
  color,
  data,
  metric,
}: {
  color: string;
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
            content={<MetricTooltip color={color} metric={metric} />}
            cursor={{ stroke: color, strokeDasharray: '4 4' }}
          />
          <Line
            activeDot={{
              r: 5,
              fill: color,
              stroke: 'var(--background)',
              strokeWidth: 2,
            }}
            dataKey="value"
            dot={{
              r: 2,
              fill: color,
              stroke: color,
              strokeWidth: 1,
            }}
            isAnimationActive={false}
            stroke={color}
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
  color,
  payload,
  metric,
}: TooltipProps<number, string> & { color: string; metric: string }) {
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
      <ChartTooltipItem color={color}>
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

function filterZeroMetrics(
  metrics: Record<string, number>,
  showZeroMetricValues: boolean
) {
  if (showZeroMetricValues) {
    return metrics;
  }

  return Object.fromEntries(
    Object.entries(metrics).filter(([, value]) => value !== 0)
  );
}

function shouldShowMetricChart(
  item: MetricChartItem,
  summary: Record<string, number>,
  showZeroMetricCharts: boolean
) {
  if (showZeroMetricCharts) {
    return true;
  }

  const data = item.query?.data ?? [];
  if (data.some((point) => point.value !== 0)) {
    return true;
  }

  if (data.length > 0) {
    return false;
  }

  return summary[item.metric] !== 0;
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

function getSyncedKeyMetrics(keyMetrics: string[], runColumns: string[]) {
  return getUniqueStrings([
    ...getProjectKeyMetricsFromRunColumns(runColumns),
    ...keyMetrics,
  ]);
}

function getProjectKeyMetricsFromRunColumns(runColumns: string[]) {
  const metrics: string[] = [];

  for (const column of runColumns) {
    if (column.startsWith(ML_RUN_COLUMN_METRIC_PREFIX)) {
      metrics.push(column.slice(ML_RUN_COLUMN_METRIC_PREFIX.length));
      continue;
    }

    if (!ML_STANDARD_RUN_COLUMNS.has(column)) {
      metrics.push(column);
    }
  }

  return metrics;
}

function getUniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function getKeyMetricColor(index: number) {
  return KEY_METRIC_COLORS[index % KEY_METRIC_COLORS.length];
}

function getMetricChartId(metric: string) {
  return `metric-chart-${encodeURIComponent(metric)}`;
}

function scrollToMetricChart(metric: string) {
  document.getElementById(getMetricChartId(metric))?.scrollIntoView({
    behavior: 'smooth',
    block: 'start',
  });
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

function getOrderedImageNames(images: MlRunImage[]) {
  const names = new Set<string>();
  for (const image of images) {
    names.add(image.name);
  }

  return [...names];
}
