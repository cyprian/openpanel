import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const STATUS_STYLES: Record<string, string> = {
  created: 'border-slate-300 bg-slate-100 text-slate-700',
  running: 'border-blue-200 bg-blue-100 text-blue-700',
  finished: 'border-emerald-200 bg-emerald-100 text-emerald-700',
  failed: 'border-red-200 bg-red-100 text-red-700',
  crashed: 'border-red-200 bg-red-100 text-red-700',
  archived: 'border-zinc-300 bg-zinc-100 text-zinc-600',
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
          'border-muted bg-muted text-muted-foreground',
        className
      )}
    >
      {status}
    </Badge>
  );
}
