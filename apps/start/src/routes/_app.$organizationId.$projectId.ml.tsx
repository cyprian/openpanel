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
import { Link, createFileRoute } from '@tanstack/react-router';
import { formatDistanceToNow } from 'date-fns';
import { PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

export const Route = createFileRoute('/_app/$organizationId/$projectId/ml')({
  component: Component,
  head: () => ({
    meta: [{ title: createProjectTitle('ML Projects') }],
  }),
});

function Component() {
  const { organizationId, projectId } = Route.useParams();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const projects = useQuery(trpc.ml.projects.queryOptions({ projectId }));
  const createProject = useMutation(
    trpc.ml.createProject.mutationOptions({
      onError: handleErrorToastOptions({}),
      onSuccess() {
        setName('');
        queryClient.invalidateQueries(trpc.ml.projects.pathFilter());
        toast.success('ML project created');
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
              <TableHead>Runs</TableHead>
              <TableHead>Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(projects.data ?? []).map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <Link
                    className="font-medium hover:underline"
                    from={Route.fullPath}
                    to="/$organizationId/$projectId/ml/projects/$mlProjectId"
                    params={{ organizationId, projectId, mlProjectId: item.id }}
                  >
                    {item.name}
                  </Link>
                </TableCell>
                <TableCell>{item._count.runs}</TableCell>
                <TableCell>
                  {formatDistanceToNow(item.updatedAt, { addSuffix: true })}
                </TableCell>
              </TableRow>
            ))}
            {projects.data?.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-muted-foreground">
                  No ML projects yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </PageContainer>
  );
}
