import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { showConfirm } from '@/modals';
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
import { ArrowRightIcon, PlusIcon, TrashIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
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
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const projects = useQuery({
    ...trpc.ml.projects.queryOptions({ projectId }),
    refetchInterval: 60_000,
  });
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
  const archiveProject = useMutation(
    trpc.ml.archiveProject.mutationOptions({
      onSuccess: (_, { id }) => {
        setSelectedProjectIds((current) => current.filter((item) => item !== id));
      },
    })
  );
  const archiveProjects = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) {
        await archiveProject.mutateAsync({ id, projectId });
      }
      return ids;
    },
    onError: handleErrorToastOptions({}),
    onSuccess: (ids) => {
      toast.success(
        `Deleted ${ids.length} ML ${ids.length === 1 ? 'project' : 'projects'}`
      );
    },
    onSettled: async () => {
      await queryClient.invalidateQueries(trpc.ml.pathFilter());
    },
  });
  const selectedProjectIdSet = new Set(selectedProjectIds);
  const selectedProjects = (projects.data ?? []).filter((item) =>
    selectedProjectIdSet.has(item.id)
  );
  const selectedProjectCount = selectedProjects.length;
  const allProjectsSelected =
    selectedProjectCount > 0 && selectedProjectCount === projects.data?.length;
  const someProjectsSelected = selectedProjectCount > 0 && !allProjectsSelected;

  useEffect(() => {
    const availableProjectIds = new Set((projects.data ?? []).map((item) => item.id));
    setSelectedProjectIds((current) => {
      const next = current.filter((id) => availableProjectIds.has(id));
      return next.length === current.length ? current : next;
    });
  }, [projects.data]);

  const toggleProjectSelection = (id: string, isChecked: boolean) => {
    setSelectedProjectIds((current) =>
      isChecked
        ? [...new Set([...current, id])]
        : current.filter((item) => item !== id)
    );
  };

  const deleteSelectedProjects = () => {
    const ids = selectedProjects.map((item) => item.id);
    if (ids.length === 0 || archiveProjects.isPending) {
      return;
    }

    const runCount = selectedProjects.reduce((total, item) => total + item._count.runs, 0);
    showConfirm({
      title: 'Delete selected ML projects',
      text: `Are you sure you want to delete ${ids.length} ML ${ids.length === 1 ? 'project' : 'projects'} and their ${runCount} ${runCount === 1 ? 'run' : 'runs'}? This also removes associated metrics, images, and evaluation rows. This action cannot be undone.`,
      onConfirm: () => archiveProjects.mutate(ids),
    });
  };

  return (
    <PageContainer>
      <PageHeader
        title="ML Projects"
        description="Group experiment runs by model, dataset, or training objective."
        className="mb-8"
        actions={
          selectedProjectCount > 0 && (
            <Button
              icon={TrashIcon}
              loading={archiveProjects.isPending}
              onClick={deleteSelectedProjects}
              variant="destructive"
            >
              Delete {selectedProjectCount}
            </Button>
          )
        }
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
              <TableHead className="w-10">
                <Checkbox
                  aria-label="Select all projects"
                  checked={someProjectsSelected ? 'indeterminate' : allProjectsSelected}
                  disabled={!projects.data?.length || archiveProjects.isPending}
                  onCheckedChange={(value) =>
                    setSelectedProjectIds(value === true ? (projects.data ?? []).map((item) => item.id) : [])
                  }
                />
              </TableHead>
              <TableHead>Name</TableHead>
              <TableHead>API source</TableHead>
              <TableHead>Runs</TableHead>
              <TableHead className="text-right" title="Uploaded images stored locally. Excludes shared database overhead. 1 GB = 1,000,000,000 bytes.">
                Disk usage (GB)
              </TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(projects.data ?? []).map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <Checkbox
                    aria-label={`Select ${item.name}`}
                    checked={selectedProjectIdSet.has(item.id)}
                    disabled={archiveProjects.isPending}
                    onCheckedChange={(value) => toggleProjectSelection(item.id, value === true)}
                  />
                </TableCell>
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
                <TableCell className="text-right tabular-nums" title={`${item.storageBytes.toLocaleString()} bytes of locally stored images`}>
                  {item.storageBytes > 0 && item.storageBytes < 10_000_000
                    ? '<0.01'
                    : (item.storageBytes / 1_000_000_000).toFixed(2)}
                </TableCell>
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
                <TableCell colSpan={7} className="py-10 text-center">
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
