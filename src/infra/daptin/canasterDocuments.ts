import type { DaptinJsonApiSingleResponse } from 'daptin-client';
import { safeDocumentSlug } from '../../core/documentSlug';
import type { CanvasWorkspaceSnapshot } from '../../domain/documentTypes';
import { hydrateWorkspaceSnapshot } from '../../domain/workspaceHistory';
import {
  clearToken,
  daptinAction,
  daptinCreate,
  daptinExtractToken,
  daptinFind,
  daptinFindAll,
  daptinSignOut,
  daptinUpdate,
  ensureDaptinModelsLoaded,
  normalizeDaptinError,
  requireUsableStoredToken,
  setToken,
} from './daptinClient';
import { daptinActionFailureMessage } from './daptinActionFailureMessage';
import type { DocumentVisibility } from './documentPermissions';

export type CanasterDocumentSummary = {
  id: string;
  title: string;
  publicOwner: string;
  ownerAccountId: string;
  slug: string;
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
  user_account_id?: string;
  updated_at?: string;
  updatedAt?: string;
  reference_id?: string;
  referenceId?: string;
};

type DaptinDocumentWritableAttributes = Pick<
  DaptinDocumentAttributes,
  'document_name' | 'document_path' | 'document_extension' | 'mime_type' | 'document_content'
>;

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

const REQUEST_EMAIL_OTP_ACTION = 'request_canaster_email_otp';
const REQUEST_PASSWORD_RESET_ACTION = 'request_canaster_password_reset';
const SIGNIN_ACTION = 'signin';
const VERIFY_PASSWORD_RESET_ACTION = 'reset-password-verify';
const VERIFY_EMAIL_OTP_ACTION = 'verify_canaster_email_otp';
const SET_DOCUMENT_PRIVATE_ACTION = 'set_canaster_document_private';
const SET_DOCUMENT_PUBLIC_ACTION = 'set_canaster_document_public';

export async function requestEmailOtp(input: { email: string }): Promise<void> {
  return daptinRequest('Could not send a sign-in code', async () => {
    const response = await daptinAction('user_account', REQUEST_EMAIL_OTP_ACTION, {
      email: input.email,
    });
    const failureMessage = daptinActionFailureMessage(response);
    if (failureMessage) throw new Error(failureMessage);
  });
}

export async function verifyEmailOtp(input: { email: string; otp: string }): Promise<void> {
  return daptinRequest('Could not verify the sign-in code', async () => {
    const response = await daptinAction('user_account', VERIFY_EMAIL_OTP_ACTION, {
      email: input.email,
      otp: input.otp,
    });
    const failureMessage = daptinActionFailureMessage(response);
    if (failureMessage) throw new Error(failureMessage);
    await storeDaptinAuthToken(response, 'Daptin OTP verification did not return a token');
  });
}

export async function signInWithPassword(input: { email: string; password: string }): Promise<void> {
  return daptinRequest('Could not sign in with that password', async () => {
    const response = await daptinAction('user_account', SIGNIN_ACTION, {
      email: input.email,
      password: input.password,
    });
    const failureMessage = daptinActionFailureMessage(response);
    if (failureMessage) throw new Error(failureMessage);
    await storeDaptinAuthToken(response, 'Daptin password sign-in did not return a token');
  });
}

export async function requestPasswordReset(input: { email: string }): Promise<void> {
  return daptinRequest('Could not send a password reset code', async () => {
    const response = await daptinAction('user_account', REQUEST_PASSWORD_RESET_ACTION, {
      email: input.email,
    });
    const failureMessage = daptinActionFailureMessage(response);
    if (failureMessage) throw new Error(failureMessage);
  });
}

export async function verifyPasswordReset(input: { email: string; otp: string }): Promise<void> {
  return daptinRequest('Could not reset the password', async () => {
    const response = await daptinAction('user_account', VERIFY_PASSWORD_RESET_ACTION, {
      email: input.email,
      otp: input.otp,
    });
    const failureMessage = daptinActionFailureMessage(response);
    if (failureMessage) throw new Error(failureMessage);
  });
}

export async function signOut(): Promise<void> {
  clearToken();
  await daptinSignOut();
}

export async function listDocuments(): Promise<CanasterDocumentSummary[]> {
  return authenticatedDaptinRequest('Could not list saved workspaces', async () => {
    const response = await daptinFindAll<DaptinDocumentAttributes>('document', {
      page: { size: 100 },
      sort: '-updated_at',
    });
    return (response.data ?? [])
      .map((row) => row as DaptinDocumentRow)
      .filter((row) => documentId(row) && String(rowAttr(row, 'document_extension') ?? '').toLowerCase() === 'json')
      .map(documentSummary);
  });
}

export async function createDocument(title: string, snapshot: CanvasWorkspaceSnapshot, publicOwner: string): Promise<string> {
  return authenticatedDaptinRequest('Could not create a saved workspace', async () => {
    const documentKey = crypto.randomUUID();
    const placeholder = JSON.stringify([{ name: 'pending.canaster.json', file: encodeJsonDataUri({ schemaVersion: 1, pending: true }), type: 'application/json' }]);
    const created = await daptinCreate<DaptinDocumentAttributes>('document', {
      document_name: 'pending.canaster.json',
      document_path: `/canaster/pending/${documentKey}.canaster.json`,
      document_extension: 'json',
      mime_type: 'application/json',
      document_content: placeholder,
    });
    if (!created?.data) throw new Error('Daptin document create did not return a row');
    const ref = documentId(created.data as DaptinDocumentRow);
    if (!ref) throw new Error('Daptin document create did not return a reference id');
    const name = documentStorageName(publicOwner, title);
    await executeDocumentVisibilityAction(ref, 'private');
    await updateDocument(ref, {
      document_name: name,
      document_path: `/canaster/documents/${ref}.canaster.json`,
      document_extension: 'json',
      mime_type: 'application/json',
      document_content: encodeSnapshotContent(name, snapshot),
    });
    return ref;
  });
}

export async function loadDocumentDetails(documentRef: string): Promise<CanasterLoadedDocument> {
  return authenticatedDaptinRequest('Could not load this saved workspace', async () => {
    const response = await daptinFind<DaptinDocumentAttributes>('document', documentRef);
    if (!response.data) throw new Error(`Daptin document not found: ${documentRef}`);
    const row = response.data as DaptinDocumentRow;
    const content = rowAttr(row, 'document_content');
    if (typeof content !== 'string') throw new Error('Daptin document_content was not a string');
    return {
      snapshot: decodeSnapshotContent(content),
      title: documentTitle(row),
    };
  });
}

export async function saveDocument(documentRef: string, snapshot: CanvasWorkspaceSnapshot, title?: string, publicOwner?: string): Promise<void> {
  return authenticatedDaptinRequest('Could not save this workspace', async () => {
    const current = await getDocumentRow(documentRef);
    const name = title === undefined
      ? String(rowAttr(current, 'document_name') ?? `${documentRef}.canaster.json`)
      : documentStorageName(publicOwner || documentOwnerSlug(current), title);
    await updateDocument(documentRef, {
      ...(title === undefined ? {} : {
        document_name: name,
        document_path: `/canaster/documents/${documentRef}.canaster.json`,
      }),
      document_content: encodeSnapshotContent(name, snapshot),
      document_extension: 'json',
      mime_type: 'application/json',
    });
  });
}

export async function findDocumentByPublicPath(publicOwner: string, slug: string): Promise<CanasterDocumentSummary | null> {
  return authenticatedDaptinRequest('Could not open this shared workspace', async () => {
    const response = await daptinFindAll<DaptinDocumentAttributes>('document', {
      page: { size: 1 },
      query: [
        { column: 'document_name', operator: 'is', value: `${publicOwner}/${slug}.canaster.json` },
        { column: 'document_extension', operator: 'is', value: 'json' },
      ],
    });
    const row = (response.data?.[0] ?? null) as DaptinDocumentRow | null;
    return row ? documentSummary(row) : null;
  });
}

export async function setDocumentVisibility(documentRef: string, visibility: DocumentVisibility): Promise<void> {
  return authenticatedDaptinRequest('Could not update workspace visibility', async () => {
    await executeDocumentVisibilityAction(documentRef, visibility);
  });
}

async function getDocumentRow(documentRef: string): Promise<DaptinDocumentRow> {
  await ensureDaptinModelsLoaded();
  const response = await daptinFind<DaptinDocumentAttributes>('document', documentRef);
  if (!response.data) throw new Error(`Daptin document not found: ${documentRef}`);
  return response.data as DaptinDocumentRow;
}

async function updateDocument(documentRef: string, attributes: DaptinDocumentWritableAttributes): Promise<DaptinJsonApiSingleResponse<DaptinDocumentAttributes>> {
  await ensureDaptinModelsLoaded();
  return daptinUpdate<DaptinDocumentAttributes>('document', documentRef, attributes);
}

async function executeDocumentVisibilityAction(documentRef: string, visibility: DocumentVisibility): Promise<void> {
  await ensureDaptinModelsLoaded();
  const response = await daptinAction('document', documentVisibilityActionName(visibility), {}, {
    referenceId: documentRef,
  });
  const failureMessage = daptinActionFailureMessage(response);
  if (failureMessage) throw new Error(failureMessage);
}

async function authenticatedDaptinRequest<T>(fallbackMessage: string, run: () => Promise<T>): Promise<T> {
  return daptinRequest(fallbackMessage, async () => {
    requireUsableStoredToken();
    await ensureDaptinModelsLoaded();
    return run();
  });
}

async function daptinRequest<T>(fallbackMessage: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throw normalizeDaptinError(error, fallbackMessage);
  }
}

async function storeDaptinAuthToken(response: any[], missingTokenMessage: string): Promise<void> {
  const token = daptinExtractToken(response);
  if (!token) throw new Error(missingTokenMessage);
  setToken(token);
  await ensureDaptinModelsLoaded();
}

function encodeSnapshotContent(name: string, snapshot: CanvasWorkspaceSnapshot): string {
  return JSON.stringify([{ name, file: encodeJsonDataUri(hydrateWorkspaceSnapshot(snapshot)), type: 'application/json' } satisfies DaptinFileObject]);
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
  const name = documentSlug(row) || 'Untitled';
  return name.endsWith('.canaster.json') ? name.slice(0, -'.canaster.json'.length) : name;
}

function documentSummary(row: DaptinDocumentRow): CanasterDocumentSummary {
  const title = documentTitle(row);
  return {
    id: documentId(row),
    title,
    publicOwner: documentOwnerSlug(row),
    ownerAccountId: String(rowAttr(row, 'user_account_id') ?? ''),
    slug: safeDocumentSlug(title),
    path: String(rowAttr(row, 'document_path') ?? ''),
    permission: Number(rowAttr(row, 'permission') ?? 0),
    updatedAt: stringOrNull(rowAttr(row, 'updated_at') ?? rowAttr(row, 'updatedAt')),
  };
}

function documentStorageName(publicOwner: string, title: string): string {
  const owner = publicOwner.trim() || 'account';
  return `${owner}/${safeDocumentSlug(title)}.canaster.json`;
}

function documentVisibilityActionName(visibility: DocumentVisibility): string {
  return visibility === 'public' ? SET_DOCUMENT_PUBLIC_ACTION : SET_DOCUMENT_PRIVATE_ACTION;
}

function documentOwnerSlug(row: DaptinDocumentRow): string {
  const name = String(rowAttr(row, 'document_name') ?? '');
  return name.includes('/') ? name.split('/')[0] ?? '' : '';
}

function documentSlug(row: DaptinDocumentRow): string {
  const name = String(rowAttr(row, 'document_name') ?? 'Untitled');
  return name.includes('/') ? name.slice(name.lastIndexOf('/') + 1) : name;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}
