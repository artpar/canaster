import { DaptinClient } from 'daptin-client';

export const DAPTIN_TOKEN_STORAGE_KEY = 'canaster:daptin:token';
export const DAPTIN_ACTIVE_DOCUMENT_STORAGE_KEY = 'canaster:daptin:active-document';
export const DAPTIN_LAST_EMAIL_STORAGE_KEY = 'canaster:daptin:last-email';

const DEFAULT_DAPTIN_ENDPOINT = 'http://localhost:6336';

let client: DaptinClient | null = null;
let modelsLoadPromise: Promise<void> | null = null;

export function getDaptinEndpoint(): string {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  return env?.VITE_DAPTIN_ENDPOINT || DEFAULT_DAPTIN_ENDPOINT;
}

export function getToken(): string {
  return window.localStorage.getItem(DAPTIN_TOKEN_STORAGE_KEY) ?? '';
}

export function setToken(token: string): void {
  window.localStorage.setItem(DAPTIN_TOKEN_STORAGE_KEY, token);
}

export function clearToken(): void {
  window.localStorage.removeItem(DAPTIN_TOKEN_STORAGE_KEY);
}

export function getDaptinClient(): DaptinClient {
  if (!client) {
    client = new DaptinClient(getDaptinEndpoint(), false, { getToken }, {});
  }
  return client;
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
