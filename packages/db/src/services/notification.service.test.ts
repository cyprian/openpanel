import { describe, expect, it } from 'vitest';
import { formatNotificationTemplateValue } from './notification-template.service';

describe('formatNotificationTemplateValue', () => {
  it('formats float values to two decimal places', () => {
    expect(formatNotificationTemplateValue(27.23413353254848)).toBe('27.23');
    expect(formatNotificationTemplateValue(27.368637246986943)).toBe('27.37');
  });

  it('preserves integer values without decimal places', () => {
    expect(formatNotificationTemplateValue(1600)).toBe('1600');
  });

  it('renders zero values', () => {
    expect(formatNotificationTemplateValue(0)).toBe('0');
  });
});
