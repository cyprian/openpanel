import { Button, LinkButton } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MlApiSourceCell } from '@/components/ml/api-source-cell';
import { MlRunActions } from '@/components/ml/run-actions';
import { MlRunTags } from '@/components/ml/run-tags';
import { MlStatusBadge } from '@/components/ml/status-badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { useMlPageContext } from '@/hooks/use-page-context-helpers';
import { handleErrorToastOptions, useTRPC } from '@/integrations/trpc/react';
import { showConfirm } from '@/modals';
import { cn } from '@/utils/cn';
import { createProjectTitle } from '@/utils/title';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Link,
  Outlet,
  createFileRoute,
  useMatchRoute,
} from '@tanstack/react-router';
import { formatDistanceToNow } from 'date-fns';
import {
  ArrowRightIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ChevronsUpDownIcon,
  CogIcon,
  GitCompareIcon,
  SearchIcon,
  TrashIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';

const RUN_COLUMN_API_SOURCE = 'apiSource';
const RUN_COLUMN_TAGS = 'tags';
const RUN_COLUMN_NAME = 'name';
const RUN_COLUMN_STATUS = 'status';
const RUN_COLUMN_UPDATED_AT = 'updatedAt';
const RUNS_REFETCH_INTERVAL_MS = 10_000;
const STANDARD_RUN_COLUMNS = [
  { id: RUN_COLUMN_API_SOURCE, label: 'API source' },
  { id: RUN_COLUMN_TAGS, label: 'Tags' },
] as const;
type RunSortDirection = 'asc' | 'desc';
type RunSort = {
  columnId: string;
  direction: RunSortDirection;
};

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/ml/projects/$mlProjectId',
)({
  component: Component,
  head: () => ({
    meta: [{ title: createProjectTitle('ML Project') }],
  }),
});

function Component() {
  const matchRoute = useMatchRoute();
  const isProjectIndexRoute = matchRoute({
    to: '/$organizationId/$projectId/ml/projects/$mlProjectId',
    fuzzy: false,
  });

  if (!isProjectIndexRoute) {
    return <Outlet />;
  }

  return <MlProjectRunsIndex />;
}

function MlProjectRunsIndex() {
  const { organizationId, projectId, mlProjectId } = Route.useParams();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedRunColumns, setSelectedRunColumns] = useState<string[]>([]);
  const [selectedRunIds, setSelectedRunIds] = useState<string[]>([]);
  const [runSort, setRunSort] = useState<RunSort | null>(null);
  const project = useQuery(
    trpc.ml.project.queryOptions({ projectId, id: mlProjectId })
  );
  const runs = useQuery({
    ...trpc.ml.runs.queryOptions({ projectId, mlProjectId }),
    refetchInterval: RUNS_REFETCH_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });
  useMlPageContext(
    'mlProject',
    { mlProjectId },
    {
      mlProjectName: project.data?.name,
      visibleRunCount: runs.data?.length ?? 0,
    },
  );
  const updateProject = useMutation(
    trpc.ml.updateProject.mutationOptions({
      onError: handleErrorToastOptions({}),
      onSettled() {
        queryClient.invalidateQueries(trpc.ml.project.pathFilter());
        queryClient.invalidateQueries(trpc.ml.projects.pathFilter());
        queryClient.invalidateQueries(trpc.ml.run.pathFilter());
        queryClient.invalidateQueries(trpc.ml.runs.pathFilter());
      },
    })
  );
  const archiveRuns = useMutation(
    trpc.ml.archiveRuns.mutationOptions({
      onError: handleErrorToastOptions({}),
      onSuccess: (deletedRuns) => {
        queryClient.invalidateQueries(trpc.ml.pathFilter());
        setSelectedRunIds([]);
        toast.success(
          `Deleted ${deletedRuns.length} ${deletedRuns.length === 1 ? 'run' : 'runs'}`
        );
      },
    })
  );
  const availableMetricColumns = useMemo(
    () => getAvailableMetricColumns(runs.data ?? []),
    [runs.data]
  );
  const visibleMetricColumns = availableMetricColumns.filter((metric) =>
    selectedRunColumns.includes(getMetricColumnId(metric))
  );
  const showApiSourceColumn = selectedRunColumns.includes(
    RUN_COLUMN_API_SOURCE
  );
  const showTagsColumn = selectedRunColumns.includes(RUN_COLUMN_TAGS);
  const sortedRuns = useMemo(() => {
    const data = runs.data ?? [];

    if (!runSort) {
      return data;
    }

    return data
      .map((run, index) => ({ index, run }))
      .sort((a, b) => {
        const comparison = compareSortValues(
          getRunSortValue(a.run, runSort.columnId),
          getRunSortValue(b.run, runSort.columnId),
          runSort.direction
        );

        return comparison || a.index - b.index;
      })
      .map(({ run }) => run);
  }, [runs.data, runSort]);
  const selectedRunIdSet = useMemo(
    () => new Set(selectedRunIds),
    [selectedRunIds]
  );
  const selectedRuns = sortedRuns.filter((run) => selectedRunIdSet.has(run.id));
  const selectedRunCount = selectedRuns.length;
  const allRunsSelected =
    sortedRuns.length > 0 && selectedRunCount === sortedRuns.length;
  const someRunsSelected = selectedRunCount > 0 && !allRunsSelected;

  const handleSort = (columnId: string) => {
    setRunSort((current) => ({
      columnId,
      direction: getNextSortDirection(current, columnId),
    }));
  };

  useEffect(() => {
    setSelectedRunColumns(normalizeSavedRunColumns(project.data?.runColumns));
  }, [project.data?.runColumns]);

  useEffect(() => {
    const availableRunIds = new Set((runs.data ?? []).map((run) => run.id));
    setSelectedRunIds((current) => {
      const next = current.filter((id) => availableRunIds.has(id));
      return next.length === current.length ? current : next;
    });
  }, [runs.data]);

  const updateRunColumns = (columns: string[]) => {
    setSelectedRunColumns(columns);
    updateProject.mutate({
      id: mlProjectId,
      projectId,
      runColumns: columns,
    });
  };

  const toggleAllRuns = (isChecked: boolean) => {
    setSelectedRunIds(isChecked ? sortedRuns.map((run) => run.id) : []);
  };

  const toggleRunSelection = (runId: string, isChecked: boolean) => {
    setSelectedRunIds((current) =>
      isChecked
        ? [...new Set([...current, runId])]
        : current.filter((id) => id !== runId)
    );
  };

  const deleteSelectedRuns = () => {
    const ids = selectedRuns.map((run) => run.id);
    if (ids.length === 0) {
      return;
    }

    showConfirm({
      title: 'Delete selected runs',
      text: `Are you sure you want to delete ${ids.length} ${ids.length === 1 ? 'run' : 'runs'}? This also removes associated metrics, images, and evaluation rows. This action cannot be undone.`,
      onConfirm: () => archiveRuns.mutate({ ids, projectId }),
    });
  };

  return (
    <PageContainer>
      <PageHeader
        title={project.data?.name ?? 'ML Project'}
        description="Runs and scalar metrics for this experiment project."
        className="mb-8"
        actions={
          <>
            {selectedRunCount > 0 && (
              <Button
                icon={TrashIcon}
                loading={archiveRuns.isPending}
                onClick={deleteSelectedRuns}
                variant="destructive"
              >
                Delete {selectedRunCount}
              </Button>
            )}
            <Button
              icon={CogIcon}
              onClick={() => setSettingsOpen(true)}
              variant="outline"
            >
              Settings
            </Button>
            <LinkButton
              icon={GitCompareIcon}
              search={{ mlProjectId }}
              to="/$organizationId/$projectId/ml/compare"
              params={{ organizationId, projectId }}
              variant="outline"
            >
              Compare
            </LinkButton>
          </>
        }
      />
      <RunColumnSettingsDialog
        availableMetricColumns={availableMetricColumns}
        onOpenChange={setSettingsOpen}
        onSelectedRunColumnsChange={updateRunColumns}
        open={settingsOpen}
        selectedRunColumns={selectedRunColumns}
      />
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  aria-label="Select all runs"
                  checked={
                    someRunsSelected ? 'indeterminate' : allRunsSelected
                  }
                  disabled={sortedRuns.length === 0 || archiveRuns.isPending}
                  onCheckedChange={(value) => toggleAllRuns(value === true)}
                />
              </TableHead>
              <TableHead className="w-14 text-right">#</TableHead>
              <SortableRunTableHead
                columnId={RUN_COLUMN_NAME}
                onSort={handleSort}
                sort={runSort}
              >
                Run
              </SortableRunTableHead>
              {showApiSourceColumn && (
                <SortableRunTableHead
                  columnId={RUN_COLUMN_API_SOURCE}
                  onSort={handleSort}
                  sort={runSort}
                >
                  API source
                </SortableRunTableHead>
              )}
              <SortableRunTableHead
                columnId={RUN_COLUMN_STATUS}
                onSort={handleSort}
                sort={runSort}
              >
                Status
              </SortableRunTableHead>
              {showTagsColumn && (
                <SortableRunTableHead
                  columnId={RUN_COLUMN_TAGS}
                  onSort={handleSort}
                  sort={runSort}
                >
                  Tags
                </SortableRunTableHead>
              )}
              {visibleMetricColumns.map((metric) => (
                <SortableRunTableHead
                  align="right"
                  columnId={getMetricColumnId(metric)}
                  key={metric}
                  onSort={handleSort}
                  sort={runSort}
                >
                  {metric}
                </SortableRunTableHead>
              ))}
              <SortableRunTableHead
                columnId={RUN_COLUMN_UPDATED_AT}
                onSort={handleSort}
                sort={runSort}
              >
                Updated
              </SortableRunTableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedRuns.map((run, index) => (
              <TableRow key={run.id}>
                <TableCell>
                  <Checkbox
                    aria-label={`Select ${run.name}`}
                    checked={selectedRunIdSet.has(run.id)}
                    disabled={archiveRuns.isPending}
                    onCheckedChange={(value) =>
                      toggleRunSelection(run.id, value === true)
                    }
                  />
                </TableCell>
                <TableCell className="text-right font-mono text-muted-foreground">
                  {index + 1}
                </TableCell>
                <TableCell className="overflow-hidden">
                  <Link
                    className="flex min-w-0 max-w-full items-center gap-2 font-medium hover:underline"
                    to="/$organizationId/$projectId/ml/projects/$mlProjectId/runs/$runId"
                    params={{
                      organizationId,
                      projectId,
                      mlProjectId,
                      runId: run.id,
                    }}
                    title={run.name}
                  >
                    <span className="min-w-0 truncate">{run.name}</span>
                    <ArrowRightIcon className="size-3.5 shrink-0" />
                  </Link>
                </TableCell>
                {showApiSourceColumn && (
                  <TableCell>
                    <MlApiSourceCell name={run.client?.name} />
                  </TableCell>
                )}
                <TableCell>
                  <MlStatusBadge status={run.status} />
                </TableCell>
                {showTagsColumn && (
                  <TableCell className="max-w-[24rem]">
                    <MlRunTags tags={run.tags} />
                  </TableCell>
                )}
                {visibleMetricColumns.map((metric) => (
                  <TableCell className="text-right font-mono" key={metric}>
                    {formatMetricValue(
                      normalizeNumberRecord(run.summary)[metric]
                    )}
                  </TableCell>
                ))}
                <TableCell>
                  {formatDistanceToNow(run.updatedAt, { addSuffix: true })}
                </TableCell>
                <TableCell className="text-right">
                  <MlRunActions
                    projectId={projectId}
                    runId={run.id}
                    runName={run.name}
                    status={run.status}
                  />
                </TableCell>
              </TableRow>
            ))}
            {runs.data?.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={getRunTableColumnCount({
                    metricColumns: visibleMetricColumns.length,
                    showApiSourceColumn,
                    showTagsColumn,
                  })}
                  className="py-10 text-center"
                >
                  <div className="mx-auto max-w-sm">
                    <div className="font-medium">No runs yet</div>
                    <p className="mt-1 text-muted-foreground text-sm">
                      Start a run from the Python SDK to see metrics flow into
                      this project.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </PageContainer>
  );
}

function RunColumnSettingsDialog({
  availableMetricColumns,
  onOpenChange,
  onSelectedRunColumnsChange,
  open,
  selectedRunColumns,
}: {
  availableMetricColumns: string[];
  onOpenChange: (open: boolean) => void;
  onSelectedRunColumnsChange: (columns: string[]) => void;
  open: boolean;
  selectedRunColumns: string[];
}) {
  const [metricSearch, setMetricSearch] = useState('');
  const filteredMetricColumns = useMemo(() => {
    const search = metricSearch.trim().toLocaleLowerCase();

    if (!search) {
      return availableMetricColumns;
    }

    return availableMetricColumns.filter((metric) =>
      metric.toLocaleLowerCase().includes(search)
    );
  }, [availableMetricColumns, metricSearch]);

  const toggleColumn = (columnId: string, isChecked: boolean) => {
    onSelectedRunColumnsChange(
      isChecked
        ? [...new Set([...selectedRunColumns, columnId])]
        : selectedRunColumns.filter((item) => item !== columnId)
    );
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent showCloseButton>
        <DialogHeader>
          <DialogTitle>Run columns</DialogTitle>
          <DialogDescription>
            Select columns to show on this ML project.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <div className="mb-2 font-medium text-sm">Standard columns</div>
            <div className="grid gap-2">
              {STANDARD_RUN_COLUMNS.map((column) => (
                <RunColumnCheckbox
                  checked={selectedRunColumns.includes(column.id)}
                  key={column.id}
                  label={column.label}
                  onCheckedChange={(isChecked) =>
                    toggleColumn(column.id, isChecked)
                  }
                />
              ))}
            </div>
          </div>
          <div>
            <div className="mb-2 font-medium text-sm">Final metrics</div>
            {availableMetricColumns.length === 0 ? (
              <div className="rounded-md bg-def-100 p-3 text-muted-foreground text-sm">
                No final metrics are available yet.
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <SearchIcon className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground" />
                  <Input
                    aria-label="Search final metrics"
                    className="pl-9"
                    onChange={(event) => setMetricSearch(event.target.value)}
                    placeholder="Search metrics"
                    value={metricSearch}
                  />
                </div>
                {filteredMetricColumns.length === 0 ? (
                  <div className="rounded-md bg-def-100 p-3 text-muted-foreground text-sm">
                    No metrics found.
                  </div>
                ) : (
                  <div className="grid max-h-[40vh] gap-2 overflow-auto pr-1">
                    {filteredMetricColumns.map((metric) => {
                      const columnId = getMetricColumnId(metric);
                      const checked = selectedRunColumns.includes(columnId);

                      return (
                        <RunColumnCheckbox
                          checked={checked}
                          key={metric}
                          label={metric}
                          onCheckedChange={(isChecked) =>
                            toggleColumn(columnId, isChecked)
                          }
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SortableRunTableHead({
  align = 'left',
  children,
  columnId,
  onSort,
  sort,
}: {
  align?: 'left' | 'right';
  children: ReactNode;
  columnId: string;
  onSort: (columnId: string) => void;
  sort: RunSort | null;
}) {
  const isSorted = sort?.columnId === columnId;
  const SortIcon = getSortIcon(sort, columnId);

  return (
    <TableHead
      aria-sort={getAriaSortValue(sort, columnId)}
      className={cn(align === 'right' && 'text-right')}
    >
      <button
        className={cn(
          'inline-flex max-w-full items-center gap-1 rounded-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          align === 'right' && 'ml-auto justify-end'
        )}
        onClick={() => onSort(columnId)}
        type="button"
      >
        <span className="truncate">{children}</span>
        <SortIcon
          className={cn('size-3.5 shrink-0', !isSorted && 'opacity-35')}
        />
      </button>
    </TableHead>
  );
}

function getNextSortDirection(current: RunSort | null, columnId: string) {
  if (current?.columnId === columnId && current.direction === 'asc') {
    return 'desc';
  }

  return 'asc';
}

function getSortIcon(sort: RunSort | null, columnId: string) {
  if (sort?.columnId !== columnId) {
    return ChevronsUpDownIcon;
  }

  return sort.direction === 'asc' ? ChevronUpIcon : ChevronDownIcon;
}

function getAriaSortValue(sort: RunSort | null, columnId: string) {
  if (sort?.columnId !== columnId) {
    return 'none';
  }

  return sort.direction === 'asc' ? 'ascending' : 'descending';
}

function RunColumnCheckbox({
  checked,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-md border bg-background px-3 py-2 text-sm transition-colors hover:bg-accent">
      <Checkbox
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
      />
      <span className="min-w-0 truncate font-mono">{label}</span>
    </label>
  );
}

function getAvailableMetricColumns(runs: Array<{ summary: unknown }>) {
  const columns = new Set<string>();
  for (const run of runs) {
    for (const metric of Object.keys(normalizeNumberRecord(run.summary))) {
      columns.add(metric);
    }
  }

  return [...columns].sort();
}

function getMetricColumnId(metric: string) {
  return `metric:${metric}`;
}

function getMetricNameFromColumnId(columnId: string) {
  return columnId.slice('metric:'.length);
}

function getRunSortValue(
  run: {
    client?: { name?: string | null } | null;
    name: string;
    status: string;
    summary: unknown;
    tags: string[];
    updatedAt: Date | string | number;
  },
  columnId: string
) {
  if (columnId.startsWith('metric:')) {
    return normalizeNumberRecord(run.summary)[getMetricNameFromColumnId(
      columnId
    )];
  }

  if (columnId === RUN_COLUMN_API_SOURCE) {
    return run.client?.name ?? null;
  }

  if (columnId === RUN_COLUMN_NAME) {
    return run.name;
  }

  if (columnId === RUN_COLUMN_STATUS) {
    return run.status;
  }

  if (columnId === RUN_COLUMN_TAGS) {
    return run.tags.join(' ');
  }

  if (columnId === RUN_COLUMN_UPDATED_AT) {
    const timestamp = new Date(run.updatedAt).getTime();
    return Number.isNaN(timestamp) ? null : timestamp;
  }

  return null;
}

function compareSortValues(
  a: number | string | null | undefined,
  b: number | string | null | undefined,
  direction: RunSortDirection
) {
  if (a == null && b == null) {
    return 0;
  }

  if (a == null) {
    return 1;
  }

  if (b == null) {
    return -1;
  }

  const comparison =
    typeof a === 'number' && typeof b === 'number'
      ? a - b
      : String(a).localeCompare(String(b), undefined, {
          numeric: true,
          sensitivity: 'base',
        });

  return direction === 'asc' ? comparison : -comparison;
}

function normalizeSavedRunColumns(columns: string[] | undefined) {
  return (columns ?? []).map((column) =>
    column.startsWith('metric:') ||
    STANDARD_RUN_COLUMNS.some((item) => item.id === column)
      ? column
      : getMetricColumnId(column)
  );
}

function getRunTableColumnCount({
  metricColumns,
  showApiSourceColumn,
  showTagsColumn,
}: {
  metricColumns: number;
  showApiSourceColumn: boolean;
  showTagsColumn: boolean;
}) {
  const alwaysVisibleColumns = 6;
  return (
    alwaysVisibleColumns +
    metricColumns +
    (showApiSourceColumn ? 1 : 0) +
    (showTagsColumn ? 1 : 0)
  );
}

function normalizeNumberRecord(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const result: Record<string, number> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'number') {
      result[key] = item;
    }
  }

  return result;
}

function formatMetricValue(value: number | undefined) {
  if (typeof value !== 'number') {
    return '-';
  }

  return Number.isInteger(value) ? value : value.toFixed(4);
}
