import { getDaptinEndpoint, getToken } from './daptinClient';

export type DaptinLiveEvent = {
  topic: string;
  event: string;
  source: string;
  data: unknown;
  raw: unknown;
};

type DaptinLiveOptions = {
  topicName?: string;
  ensureTopicName?: string;
  onEvent: (event: DaptinLiveEvent) => void;
  onUnauthorized?: () => void;
  onError?: (error: unknown) => void;
  onReady?: () => void;
};

type DaptinLiveConnection = {
  close: () => void;
  createTopic: (topicName: string) => Promise<void>;
  publish: (topicName: string, message: unknown) => void;
  request: (method: string, attributes?: Record<string, unknown>) => Promise<DaptinLiveResponse>;
  subscribe: (topicName: string) => Promise<void>;
};

type DaptinLiveResponse = {
  id: string;
  method: string;
  ok: boolean;
  data: unknown;
  error: string;
  raw: unknown;
};

type PendingRequest = {
  resolve: (response: DaptinLiveResponse) => void;
  reject: (error: Error) => void;
  timeout: number;
};

const REQUEST_TIMEOUT_MS = 15_000;

export function connectDaptinLive(options: DaptinLiveOptions): DaptinLiveConnection {
  const token = getToken();
  if (!token) throw new Error('Daptin live connection requires a token');

  const socket = new WebSocket(liveEndpointFor(getDaptinEndpoint(), token));
  const pendingRequests = new Map<string, PendingRequest>();
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
      void initializeConnection();
      return;
    }

    if (message.type === 'response') {
      const response = liveResponse(message);
      const pending = pendingRequests.get(response.id);
      if (!pending) return;
      pendingRequests.delete(response.id);
      window.clearTimeout(pending.timeout);
      if (response.ok) pending.resolve(response);
      else pending.reject(new Error(response.error || `${response.method || 'request'} failed`));
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

  socket.addEventListener('close', () => {
    if (closed) return;
    closed = true;
    rejectPendingRequests(new Error('Daptin live connection closed'));
  });

  function closeSocket() {
    closed = true;
    rejectPendingRequests(new Error('Daptin live connection closed'));
    if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) socket.close();
  }

  function rejectPendingRequests(error: Error) {
    for (const pending of pendingRequests.values()) {
      window.clearTimeout(pending.timeout);
      pending.reject(error);
    }
    pendingRequests.clear();
  }

  async function initializeConnection() {
    try {
      let createTopicError: unknown = null;
      if (options.ensureTopicName) {
        try {
          await createTopic(options.ensureTopicName);
        } catch (error) {
          createTopicError = error;
        }
      }
      try {
        if (options.topicName) await subscribe(options.topicName);
      } catch (error) {
        throw createTopicError ?? error;
      }
      if (createTopicError && !options.topicName) throw createTopicError;
      options.onReady?.();
    } catch (error) {
      options.onError?.(error);
    }
  }

  function request(method: string, attributes: Record<string, unknown> = {}): Promise<DaptinLiveResponse> {
    if (closed) return Promise.reject(new Error('Daptin live connection is closed'));
    if (socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error('Daptin live connection is not open'));
    const id = crypto.randomUUID();
    const payload = { id, method, attributes };
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        pendingRequests.delete(id);
        reject(new Error(`${method} timed out`));
      }, REQUEST_TIMEOUT_MS);
      pendingRequests.set(id, { resolve, reject, timeout });
      socket.send(JSON.stringify(payload));
    });
  }

  async function createTopic(topicName: string) {
    await request('create-topicName', { name: topicName });
  }

  function publish(topicName: string, message: unknown) {
    if (closed) throw new Error('Daptin live connection is closed');
    if (socket.readyState !== WebSocket.OPEN) throw new Error('Daptin live connection is not open');
    socket.send(JSON.stringify({
      id: crypto.randomUUID(),
      method: 'new-message',
      attributes: { topicName, message },
    }));
  }

  async function subscribe(topicName: string) {
    await request('subscribe', { topicName });
  }

  return {
    close: closeSocket,
    createTopic,
    publish,
    request,
    subscribe,
  };
}

function liveResponse(message: Record<string, unknown>): DaptinLiveResponse {
  return {
    id: stringField(message.id),
    method: stringField(message.method),
    ok: message.ok === true,
    data: decodePayload(message.data),
    error: stringField(message.error),
    raw: message,
  };
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
