import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { handleErrorToastOptions, useTRPC } from '@/integrations/trpc/react';
import { showConfirm } from '@/modals';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { EllipsisVerticalIcon, PencilIcon, TrashIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

export function MlProjectActions({
  projectId,
  mlProjectId,
  mlProjectName,
  runCount,
}: {
  projectId: string;
  mlProjectId: string;
  mlProjectName: string;
  runCount: number;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [name, setName] = useState(mlProjectName);
  const renameProject = useMutation(
    trpc.ml.updateProject.mutationOptions({
      onError: handleErrorToastOptions({}),
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.ml.pathFilter());
        toast.success('ML project renamed');
        setIsRenameOpen(false);
      },
    }),
  );
  const deleteProject = useMutation(
    trpc.ml.archiveProject.mutationOptions({
      onError: handleErrorToastOptions({}),
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.ml.pathFilter());
        toast.success('ML project deleted');
      },
    }),
  );
  const isPending = renameProject.isPending || deleteProject.isPending;
  const trimmedName = name.trim();
  const canRename = trimmedName.length > 0 && trimmedName !== mlProjectName;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={`Actions for ${mlProjectName}`}
            disabled={isPending}
            icon={EllipsisVerticalIcon}
            size="icon"
            variant="outline"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem
            onClick={() => {
              setName(mlProjectName);
              setIsRenameOpen(true);
            }}
          >
            <PencilIcon className="size-4" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              showConfirm({
                title: 'Delete ML project',
                text: `Are you sure you want to delete "${mlProjectName}" and its ${runCount} ${runCount === 1 ? 'run' : 'runs'}? This also removes associated metrics, images, and evaluation rows. This action cannot be undone.`,
                onConfirm: () =>
                  deleteProject.mutate({ id: mlProjectId, projectId }),
              });
            }}
            variant="destructive"
          >
            <TrashIcon className="size-4" />
            Delete project
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={isRenameOpen} onOpenChange={setIsRenameOpen}>
        <DialogContent className="max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>Rename ML project</DialogTitle>
          </DialogHeader>
          <form
            className="col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!canRename) {
                return;
              }
              renameProject.mutate({
                id: mlProjectId,
                projectId,
                name: trimmedName,
              });
            }}
          >
            <Input
              autoFocus
              disabled={renameProject.isPending}
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
            <DialogFooter>
              <Button
                disabled={renameProject.isPending}
                onClick={() => setIsRenameOpen(false)}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button
                disabled={!canRename}
                loading={renameProject.isPending}
                type="submit"
              >
                Rename
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
