export function formatNotificationTemplateValue(value: unknown) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return '';
    }

    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}
