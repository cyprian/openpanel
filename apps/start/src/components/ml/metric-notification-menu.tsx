import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { BellIcon, ChevronDownIcon } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltiper } from '@/components/ui/tooltip';
import { useTRPC } from '@/integrations/trpc/react';
import { pushModal } from '@/modals';
import { getMetricNotificationDefaults, isMetricNotificationRule } from './metric-notifications';

export function MetricNotificationMenu({
  organizationId,
  projectId,
  runId,
  runName,
  metric,
}: {
  organizationId: string;
  projectId: string;
  runId: string;
  runName: string;
  metric: string;
}) {
  const trpc = useTRPC();
  const rules = useQuery(trpc.notification.rules.queryOptions({ projectId }));
  const metricRules = (rules.data ?? []).filter((rule) =>
    isMetricNotificationRule(rule, runId, metric)
  );

  return (
    <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
      {metricRules.length > 0 && (
        <Tooltiper content="Slack notifications enabled when this metric improves in this run">
          <span role="img" aria-label={`Slack notifications enabled for ${metric}`}>
            <BellIcon className="size-3.5 text-amber-500" />
          </span>
        </Tooltiper>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Notification actions for ${metric}`}
            className="rounded-sm p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronDownIcon className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {rules.isError ? (
            <DropdownMenuItem onSelect={() => { void rules.refetch(); }}>
              Could not load notifications. Retry
            </DropdownMenuItem>
          ) : metricRules.length > 0 ? (
            metricRules.map((rule) => (
              <DropdownMenuItem key={rule.id} onSelect={() => pushModal('AddNotificationRule', { rule })}>
                <BellIcon className="size-4" />
                Edit notification: {rule.name}
              </DropdownMenuItem>
            ))
          ) : (
            <DropdownMenuItem
              disabled={rules.isPending}
              onSelect={() => pushModal('AddNotificationRule', {
                defaults: getMetricNotificationDefaults({ projectId, runId, runName, metric }),
                slackOnly: true,
              })}
            >
              <BellIcon className="size-4" />
              {rules.isPending ? 'Loading notifications…' : 'Notify in Slack'}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem asChild>
            <Link to="/$organizationId/$projectId/notifications/rules" params={{ organizationId, projectId }}>
              Manage notification rules
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
