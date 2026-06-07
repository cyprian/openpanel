import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { MlStatusBadge } from '@/components/ml/status-badge';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { useTRPC } from '@/integrations/trpc/react';
import { createProjectTitle } from '@/utils/title';
import { useQuery } from '@tanstack/react-query';
import { Link, createFileRoute } from '@tanstack/react-router';
import { formatDistanceToNow } from 'date-fns';
import { ArrowRightIcon } from 'lucide-react';

export const Route = createFileRoute('/_app/$organizationId/$projectId/ml/runs')({
  component: Component,
  head: () => ({
    meta: [{ title: createProjectTitle('ML Runs') }],
  }),
});

function Component() {
  const { organizationId, projectId } = Route.useParams();
  const trpc = useTRPC();
  const runs = useQuery(trpc.ml.runs.queryOptions({ projectId }));

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
              </TableRow>
            ))}
            {runs.data?.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center">
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
