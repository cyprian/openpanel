import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';
import { formatDistanceToNow } from 'date-fns';
import { ArrowRightIcon, PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/ml/projects/$mlProjectId',
)({
  component: Component,
  head: () => ({
    meta: [{ title: createProjectTitle('ML Project') }],
  }),
});

function Component() {
  const { organizationId, projectId, mlProjectId } = Route.useParams();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const project = useQuery(
    trpc.ml.project.queryOptions({ projectId, id: mlProjectId })
  );
  const runs = useQuery(
    trpc.ml.runs.queryOptions({ projectId, mlProjectId })
  );
  const createRun = useMutation(
    trpc.ml.createRun.mutationOptions({
      onError: handleErrorToastOptions({}),
      onSuccess(run) {
        setName('');
        queryClient.invalidateQueries(trpc.ml.runs.pathFilter());
        toast.success('Run created');
        navigate({
          to: '/$organizationId/$projectId/ml/runs/$runId',
          params: {
            organizationId,
            projectId,
            runId: run.id,
          },
        });
      },
    })
  );

  return (
    <PageContainer>
      <PageHeader
        title={project.data?.name ?? 'ML Project'}
        description="Runs and scalar metrics for this experiment project."
        className="mb-8"
      />
      <form
        className="mb-6 flex max-w-xl gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          createRun.mutate({
            projectId,
            mlProjectId,
            name: name.trim() || undefined,
            status: 'running',
            tags: [],
            config: {},
            metadata: {},
          });
        }}
      >
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="training-run-001"
        />
        <Button icon={PlusIcon} loading={createRun.isPending} type="submit">
          Create run
        </Button>
      </form>
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Run</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead>Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(runs.data ?? []).map((run) => (
              <TableRow key={run.id}>
                <TableCell>
                  <Link
                    className="inline-flex items-center gap-2 font-medium hover:underline"
                    to="/$organizationId/$projectId/ml/runs/$runId"
                    params={{ organizationId, projectId, runId: run.id }}
                  >
                    {run.name}
                    <ArrowRightIcon className="size-3.5" />
                  </Link>
                </TableCell>
                <TableCell>{run.status}</TableCell>
                <TableCell>{run.tags.join(', ') || '-'}</TableCell>
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
                      Create a run above or start one from the Python SDK to see
                      metrics flow into this project.
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
