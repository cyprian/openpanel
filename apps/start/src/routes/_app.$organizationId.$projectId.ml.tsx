import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MlApiSourceCell } from '@/components/ml/api-source-cell';
import { MlProjectActions } from '@/components/ml/project-actions';
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
import { useMlPageContext } from '@/hooks/use-page-context-helpers';
import { handleErrorToastOptions, useTRPC } from '@/integrations/trpc/react';
import { createProjectTitle } from '@/utils/title';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Link,
  Outlet,
  createFileRoute,
  useMatchRoute,
  useNavigate,
} from '@tanstack/react-router';
import { formatDistanceToNow } from 'date-fns';
import { ArrowRightIcon, PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

export const Route = createFileRoute('/_app/$organizationId/$projectId/ml')({
  component: Component,
  head: () => ({
    meta: [{ title: createProjectTitle('ML Projects') }],
  }),
});

function Component() {
  const matchRoute = useMatchRoute();
  const isIndexRoute = matchRoute({
    to: '/$organizationId/$projectId/ml',
    fuzzy: false,
  });

  if (!isIndexRoute) {
    return <Outlet />;
  }

  return <MlProjectsIndex />;
}

function MlProjectsIndex() {
  const { organizationId, projectId } = Route.useParams();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const projects = useQuery(trpc.ml.projects.queryOptions({ projectId }));
  useMlPageContext('mlProjects', undefined, {
    visibleProjectCount: projects.data?.length ?? 0,
  });
  const createProject = useMutation(
    trpc.ml.createProject.mutationOptions({
      onError: handleErrorToastOptions({}),
      onSuccess(project) {
        setName('');
        queryClient.invalidateQueries(trpc.ml.projects.pathFilter());
        toast.success('ML project created');
        navigate({
          to: '/$organizationId/$projectId/ml/projects/$mlProjectId',
          params: {
            organizationId,
            projectId,
            mlProjectId: project.id,
          },
        });
      },
    })
  );

  return (
    <PageContainer>
      <PageHeader
        title="ML Projects"
        description="Group experiment runs by model, dataset, or training objective."
        className="mb-8"
      />
      <form
        className="mb-6 flex max-w-xl gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = name.trim();
          if (!trimmed) {
            return;
          }
          createProject.mutate({ projectId, name: trimmed });
        }}
      >
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="NAFNet, LaMa, Cosmos..."
        />
        <Button icon={PlusIcon} loading={createProject.isPending} type="submit">
          Create
        </Button>
      </form>
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>API source</TableHead>
              <TableHead>Runs</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(projects.data ?? []).map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <Link
                    className="inline-flex items-center gap-2 font-medium hover:underline"
                    to="/$organizationId/$projectId/ml/projects/$mlProjectId"
                    params={{ organizationId, projectId, mlProjectId: item.id }}
                  >
                    {item.name}
                    <ArrowRightIcon className="size-3.5" />
                  </Link>
                </TableCell>
                <TableCell>
                  <MlApiSourceCell name={item.client?.name} />
                </TableCell>
                <TableCell>{item._count.runs}</TableCell>
                <TableCell>
                  {formatDistanceToNow(item.updatedAt, { addSuffix: true })}
                </TableCell>
                <TableCell className="text-right">
                  <MlProjectActions
                    projectId={projectId}
                    mlProjectId={item.id}
                    mlProjectName={item.name}
                    runCount={item._count.runs}
                  />
                </TableCell>
              </TableRow>
            ))}
            {projects.data?.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center">
                  <div className="mx-auto max-w-sm">
                    <div className="font-medium">No ML projects yet</div>
                    <p className="mt-1 text-muted-foreground text-sm">
                      Create one above to group training runs by model, dataset,
                      or experiment.
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
