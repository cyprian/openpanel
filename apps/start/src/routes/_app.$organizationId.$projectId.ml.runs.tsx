import { handleErrorToastOptions, useTRPC } from '@/integrations/trpc/react';
import { MlStatusBadge } from '@/components/ml/status-badge';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { createProjectTitle } from '@/utils/title';
import type { IMlRunStatus } from '@openpanel/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, createFileRoute } from '@tanstack/react-router';
import { formatDistanceToNow } from 'date-fns';
import { ArrowRightIcon } from 'lucide-react';
import { toast } from 'sonner';

export const Route = createFileRoute('/_app/$organizationId/$projectId/ml/runs')({
  component: Component,
  head: () => ({
    meta: [{ title: createProjectTitle('ML Runs') }],
  }),
});

const ML_RUN_STATUSES = [
  'created',
  'running',
  'finished',
  'failed',
  'crashed',
] as const satisfies readonly IMlRunStatus[];

function Component() {
  const { organizationId, projectId } = Route.useParams();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const runs = useQuery(trpc.ml.runs.queryOptions({ projectId }));
  const updateRunStatus = useMutation(
    trpc.ml.updateRun.mutationOptions({
      onError: handleErrorToastOptions({}),
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.ml.runs.pathFilter());
        queryClient.invalidateQueries(trpc.ml.run.pathFilter());
        toast.success('Run status updated');
      },
    })
  );

  return (
    <PageContainer>
      <PageHeader
        title="Runs"
        description="All ML tracking runs in this OpenPanel project."
        className="mb-8"
      />
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Run</TableHead>
              <TableHead>ML Project</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="text-right">Action</TableHead>
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
                      mlProjectId: run.mlProjectId,
                      runId: run.id,
                    }}
                  >
                    {run.name}
                    <ArrowRightIcon className="size-3.5" />
                  </Link>
                </TableCell>
                <TableCell>{run.mlProject.name}</TableCell>
                <TableCell>
                  <MlStatusBadge status={run.status} />
                </TableCell>
                <TableCell>
                  {formatDistanceToNow(run.updatedAt, { addSuffix: true })}
                </TableCell>
                <TableCell className="text-right">
                  <Select
                    value={run.status}
                    disabled={updateRunStatus.isPending}
                    onValueChange={(status) => {
                      if (status === run.status) {
                        return;
                      }
                      updateRunStatus.mutate({
                        id: run.id,
                        projectId,
                        status: status as IMlRunStatus,
                      });
                    }}
                  >
                    <SelectTrigger className="ml-auto w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="end">
                      {ML_RUN_STATUSES.map((status) => (
                        <SelectItem key={status} value={status}>
                          <span className="capitalize">{status}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
            ))}
            {runs.data?.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center">
                  <div className="mx-auto max-w-sm">
                    <div className="font-medium">No runs yet</div>
                    <p className="mt-1 text-muted-foreground text-sm">
                      Start a run from the Python SDK and its metrics will show
                      up here.
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
