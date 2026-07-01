export function daptinActionFailureMessage(response: unknown): string {
  if (!Array.isArray(response)) return '';
  for (const item of response) {
    if (!isRecord(item) || item.ResponseType !== 'client.notify' || !isRecord(item.Attributes)) continue;
    const type = item.Attributes.type;
    if (type !== 'error' && type !== 'failed') continue;
    const message = item.Attributes.message;
    return typeof message === 'string' && message.trim() ? message : 'Daptin action failed';
  }
  return '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
