import { getDaptinEndpoint, getToken } from './daptinClient';

export type DaptinLiveEvent = {
  topic: string;
  event: string;
  source: string;
  data: unknown;
  raw: unknown;
};

type DaptinLiveOptions = {
  topicName: string;
  onEvent: (event: DaptinLiveEvent) => void;
  onUnauthorized?: () => void;
  onError?: (error: unknown) => void;
};

type DaptinLiveConnection = {
  close: () => void;
};

export function connectDaptinLive(options: DaptinLiveOptions): DaptinLiveConnection {
  const token = getToken();
  if (!token) throw new Error('Daptin live connection requires a token');

  const socket = new WebSocket(liveEndpointFor(getDaptinEndpoint(), token));
  const subscriptionId = crypto.randomUUID();
  let closed = false;

  socket.addEventListener('message', (event) => {
    const message = parseJson(event.data);
    if (!isRecord(message)) return;

    if (message.message === 'unauthorized') {
      options.onUnauthorized?.();
      closeSocket();
      return;
    }

    if (message.type === 'session') {
      socket.send(JSON.stringify({
        id: subscriptionId,
        method: 'subscribe',
        attributes: { topicName: options.topicName },
      }));
      return;
    }

    if (message.type !== 'event') return;
    options.onEvent({
      topic: stringField(message.topic),
      event: stringField(message.event),
      source: stringField(message.source),
      data: decodePayload(message.data),
      raw: message,
    });
  });

  socket.addEventListener('error', (error) => {
    if (!closed) options.onError?.(error);
  });

  function closeSocket() {
    closed = true;
    if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) socket.close();
  }

  return { close: closeSocket };
}

function liveEndpointFor(endpoint: string, token: string): string {
  const url = new URL(endpoint, window.location.href);
  if (url.protocol === 'https:') url.protocol = 'wss:';
  else url.protocol = 'ws:';
  if (url.hostname === 'localhost') url.hostname = '127.0.0.1';
  url.pathname = '/live';
  url.search = '';
  url.searchParams.set('token', token);
  return url.toString();
}

function decodePayload(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const direct = parseJson(value);
  if (direct !== null) return direct;
  try {
    return JSON.parse(atob(value));
  } catch {
    return value;
  }
}

function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stringField(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
