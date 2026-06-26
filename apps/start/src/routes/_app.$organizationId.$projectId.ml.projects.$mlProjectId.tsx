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
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { handleErrorToastOptions, useTRPC } from '@/integrations/trpc/react';
import { createProjectTitle } from '@/utils/title';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Link,
  Outlet,
  createFileRoute,
  useMatchRoute,
} from '@tanstack/react-router';
import { formatDistanceToNow } from 'date-fns';
import { ArrowRightIcon, CogIcon, GitCompareIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

const RUN_COLUMN_API_SOURCE = 'apiSource';
const RUN_COLUMN_TAGS = 'tags';
const STANDARD_RUN_COLUMNS = [
  { id: RUN_COLUMN_API_SOURCE, label: 'API source' },
  { id: RUN_COLUMN_TAGS, label: 'Tags' },
] as const;

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
  const project = useQuery(
    trpc.ml.project.queryOptions({ projectId, id: mlProjectId })
  );
  const runs = useQuery(trpc.ml.runs.queryOptions({ projectId, mlProjectId }));
  const updateProject = useMutation(
    trpc.ml.updateProject.mutationOptions({
      onError: handleErrorToastOptions({}),
      onSettled() {
        queryClient.invalidateQueries(trpc.ml.project.pathFilter());
        queryClient.invalidateQueries(trpc.ml.projects.pathFilter());
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

  useEffect(() => {
    setSelectedRunColumns(normalizeSavedRunColumns(project.data?.runColumns));
  }, [project.data?.runColumns]);

  const updateRunColumns = (columns: string[]) => {
    setSelectedRunColumns(columns);
    updateProject.mutate({
      id: mlProjectId,
      projectId,
      runColumns: columns,
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
              <TableHead>Run</TableHead>
              {showApiSourceColumn && <TableHead>API source</TableHead>}
              <TableHead>Status</TableHead>
              {showTagsColumn && <TableHead>Tags</TableHead>}
              {visibleMetricColumns.map((metric) => (
                <TableHead className="text-right" key={metric}>
                  {metric}
                </TableHead>
              ))}
              <TableHead>Updated</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(runs.data ?? []).map((run) => (
              <TableRow key={run.id}>
                <TableCell>
                  <Link
                    className="inline-flex items-center gap-2 font-medium hover:underline"
                    to="/$organizationId/$projectId/ml/projects/$mlProjectId/runs/$runId"
                    params={{
                      organizationId,
                      projectId,
                      mlProjectId,
                      runId: run.id,
                    }}
                  >
                    {run.name}
                    <ArrowRightIcon className="size-3.5" />
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
              <div className="grid max-h-[40vh] gap-2 overflow-auto pr-1">
                {availableMetricColumns.map((metric) => {
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
        </div>
      </DialogContent>
    </Dialog>
  );
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
  const alwaysVisibleColumns = 4;
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
