import type { DaptinJsonApiSingleResponse } from 'daptin-client';
import type { CanvasWorkspaceSnapshot } from '../engine/documentTypes';
import { hydrateWorkspaceSnapshot } from '../engine/workspaceHistory';
import { clearToken, ensureDaptinModelsLoaded, getDaptinClient, setToken } from './daptinClient';

export type CanasterDocumentSummary = {
  id: string;
  title: string;
  path: string;
  permission: number;
  updatedAt: string | null;
};

export type CanasterLoadedDocument = {
  snapshot: CanvasWorkspaceSnapshot;
  title: string;
};

type DaptinDocumentAttributes = {
  document_name?: string;
  document_path?: string;
  document_extension?: string;
  mime_type?: string;
  document_content?: string;
  permission?: number;
  updated_at?: string;
  updatedAt?: string;
  reference_id?: string;
  referenceId?: string;
};

type DaptinDocumentRow = {
  id?: string;
  reference_id?: string;
  referenceId?: string;
  attributes?: DaptinDocumentAttributes;
} & DaptinDocumentAttributes;

type DaptinFileObject = {
  name: string;
  file: string;
  type: 'application/json';
};

const PRIVATE_PERMISSION = 16256;
const PUBLIC_READ_PERMISSION = 16259;
const REQUEST_EMAIL_OTP_ACTION = 'request_canaster_email_otp';
const VERIFY_EMAIL_OTP_ACTION = 'verify_canaster_email_otp';

export async function requestEmailOtp(input: { email: string }): Promise<void> {
  const client = getDaptinClient();
  const response = await client.actionManager.doAction('user_account', REQUEST_EMAIL_OTP_ACTION, {
    email: input.email,
  });
  const failureMessage = daptinActionFailureMessage(response);
  if (failureMessage) throw new Error(failureMessage);
}

export async function verifyEmailOtp(input: { email: string; otp: string }): Promise<void> {
  const client = getDaptinClient();
  const response = await client.actionManager.doAction('user_account', VERIFY_EMAIL_OTP_ACTION, {
    email: input.email,
    otp: input.otp,
  });
  const failureMessage = daptinActionFailureMessage(response);
  if (failureMessage) throw new Error(failureMessage);
  const token = client.authManager.extractToken(response);
  if (!token) throw new Error('Daptin OTP verification did not return a token');
  setToken(token);
  await ensureDaptinModelsLoaded();
}

export async function signOut(): Promise<void> {
  clearToken();
  await getDaptinClient().authManager.signout();
}

export async function listDocuments(): Promise<CanasterDocumentSummary[]> {
  await ensureDaptinModelsLoaded();
  const response = await getDaptinClient().jsonApi.findAll<DaptinDocumentAttributes>('document', {
    page: { size: 100 },
    sort: '-updated_at',
  });
  return (response.data ?? [])
    .map((row) => row as DaptinDocumentRow)
    .filter((row) => documentId(row) && String(rowAttr(row, 'document_extension') ?? '').toLowerCase() === 'json')
    .map((row) => ({
      id: documentId(row),
      title: documentTitle(row),
      path: String(rowAttr(row, 'document_path') ?? ''),
      permission: Number(rowAttr(row, 'permission') ?? 0),
      updatedAt: stringOrNull(rowAttr(row, 'updated_at') ?? rowAttr(row, 'updatedAt')),
    }));
}

export async function createDocument(title: string, snapshot: CanvasWorkspaceSnapshot): Promise<string> {
  await ensureDaptinModelsLoaded();
  const client = getDaptinClient();
  const documentKey = crypto.randomUUID();
  const placeholder = JSON.stringify([{ name: 'pending.canaster.json', file: encodeJsonDataUri({ schemaVersion: 1, pending: true }), type: 'application/json' }]);
  const created = await client.jsonApi.create?.<DaptinDocumentAttributes>('document', {
    document_name: 'pending.canaster.json',
    document_path: `/canaster/pending/${documentKey}.canaster.json`,
    document_extension: 'json',
    mime_type: 'application/json',
    document_content: placeholder,
  });
  if (!created?.data) throw new Error('Daptin document create did not return a row');
  const ref = documentId(created.data as DaptinDocumentRow);
  if (!ref) throw new Error('Daptin document create did not return a reference id');
  await updateDocument(ref, { permission: PRIVATE_PERMISSION });
  await updateDocument(ref, {
    document_name: `${safeDocumentTitle(title)}.canaster.json`,
    document_path: `/canaster/documents/${ref}.canaster.json`,
    document_extension: 'json',
    mime_type: 'application/json',
    document_content: encodeSnapshotContent(`${safeDocumentTitle(title)}.canaster.json`, snapshot),
  });
  return ref;
}

export async function loadDocument(documentRef: string): Promise<CanvasWorkspaceSnapshot> {
  return (await loadDocumentDetails(documentRef)).snapshot;
}

export async function loadDocumentDetails(documentRef: string): Promise<CanasterLoadedDocument> {
  await ensureDaptinModelsLoaded();
  const response = await getDaptinClient().jsonApi.find<DaptinDocumentAttributes>('document', documentRef);
  if (!response.data) throw new Error(`Daptin document not found: ${documentRef}`);
  const row = response.data as DaptinDocumentRow;
  const content = rowAttr(row, 'document_content');
  if (typeof content !== 'string') throw new Error('Daptin document_content was not a string');
  return {
    snapshot: decodeSnapshotContent(content),
    title: documentTitle(row),
  };
}

export async function saveDocument(documentRef: string, snapshot: CanvasWorkspaceSnapshot, title?: string): Promise<void> {
  const current = await getDocumentRow(documentRef);
  const name = title === undefined
    ? String(rowAttr(current, 'document_name') ?? `${documentRef}.canaster.json`)
    : `${safeDocumentTitle(title)}.canaster.json`;
  await updateDocument(documentRef, {
    ...(title === undefined ? {} : {
      document_name: name,
      document_path: `/canaster/documents/${documentRef}.canaster.json`,
    }),
    document_content: encodeSnapshotContent(name, snapshot),
    document_extension: 'json',
    mime_type: 'application/json',
  });
}

export async function makeDocumentPrivate(documentRef: string): Promise<void> {
  await updateDocument(documentRef, { permission: PRIVATE_PERMISSION });
}

export async function makeDocumentPublic(documentRef: string): Promise<void> {
  await updateDocument(documentRef, { permission: PUBLIC_READ_PERMISSION });
}

export async function deleteDocument(documentRef: string): Promise<void> {
  await ensureDaptinModelsLoaded();
  const destroy = getDaptinClient().jsonApi.destroy;
  if (!destroy) throw new Error('daptin-client jsonApi.destroy is unavailable');
  await destroy.call(getDaptinClient().jsonApi, 'document', documentRef);
}

async function getDocumentRow(documentRef: string): Promise<DaptinDocumentRow> {
  await ensureDaptinModelsLoaded();
  const response = await getDaptinClient().jsonApi.find<DaptinDocumentAttributes>('document', documentRef);
  if (!response.data) throw new Error(`Daptin document not found: ${documentRef}`);
  return response.data as DaptinDocumentRow;
}

async function updateDocument(documentRef: string, attributes: DaptinDocumentAttributes): Promise<DaptinJsonApiSingleResponse<DaptinDocumentAttributes>> {
  await ensureDaptinModelsLoaded();
  const update = getDaptinClient().jsonApi.update as unknown as (
    typeName: string,
    payload: DaptinDocumentAttributes & { id: string },
  ) => Promise<DaptinJsonApiSingleResponse<DaptinDocumentAttributes>>;
  if (!update) throw new Error('daptin-client jsonApi.update is unavailable');
  return update.call(getDaptinClient().jsonApi, 'document', { id: documentRef, ...attributes });
}

function encodeSnapshotContent(name: string, snapshot: CanvasWorkspaceSnapshot): string {
  return JSON.stringify([{ name, file: encodeJsonDataUri(hydrateWorkspaceSnapshot(snapshot)), type: 'application/json' } satisfies DaptinFileObject]);
}

function daptinActionFailureMessage(response: unknown): string {
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

function decodeSnapshotContent(documentContent: string): CanvasWorkspaceSnapshot {
  const files = JSON.parse(documentContent) as DaptinFileObject[];
  if (!Array.isArray(files) || files.length !== 1) throw new Error('Daptin document_content must contain exactly one file');
  if (files[0].type !== 'application/json') throw new Error(`Expected application/json document_content, got ${files[0].type}`);
  const [, base64] = files[0].file.split(',');
  if (!base64) throw new Error('Daptin document_content file is missing base64 payload');
  return hydrateWorkspaceSnapshot(JSON.parse(new TextDecoder().decode(base64ToBytes(base64))) as CanvasWorkspaceSnapshot);
}

function encodeJsonDataUri(value: unknown): string {
  return `data:application/json;base64,${bytesToBase64(new TextEncoder().encode(JSON.stringify(value)))}`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function documentId(row: DaptinDocumentRow): string {
  return String(row.id ?? row.reference_id ?? row.referenceId ?? row.attributes?.reference_id ?? row.attributes?.referenceId ?? '');
}

function rowAttr(row: DaptinDocumentRow, key: keyof DaptinDocumentAttributes): unknown {
  return row.attributes?.[key] ?? row[key];
}

function documentTitle(row: DaptinDocumentRow): string {
  const name = String(rowAttr(row, 'document_name') ?? 'Untitled');
  return name.endsWith('.canaster.json') ? name.slice(0, -'.canaster.json'.length) : name;
}

function safeDocumentTitle(title: string): string {
  return (title.trim() || 'Untitled').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'Untitled';
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}
