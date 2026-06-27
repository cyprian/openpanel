import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const STATUS_STYLES: Record<string, string> = {
  created: 'border-transparent bg-slate-600 text-white',
  running: 'border-transparent bg-sky-500 text-white',
  finished: 'border-transparent bg-emerald-600 text-white',
  failed: 'border-transparent bg-rose-600 text-white',
  error: 'border-transparent bg-rose-600 text-white',
  crashed: 'border-transparent bg-fuchsia-600 text-white',
  archived: 'border-transparent bg-zinc-700 text-white',
};

export function MlStatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'capitalize',
        STATUS_STYLES[status.toLowerCase()] ??
          'border-transparent bg-indigo-600 text-white',
        className
      )}
    >
      {status}
    </Badge>
  );
}
