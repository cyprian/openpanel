import { useTRPC } from '@/integrations/trpc/react';
import { useQuery } from '@tanstack/react-query';
import { HardDriveIcon } from 'lucide-react';

const byteFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 1,
});

function formatBytes(bytes: number) {
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
  const index = bytes > 0
    ? Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
    : 0;
  return `${byteFormatter.format(bytes / 1024 ** index)} ${units[index]}`;
}

export function DiskUsage({ organizationId }: { organizationId: string }) {
  const trpc = useTRPC();
  const { data, isError, error } = useQuery({
    ...trpc.organization.diskUsage.queryOptions({ organizationId }),
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: 1,
  });

  return (
    <section aria-label="Server disk usage" className="mb-8 rounded-lg border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <div className="flex items-center gap-2 font-medium">
          <HardDriveIcon size={16} aria-hidden="true" />
          Server disk
        </div>
        {data && <span className="text-muted-foreground">{formatBytes(data.totalBytes)} total</span>}
      </div>
      {data ? (
        <>
          <div
            role="meter"
            aria-label="Server disk usage"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={data.usedPercent}
            aria-valuetext={`${formatBytes(data.usedBytes)} used, ${formatBytes(data.availableBytes)} available`}
            className="h-3 overflow-hidden rounded-full bg-emerald-500/20"
          >
            <div
              className={data.usedPercent >= 90 ? 'h-full bg-destructive' : 'h-full bg-primary'}
              style={{ width: `${data.usedPercent}%` }}
            />
          </div>
          <div className="mt-2 flex flex-wrap justify-between gap-2 text-sm tabular-nums">
            <span title="Includes space reserved by the filesystem">
              {formatBytes(data.usedBytes)} used ({byteFormatter.format(data.usedPercent)}%)
            </span>
            <span className="text-muted-foreground">{formatBytes(data.availableBytes)} available</span>
          </div>
          {isError && <p className="mt-2 text-muted-foreground text-xs">Could not refresh disk usage. Showing the last reading.</p>}
        </>
      ) : (
        <p role="status" className="text-muted-foreground text-sm">
          {isError ? `Disk usage is currently unavailable: ${error.message}` : 'Loading disk usage…'}
        </p>
      )}
    </section>
  );
}
