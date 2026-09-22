import type { zCreateNotificationRule } from '@openpanel/validation';
import type { z } from 'zod';
import type { RouterOutputs } from '@/trpc/client';

const METRIC_IMPROVED_EVENT = 'ml_run_key_metric_improved';

export function getMetricNotificationDefaults({
  projectId,
  runId,
  runName,
  metric,
}: {
  projectId: string;
  runId: string;
  runName: string;
  metric: string;
}): z.infer<typeof zCreateNotificationRule> {
  return {
    projectId,
    name: `${runName}: ${metric} improved`,
    sendToApp: false,
    sendToEmail: false,
    integrations: [],
    template: '{{properties.ml_run_name}}: {{properties.metric}} improved from {{properties.previous_value}} to {{properties.value}} at step {{properties.step}}',
    config: {
      type: 'events',
      events: [{
        name: METRIC_IMPROVED_EVENT,
        segment: 'event',
        filters: [
          { id: 'ml-run', name: 'properties.ml_run_id', operator: 'is', value: [runId] },
          { id: 'ml-metric', name: 'properties.metric', operator: 'is', value: [metric] },
        ],
      }],
    },
  };
}

export function isMetricNotificationRule(
  rule: Pick<RouterOutputs['notification']['rules'][number], 'config' | 'integrations'>,
  runId: string,
  metric: string,
): boolean {
  if (rule.config.type !== 'events' || !rule.integrations.some((integration) => integration.config.type === 'slack')) {
    return false;
  }

  return rule.config.events.some((event) =>
    event.name === METRIC_IMPROVED_EVENT &&
    event.filters.some((filter) => filter.name === 'properties.ml_run_id' && filter.operator === 'is' && filter.value.includes(runId)) &&
    event.filters.some((filter) => filter.name === 'properties.metric' && filter.operator === 'is' && filter.value.includes(metric))
  );
}
