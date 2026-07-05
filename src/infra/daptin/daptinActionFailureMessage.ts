export function daptinActionFailureMessage(response: unknown): string {
  return daptinActionNotifyMessage(response, ['error', 'failed']) || '';
}

export function daptinActionSuccessMessage(response: unknown): string {
  return daptinActionNotifyMessage(response, ['success']) || '';
}

function daptinActionNotifyMessage(response: unknown, types: string[]): string | null {
  if (!Array.isArray(response)) return null;
  for (const item of response) {
    if (!isRecord(item) || item.ResponseType !== 'client.notify' || !isRecord(item.Attributes)) continue;
    const type = item.Attributes.type;
    if (typeof type !== 'string' || !types.includes(type)) continue;
    const message = item.Attributes.message;
    return typeof message === 'string' && message.trim() ? message : null;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
