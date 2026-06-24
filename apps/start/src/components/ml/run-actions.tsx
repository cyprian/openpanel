import { Button } from '@/components/ui/button';
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
import { handleErrorToastOptions, useTRPC } from '@/integrations/trpc/react';
import { showConfirm } from '@/modals';
import type { IMlRunStatus } from '@openpanel/validation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDownIcon, EllipsisIcon, TrashIcon } from 'lucide-react';
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
        queryClient.invalidateQueries(trpc.ml.runs.pathFilter());
        queryClient.invalidateQueries(trpc.ml.run.pathFilter());
        toast.success('Run deleted');
        onDeleted?.();
      },
    }),
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={showLabel ? undefined : `Actions for ${runName}`}
          disabled={updateRunStatus.isPending || archiveRun.isPending}
          icon={showLabel ? ChevronDownIcon : EllipsisIcon}
          size={showLabel ? 'sm' : 'icon'}
          variant="outline"
        >
          {showLabel ? 'Actions' : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
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
              text: `Are you sure you want to delete "${runName}"? This action cannot be undone.`,
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
  );
}
