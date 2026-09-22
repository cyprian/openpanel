import { describe, expect, it } from 'vitest';
import type { RouterOutputs } from '@/trpc/client';
import { getMetricNotificationDefaults, isMetricNotificationRule } from './metric-notifications';

type Rule = Pick<RouterOutputs['notification']['rules'][number], 'config' | 'integrations'>;
const defaults = getMetricNotificationDefaults({
  projectId: 'project', runId: 'run', runName: 'Training', metric: 'loss',
});
const slack = { config: { type: 'slack' } } as Rule['integrations'][number];
const rule: Rule = { config: defaults.config, integrations: [slack] };

describe('metric notification rules', () => {
  it('subscribes to improvements for exactly the selected run and metric', () => {
    expect(defaults.config).toMatchObject({
      type: 'events',
      events: [{
        name: 'ml_run_key_metric_improved',
        filters: [
          { name: 'properties.ml_run_id', operator: 'is', value: ['run'] },
          { name: 'properties.metric', operator: 'is', value: ['loss'] },
        ],
      }],
    });
    expect(isMetricNotificationRule(rule, 'run', 'loss')).toBe(true);
    expect(isMetricNotificationRule(rule, 'another-run', 'loss')).toBe(false);
    expect(isMetricNotificationRule(rule, 'run', 'psnr')).toBe(false);
  });

  it('clears the bell when no Slack destination remains', () => {
    expect(isMetricNotificationRule({ ...rule, integrations: [] }, 'run', 'loss')).toBe(false);
    expect(isMetricNotificationRule({ ...rule, integrations: [{ config: { type: 'app' } } as Rule['integrations'][number]] }, 'run', 'loss')).toBe(false);
  });

  it('does not mistake funnels or exclusion filters for a subscription', () => {
    expect(isMetricNotificationRule({ ...rule, config: { ...rule.config, type: 'funnel' } }, 'run', 'loss')).toBe(false);
    expect(isMetricNotificationRule({ ...rule, config: {
      type: 'events',
      events: rule.config.events.map((event) => ({
        ...event,
        filters: event.filters.map((filter) => ({ ...filter, operator: 'isNot' })),
      })),
    } }, 'run', 'loss')).toBe(false);
  });

  it('does not match filters split across unrelated events', () => {
    const event = rule.config.events[0]!;
    expect(isMetricNotificationRule({ ...rule, config: {
      type: 'events',
      events: event.filters.map((filter) => ({ ...event, filters: [filter] })),
    } }, 'run', 'loss')).toBe(false);
  });
});
