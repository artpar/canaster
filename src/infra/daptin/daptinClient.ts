import { DaptinClient } from 'daptin-client';

export const DAPTIN_TOKEN_STORAGE_KEY = 'canaster:daptin:token';
export const DAPTIN_ACTIVE_DOCUMENT_STORAGE_KEY = 'canaster:daptin:active-document';
export const DAPTIN_LAST_EMAIL_STORAGE_KEY = 'canaster:daptin:last-email';
export const DAPTIN_ENDPOINT_STORAGE_KEY = 'canaster:daptin:endpoint';
export const DAPTIN_SESSION_ENDPOINT_STORAGE_KEY = 'canaster:daptin:session-endpoint';

const DEFAULT_DAPTIN_ENDPOINT = 'http://canaster.local:6336';
const DAPTIN_TOKEN_COOKIE_NAME = 'token';

let client: DaptinClient | null = null;
let clientEndpoint = '';
let modelsLoadPromise: Promise<void> | null = null;

export type CanasterApiErrorKind = 'session' | 'permission' | 'not-found' | 'network' | 'server' | 'invalid-response' | 'api';

export class CanasterApiError extends Error {
  readonly kind: CanasterApiErrorKind;
  readonly status: number | null;
  readonly original: unknown;

  constructor(kind: CanasterApiErrorKind, message: string, options: { status?: number | null; original?: unknown } = {}) {
    super(message);
    this.name = 'CanasterApiError';
    this.kind = kind;
    this.status = options.status ?? null;
    this.original = options.original;
  }
}

export function getDaptinEndpoint(): string {
  const override = storedDaptinEndpointOverride();
  if (override) return override;
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  return normalizeDaptinEndpoint(env?.VITE_DAPTIN_ENDPOINT || DEFAULT_DAPTIN_ENDPOINT);
}

// Dev/session-bound endpoint switch. Changing it clears token and active document state.
export function setDaptinEndpointOverride(endpoint: string): void {
  const currentEndpoint = getDaptinEndpoint();
  const nextEndpoint = normalizeDaptinEndpoint(endpoint);
  if (nextEndpoint) window.localStorage.setItem(DAPTIN_ENDPOINT_STORAGE_KEY, nextEndpoint);
  else window.localStorage.removeItem(DAPTIN_ENDPOINT_STORAGE_KEY);

  const resolvedEndpoint = getDaptinEndpoint();
  if (resolvedEndpoint === currentEndpoint) return;
  clearEndpointBoundSession();
  resetDaptinClient();
}

// Dev/session-bound endpoint switch. Clearing it has the same session-reset semantics as setting it.
export function clearDaptinEndpointOverride(): void {
  setDaptinEndpointOverride('');
}

export function getToken(): string {
  const token = window.localStorage.getItem(DAPTIN_TOKEN_STORAGE_KEY) ?? '';
  if (!token) return '';
  const endpoint = getDaptinEndpoint();
  const sessionEndpoint = window.localStorage.getItem(DAPTIN_SESSION_ENDPOINT_STORAGE_KEY);
  if (!sessionEndpoint) {
    window.localStorage.setItem(DAPTIN_SESSION_ENDPOINT_STORAGE_KEY, endpoint);
    return token;
  }
  if (sessionEndpoint === endpoint) return token;
  clearEndpointBoundSession();
  return '';
}

export function setToken(token: string): void {
  window.localStorage.setItem(DAPTIN_TOKEN_STORAGE_KEY, token);
  window.localStorage.setItem(DAPTIN_SESSION_ENDPOINT_STORAGE_KEY, getDaptinEndpoint());
  setTokenCookie(token);
}

export function clearToken(): void {
  window.localStorage.removeItem(DAPTIN_TOKEN_STORAGE_KEY);
  window.localStorage.removeItem(DAPTIN_SESSION_ENDPOINT_STORAGE_KEY);
  clearTokenCookie();
  modelsLoadPromise = null;
}

export function clearDaptinSession(): void {
  clearToken();
  window.localStorage.removeItem(DAPTIN_ACTIVE_DOCUMENT_STORAGE_KEY);
}

export function tokenClaims(token = getToken()): Record<string, unknown> | null {
  const [, payload] = token.split('.');
  if (!payload) return null;
  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function tokenEmail(token = getToken()): string {
  const claims = tokenClaims(token);
  const email = claims?.email ?? claims?.Email ?? claims?.mail ?? claims?.Mail;
  return typeof email === 'string' && email.includes('@') ? email : '';
}

export function tokenName(token = getToken()): string {
  const claims = tokenClaims(token);
  const name = claims?.name ?? claims?.Name;
  return typeof name === 'string' && name.trim() ? name.trim() : '';
}

export function tokenSubject(token = getToken()): string {
  const claims = tokenClaims(token);
  const subject = claims?.sub ?? claims?.Sub;
  return typeof subject === 'string' && subject.trim() ? subject.trim() : '';
}

export function tokenExpired(token = getToken(), leewaySeconds = 30): boolean {
  if (!token) return true;
  const claims = tokenClaims(token);
  if (!claims) return true;
  const exp = typeof claims.exp === 'string' ? Number(claims.exp) : claims.exp;
  if (typeof exp !== 'number' || !Number.isFinite(exp)) return false;
  return exp * 1000 <= Date.now() + leewaySeconds * 1000;
}

export function hasUsableStoredToken(): boolean {
  const token = getToken();
  if (!token) return false;
  if (!tokenExpired(token)) return true;
  clearToken();
  return false;
}

export function requireUsableStoredToken(): void {
  if (hasUsableStoredToken()) return;
  throw new CanasterApiError('session', 'Your session has expired. Sign in again to save online.');
}

export function normalizeDaptinError(error: unknown, fallbackMessage = 'Daptin request failed'): CanasterApiError {
  if (error instanceof CanasterApiError) return error;

  const status = errorStatus(error);
  const message = errorMessage(error) || fallbackMessage;
  const lowerMessage = message.toLowerCase();
  let kind: CanasterApiErrorKind = 'api';

  if (status === 401 || /token expired|jwt expired|invalid token|unauthorized|session expired/.test(lowerMessage)) {
    kind = 'session';
  } else if (status === 403) {
    kind = 'permission';
  } else if (status === 404) {
    kind = 'not-found';
  } else if (status !== null && status >= 500) {
    kind = 'server';
  } else if (/forbidden|permission denied|access denied/.test(lowerMessage)) {
    kind = 'permission';
  } else if (/not found|missing/.test(lowerMessage)) {
    kind = 'not-found';
  } else if (/internal server error|server error|bad gateway|service unavailable/.test(lowerMessage)) {
    kind = 'server';
  } else if (status === null && /network|fetch|offline|failed to fetch|connection|timeout|err_network/.test(lowerMessage)) {
    kind = 'network';
  } else if (error instanceof SyntaxError || /invalid json|not valid json|document_content|snapshot/.test(lowerMessage)) {
    kind = 'invalid-response';
  }

  return new CanasterApiError(kind, message, { status, original: error });
}

export function isSessionError(error: unknown): boolean {
  return normalizeDaptinError(error).kind === 'session';
}

export function getDaptinClient(): DaptinClient {
  const endpoint = getDaptinEndpoint();
  if (!client || clientEndpoint !== endpoint) {
    client = new DaptinClient(endpoint, false, { getToken }, {});
    clientEndpoint = endpoint;
    modelsLoadPromise = null;
  }
  return client;
}

function resetDaptinClient(): void {
  client = null;
  clientEndpoint = '';
  modelsLoadPromise = null;
}

function clearEndpointBoundSession(): void {
  window.localStorage.removeItem(DAPTIN_TOKEN_STORAGE_KEY);
  window.localStorage.removeItem(DAPTIN_SESSION_ENDPOINT_STORAGE_KEY);
  window.localStorage.removeItem(DAPTIN_ACTIVE_DOCUMENT_STORAGE_KEY);
  clearTokenCookie();
  modelsLoadPromise = null;
}

function storedDaptinEndpointOverride(): string {
  return normalizeDaptinEndpoint(window.localStorage.getItem(DAPTIN_ENDPOINT_STORAGE_KEY) ?? '');
}

function normalizeDaptinEndpoint(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  try {
    return new URL(trimmed, window.location.href).origin;
  } catch {
    return '';
  }
}

function setTokenCookie(token: string): void {
  const attributes = tokenCookieAttributes();
  const encoded = encodeURIComponent(token);
  document.cookie = `${DAPTIN_TOKEN_COOKIE_NAME}=${encoded}; ${attributes.join('; ')}`;
}

function clearTokenCookie(): void {
  for (const attributes of tokenCookieAttributeVariants()) {
    document.cookie = `${DAPTIN_TOKEN_COOKIE_NAME}=; ${attributes.join('; ')}; Max-Age=0`;
  }
}

function tokenCookieAttributes(): string[] {
  const attributes = ['Path=/', 'SameSite=Lax', `Max-Age=${60 * 60 * 24 * 7}`];
  if (window.location.protocol === 'https:') attributes.push('Secure');
  const domain = sharedCookieDomain();
  if (domain) attributes.push(`Domain=${domain}`);
  return attributes;
}

function tokenCookieAttributeVariants(): string[][] {
  const base = ['Path=/', 'SameSite=Lax'];
  if (window.location.protocol === 'https:') base.push('Secure');
  const domain = sharedCookieDomain();
  return domain ? [base, [...base, `Domain=${domain}`]] : [base];
}

function sharedCookieDomain(): string {
  const endpointHostname = endpointHostnameOrNull();
  const pageHostname = window.location.hostname;
  if (!endpointHostname || endpointHostname === pageHostname) return '';
  if (pageHostname.endsWith('.canaster.in') || pageHostname === 'canaster.in') return '.canaster.in';
  return '';
}

function endpointHostnameOrNull(): string {
  try {
    return new URL(getDaptinEndpoint(), window.location.href).hostname;
  } catch {
    return '';
  }
}

export async function ensureDaptinModelsLoaded(): Promise<void> {
  if (!modelsLoadPromise) {
    modelsLoadPromise = getDaptinClient().worldManager.loadModel('document', false)
      .then(() => undefined)
      .catch((error) => {
        modelsLoadPromise = null;
        throw error;
      });
  }
  return modelsLoadPromise;
}

function errorStatus(error: unknown, depth = 0): number | null {
  if (depth > 5) return null;
  if (typeof error === 'string') return statusFromText(error);
  if (!isRecord(error)) return null;

  const direct = statusNumber(error.status) ?? statusNumber(error.statusCode) ?? statusNumber(error.code);
  if (direct !== null) return direct;

  const response = isRecord(error.response) ? error.response : null;
  const responseStatus = response ? statusNumber(response.status) ?? statusNumber(response.statusCode) : null;
  if (responseStatus !== null) return responseStatus;

  const responseDataStatus = response && 'data' in response ? errorStatus(response.data, depth + 1) : null;
  if (responseDataStatus !== null) return responseDataStatus;

  if (Array.isArray(error.errors)) {
    for (const item of error.errors) {
      const nested = errorStatus(item, depth + 1);
      if (nested !== null) return nested;
    }
  }

  const dataStatus = 'data' in error ? errorStatus(error.data, depth + 1) : null;
  if (dataStatus !== null) return dataStatus;

  const message = typeof error.message === 'string' ? error.message : '';
  return statusFromText(message);
}

function errorMessage(error: unknown, depth = 0): string {
  if (depth > 5) return '';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (!isRecord(error)) return '';

  for (const key of ['message', 'error', 'title', 'detail', 'statusText']) {
    const value = error[key];
    if (typeof value === 'string' && value.trim()) return value;
  }

  if (Array.isArray(error.errors)) {
    for (const item of error.errors) {
      const nested = errorMessage(item, depth + 1);
      if (nested) return nested;
    }
  }

  if ('data' in error) {
    const nested = errorMessage(error.data, depth + 1);
    if (nested) return nested;
  }

  if (isRecord(error.response)) {
    const nested = errorMessage(error.response, depth + 1);
    if (nested) return nested;
  }

  return '';
}

function statusNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599) return value;
  if (typeof value === 'string' && /^\d{3}$/.test(value)) return Number(value);
  return null;
}

function statusFromText(value: string): number | null {
  const match = value.match(/\b([1-5]\d{2})\b/);
  return match ? Number(match[1]) : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
