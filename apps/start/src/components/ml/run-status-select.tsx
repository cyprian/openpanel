import { handleErrorToastOptions, useTRPC } from '@/integrations/trpc/react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { IMlRunStatus } from '@openpanel/validation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

const ML_RUN_STATUSES = [
  'created',
  'running',
  'finished',
  'failed',
  'crashed',
  'canceled',
] as const satisfies readonly IMlRunStatus[];

export function MlRunStatusSelect({
  projectId,
  runId,
  status,
}: {
  projectId: string;
  runId: string;
  status: string;
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

  return (
    <Select
      value={status}
      disabled={updateRunStatus.isPending}
      onValueChange={(nextStatus) => {
        if (nextStatus === status) {
          return;
        }
        updateRunStatus.mutate({
          id: runId,
          projectId,
          status: nextStatus as IMlRunStatus,
        });
      }}
    >
      <SelectTrigger className="ml-auto w-36">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {ML_RUN_STATUSES.map((item) => (
          <SelectItem key={item} value={item}>
            <span className="capitalize">{item}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
