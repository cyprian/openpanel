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
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { handleErrorToastOptions, useTRPC } from '@/integrations/trpc/react';
import { showConfirm } from '@/modals';
import type { IMlRunStatus } from '@openpanel/validation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronDownIcon,
  EllipsisIcon,
  PencilIcon,
  TrashIcon,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

const ML_RUN_STATUSES = [
  'created',
  'running',
  'finished',
  'failed',
  'crashed',
] as const satisfies readonly IMlRunStatus[];

export function MlRunActions({
  projectId,
  runId,
  runName,
  status,
  showLabel = false,
  onDeleted,
}: {
  projectId: string;
  runId: string;
  runName: string;
  status: string;
  showLabel?: boolean;
  onDeleted?: () => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [name, setName] = useState(runName);
  const renameRun = useMutation(
    trpc.ml.updateRun.mutationOptions({
      onError: handleErrorToastOptions({}),
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.ml.runs.pathFilter());
        queryClient.invalidateQueries(trpc.ml.run.pathFilter());
        toast.success('Run renamed');
        setIsRenameOpen(false);
      },
    }),
  );
  const updateRunStatus = useMutation(
    trpc.ml.updateRun.mutationOptions({
      onError: handleErrorToastOptions({}),
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.ml.runs.pathFilter());
        queryClient.invalidateQueries(trpc.ml.run.pathFilter());
        toast.success('Run status updated');
      },
    }),
  );
  const archiveRun = useMutation(
    trpc.ml.archiveRun.mutationOptions({
      onError: handleErrorToastOptions({}),
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.ml.pathFilter());
        toast.success('Run deleted');
        onDeleted?.();
      },
    }),
  );
  const isPending =
    renameRun.isPending || updateRunStatus.isPending || archiveRun.isPending;
  const trimmedName = name.trim();
  const canRename = trimmedName.length > 0 && trimmedName !== runName;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={showLabel ? undefined : `Actions for ${runName}`}
            disabled={isPending}
            icon={showLabel ? ChevronDownIcon : EllipsisIcon}
            size={showLabel ? 'sm' : 'icon'}
            variant="outline"
          >
            {showLabel ? 'Actions' : null}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem
            onClick={() => {
              setName(runName);
              setIsRenameOpen(true);
            }}
          >
            <PencilIcon className="size-4" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Change status</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup value={status}>
                {ML_RUN_STATUSES.map((item) => (
                  <DropdownMenuRadioItem
                    key={item}
                    onClick={() => {
                      if (item === status) {
                        return;
                      }
                      updateRunStatus.mutate({
                        id: runId,
                        projectId,
                        status: item,
                      });
                    }}
                    value={item}
                  >
                    <span className="capitalize">{item}</span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              showConfirm({
                title: 'Delete run',
                text: `Are you sure you want to delete "${runName}"? This also removes associated metrics, images, and evaluation rows. This action cannot be undone.`,
                onConfirm: () => archiveRun.mutate({ id: runId, projectId }),
              });
            }}
            variant="destructive"
          >
            <TrashIcon className="size-4" />
            Delete run
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={isRenameOpen} onOpenChange={setIsRenameOpen}>
        <DialogContent className="max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>Rename run</DialogTitle>
          </DialogHeader>
          <form
            className="col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!canRename) {
                return;
              }
              renameRun.mutate({
                id: runId,
                projectId,
                name: trimmedName,
              });
            }}
          >
            <Input
              autoFocus
              disabled={renameRun.isPending}
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
            <DialogFooter>
              <Button
                disabled={renameRun.isPending}
                onClick={() => setIsRenameOpen(false)}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button disabled={!canRename} loading={renameRun.isPending} type="submit">
                Rename
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
