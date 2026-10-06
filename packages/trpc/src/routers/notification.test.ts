// notification.rules embeds the integrations attached to each rule. Those rows
// carry the credentials the worker delivers with, so this pins the response to
// the redacted shape for a read-level project member — the lowest access that
// can call it.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getNotificationRulesByProjectId } from '@openpanel/db';

const { dbMock, getProjectAccessMock, getOrganizationAccessMock } = vi.hoisted(
  () => ({
    dbMock: {
      notificationRule: {
        findMany: vi.fn(),
        findUniqueOrThrow: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      integration: { findMany: vi.fn() },
      project: { findUniqueOrThrow: vi.fn() },
    },
    getProjectAccessMock: vi.fn(),
    getOrganizationAccessMock: vi.fn(),
  }),
);

vi.mock('@openpanel/db', () => ({
  db: dbMock,
  APP_NOTIFICATION_INTEGRATION_ID: 'app',
  EMAIL_NOTIFICATION_INTEGRATION_ID: 'email',
  BASE_INTEGRATIONS: [
    {
      id: 'app',
      name: 'Website',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      config: { type: 'app' },
      organizationId: '',
      projectId: null,
    },
  ],
  isBaseIntegration: (id: string) => id === 'app' || id === 'email',
  getNotificationRulesByProjectId: Object.assign(vi.fn(), {
    clear: vi.fn(),
  }),
  getProjectAccess: getProjectAccessMock,
  getOrganizationAccess: getOrganizationAccessMock,
  getClientAccess: vi.fn(),
  getProjectById: vi.fn(),
  canWriteProject: (access: { level?: string }) => access.level === 'write' || access.level === 'admin',
  runWithAlsSession: (_sessionId: string | null, fn: () => unknown) => fn(),
}));

vi.mock('@openpanel/integrations/src/slack', () => ({
  getMissingSlackEnvVars: vi.fn().mockReturnValue([]),
  getSlackInstallUrl: vi.fn().mockResolvedValue('https://slack.test/install'),
  sendSlackNotification: vi.fn(),
}));

const { notificationRouter } = await import('./notification');

const PROJECT_ID = 'project-1';
const ORG_ID = 'org-1';

const RULE = {
  id: 'rule-1',
  name: 'Signups',
  projectId: PROJECT_ID,
  sendToApp: true,
  sendToEmail: false,
  config: { type: 'events', events: [] },
  template: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-02'),
  integrations: [
    {
      id: 'slack-1',
      name: 'Slack',
      organizationId: ORG_ID,
      projectId: PROJECT_ID,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-02'),
      config: {
        type: 'slack',
        access_token: 'xoxb-super-secret',
        incoming_webhook: {
          channel: '#alerts',
          url: 'https://hooks.slack.test/services/T/B/secret',
        },
      },
    },
    {
      id: 'webhook-1',
      name: 'Zapier',
      organizationId: ORG_ID,
      projectId: PROJECT_ID,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-02'),
      config: {
        type: 'webhook',
        url: 'https://hooks.zapier.test/abc',
        headers: { Authorization: 'Bearer super-secret' },
        mode: 'message',
      },
    },
  ],
};

const SECRETS = [
  'xoxb-super-secret',
  'https://hooks.slack.test/services/T/B/secret',
  'Bearer super-secret',
];

function caller(userId: string) {
  return notificationRouter.createCaller({
    session: { userId, session: { id: 'session-1' } },
    req: { log: { info: vi.fn() } },
    res: {},
    setCookie: vi.fn(),
    cookies: {},
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  getProjectAccessMock.mockResolvedValue({
    id: 'access-1',
    userId: 'user-1',
    organizationId: ORG_ID,
    projectId: PROJECT_ID,
    level: 'read',
  });
  dbMock.notificationRule.findMany.mockResolvedValue([RULE]);
});

describe('notification.rules', () => {
  it('returns no credential values to a read-level project member', async () => {
    const result = await caller('user-1').rules({ projectId: PROJECT_ID });

    const serialized = JSON.stringify(result);
    for (const secret of SECRETS) {
      expect(serialized).not.toContain(secret);
    }
  });

  it('keeps the base integrations and the attached ones, with what the rule card reads', async () => {
    const [rule] = await caller('user-1').rules({ projectId: PROJECT_ID });

    expect(rule?.integrations).toEqual([
      expect.objectContaining({ id: 'app', name: 'Website' }),
      expect.objectContaining({
        id: 'slack-1',
        name: 'Slack',
        config: expect.objectContaining({
          type: 'slack',
          access_token: '',
          incoming_webhook: { channel: '#alerts', url: '' },
        }),
      }),
      expect.objectContaining({
        id: 'webhook-1',
        name: 'Zapier',
        config: {
          type: 'webhook',
          url: 'https://hooks.zapier.test/abc',
          headers: { Authorization: '' },
          mode: 'message',
        },
      }),
    ]);
  });
});


describe('ML Slack notification rules with upstream access checks', () => {
  const input = {
    name: 'ML run quality improved',
    projectId: PROJECT_ID,
    integrations: ['slack-1'],
    sendToApp: false,
    sendToEmail: false,
    config: {
      type: 'events' as const,
      events: [{ name: 'ml_run_key_metric_improved', segment: 'event' as const, filters: [] }],
    },
  };

  beforeEach(() => {
    getProjectAccessMock.mockResolvedValue({ level: 'write' });
    dbMock.project.findUniqueOrThrow.mockResolvedValue({ organizationId: ORG_ID });
    dbMock.integration.findMany.mockResolvedValue([RULE.integrations[0]]);
    dbMock.notificationRule.create.mockResolvedValue(RULE);
    dbMock.notificationRule.update.mockResolvedValue(RULE);
    dbMock.notificationRule.delete.mockResolvedValue(RULE);
    dbMock.notificationRule.findUniqueOrThrow.mockResolvedValue(RULE);
  });

  it('creates an ML rule and refreshes the worker cache only after saving it', async () => {
    dbMock.notificationRule.create.mockImplementationOnce(async () => {
      expect(getNotificationRulesByProjectId.clear).not.toHaveBeenCalled();
      return RULE;
    });
    await expect(caller('user-1').createOrUpdateRule(input)).resolves.toEqual(RULE);
    expect(getNotificationRulesByProjectId.clear).toHaveBeenCalledWith(PROJECT_ID);
  });

  it('denies read-only members without saving or invalidating worker rules', async () => {
    getProjectAccessMock.mockResolvedValue({ level: 'read' });
    await expect(caller('user-1').createOrUpdateRule(input)).rejects.toThrow('read-only');
    expect(dbMock.notificationRule.create).not.toHaveBeenCalled();
    expect(getNotificationRulesByProjectId.clear).not.toHaveBeenCalled();
  });

  it('rejects a Slack destination from another project', async () => {
    dbMock.integration.findMany.mockResolvedValue([{ ...RULE.integrations[0], projectId: 'another-project' }]);
    await expect(caller('user-1').createOrUpdateRule(input)).rejects.toThrow('Integration does not belong');
    expect(dbMock.notificationRule.create).not.toHaveBeenCalled();
    expect(getNotificationRulesByProjectId.clear).not.toHaveBeenCalled();
  });

  it('refreshes both projects when moving a saved rule', async () => {
    dbMock.notificationRule.findUniqueOrThrow.mockResolvedValue({ ...RULE, projectId: 'old-project' });
    await caller('user-1').createOrUpdateRule({ ...input, id: RULE.id });
    expect(getNotificationRulesByProjectId.clear).toHaveBeenCalledWith('old-project');
    expect(getNotificationRulesByProjectId.clear).toHaveBeenCalledWith(PROJECT_ID);
  });

  it('removes a rule from the worker cache after deletion', async () => {
    await caller('user-1').deleteRule({ id: RULE.id });
    expect(dbMock.notificationRule.delete).toHaveBeenCalledWith({ where: { id: RULE.id } });
    expect(getNotificationRulesByProjectId.clear).toHaveBeenCalledWith(PROJECT_ID);
  });
});
