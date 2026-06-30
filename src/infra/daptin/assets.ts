import type { DaptinJsonApiSingleResponse } from 'daptin-client';
import { isImageAssetMime, isSupportedWorkspaceAssetFile } from '../../core/workspaceAssetTypes';
import { isWorkspacePreviewAssetFileName } from '../../core/workspacePreviewAssetFileName';
import { getDaptinClient, getDaptinEndpoint, getToken, normalizeDaptinError, requireUsableStoredToken } from './daptinClient';

export type CanasterAssetSummary = {
  id: string;
  name: string;
  mime: string;
  updatedAt: string | null;
};

export type CanasterAssetObject = CanasterAssetSummary & {
  objectUrl: string;
};

type DaptinAssetAttributes = {
  name?: string;
  mime?: string;
  file?: string | DaptinBlobFileObject[];
  permission?: number;
  updated_at?: string;
  updatedAt?: string;
  reference_id?: string;
  referenceId?: string;
};

type DaptinAssetRow = {
  id?: string;
  reference_id?: string;
  referenceId?: string;
  attributes?: DaptinAssetAttributes;
} & DaptinAssetAttributes;

type DaptinBlobFileObject = {
  name: string;
  file: string;
  type: string;
};

const ASSET_TABLE = 'asset';
const PRIVATE_PERMISSION = 16256;
const modelLoad = { promise: null as Promise<void> | null };
const objectUrls = new Map<string, string>();

export async function uploadWorkspaceAsset(file: File): Promise<CanasterAssetSummary> {
  if (!isSupportedWorkspaceAssetFile(file)) throw new Error('Choose an image, PDF, or Markdown file.');
  return authenticatedAssetRequest('Could not upload this file', async () => {
    await ensureAssetModelLoaded();
    const encoded = await encodeAssetFile(file);
    const created = await getDaptinClient().jsonApi.create?.<DaptinAssetAttributes>(ASSET_TABLE, {
      name: file.name || 'file',
      mime: file.type || 'application/octet-stream',
      file: [encoded],
    });
    if (!created?.data) throw new Error('Daptin asset create did not return a row');
    const ref = assetId(created.data as DaptinAssetRow);
    if (!ref) throw new Error('Daptin asset create did not return a reference id');
    await updateAsset(ref, { permission: PRIVATE_PERMISSION });
    return summaryFromRow(created.data as DaptinAssetRow, ref);
  });
}

export async function uploadImageAsset(file: File): Promise<CanasterAssetSummary> {
  if (!isImageAssetMime(file.type)) throw new Error('Choose an image file.');
  return uploadWorkspaceAsset(file);
}

export async function listImageAssets(): Promise<CanasterAssetSummary[]> {
  return authenticatedAssetRequest('Could not list image assets', async () => {
    await ensureAssetModelLoaded();
    const response = await getDaptinClient().jsonApi.findAll<DaptinAssetAttributes>(ASSET_TABLE, {
      page: { size: 100 },
      sort: '-updated_at',
    });
    return (response.data ?? [])
      .map((row) => row as DaptinAssetRow)
      .filter((row) => assetId(row) && isImageAssetMime(String(rowAttr(row, 'mime') ?? '')))
      .filter((row) => !isWorkspacePreviewAssetFileName(String(rowAttr(row, 'name') ?? '')))
      .map((row) => summaryFromRow(row));
  });
}

export async function loadAssetObject(assetRef: string): Promise<CanasterAssetObject> {
  return authenticatedAssetRequest('Could not load this file asset', async () => {
    await ensureAssetModelLoaded();
    const response = await getDaptinClient().jsonApi.find<DaptinAssetAttributes>(ASSET_TABLE, assetRef);
    if (!response.data) throw new Error(`Daptin asset not found: ${assetRef}`);
    const row = response.data as DaptinAssetRow;
    const id = assetId(row);
    if (!id) throw new Error('Daptin asset row is missing an id');
    const { objectUrl } = objectUrlForAsset(id, await fetchAssetBlob(id));
    return { ...summaryFromRow(row, id), objectUrl };
  });
}

export async function loadAssetFile(assetRef: string): Promise<File> {
  return authenticatedAssetRequest('Could not load this file asset', async () => {
    await ensureAssetModelLoaded();
    const response = await getDaptinClient().jsonApi.find<DaptinAssetAttributes>(ASSET_TABLE, assetRef);
    if (!response.data) throw new Error(`Daptin asset not found: ${assetRef}`);
    const row = response.data as DaptinAssetRow;
    const id = assetId(row);
    if (!id) throw new Error('Daptin asset row is missing an id');
    const blob = await fetchAssetBlob(id);
    const summary = summaryFromRow(row, id);
    return new File([blob], summary.name || 'file', { type: summary.mime || blob.type || 'application/octet-stream' });
  });
}

export function releaseAssetObjectUrls(): void {
  for (const url of objectUrls.values()) URL.revokeObjectURL(url);
  objectUrls.clear();
}

async function authenticatedAssetRequest<T>(fallbackMessage: string, run: () => Promise<T>): Promise<T> {
  try {
    requireUsableStoredToken();
    return await run();
  } catch (error) {
    throw normalizeDaptinError(error, fallbackMessage);
  }
}

async function ensureAssetModelLoaded(): Promise<void> {
  if (!modelLoad.promise) {
    modelLoad.promise = getDaptinClient().worldManager.loadModel(ASSET_TABLE, false)
      .then(() => undefined)
      .catch((error) => {
        modelLoad.promise = null;
        throw error;
      });
  }
  return modelLoad.promise;
}

async function updateAsset(assetRef: string, attributes: DaptinAssetAttributes): Promise<DaptinJsonApiSingleResponse<DaptinAssetAttributes>> {
  const update = getDaptinClient().jsonApi.update as unknown as (
    typeName: string,
    payload: DaptinAssetAttributes & { id: string },
  ) => Promise<DaptinJsonApiSingleResponse<DaptinAssetAttributes>>;
  if (!update) throw new Error('daptin-client jsonApi.update is unavailable');
  return update.call(getDaptinClient().jsonApi, ASSET_TABLE, { id: assetRef, ...attributes });
}

async function encodeAssetFile(file: File): Promise<DaptinBlobFileObject> {
  return {
    name: file.name || 'file',
    file: await fileToDataUri(file),
    type: file.type || 'application/octet-stream',
  };
}

async function fetchAssetBlob(assetRef: string): Promise<Blob> {
  const response = await fetch(assetFileUrl(assetRef), {
    headers: { Authorization: `Bearer ${getToken()}` },
    credentials: 'include',
  });
  if (!response.ok) throw new Error(`Daptin asset download failed with ${response.status}`);
  return response.blob();
}

function assetFileUrl(assetRef: string): string {
  return `${getDaptinEndpoint()}/asset/${ASSET_TABLE}/${encodeURIComponent(assetRef)}/file`;
}

function objectUrlForAsset(assetRef: string, blob: Blob): { objectUrl: string } {
  const previous = objectUrls.get(assetRef);
  if (previous) URL.revokeObjectURL(previous);
  const objectUrl = URL.createObjectURL(blob);
  objectUrls.set(assetRef, objectUrl);
  return { objectUrl };
}

function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result ?? '')));
    reader.addEventListener('error', () => reject(reader.error ?? new Error('Could not read image file')));
    reader.readAsDataURL(file);
  });
}

function assetId(row: DaptinAssetRow): string {
  return String(row.id ?? row.reference_id ?? row.referenceId ?? row.attributes?.reference_id ?? row.attributes?.referenceId ?? '');
}

function rowAttr(row: DaptinAssetRow, key: keyof DaptinAssetAttributes): unknown {
  return row.attributes?.[key] ?? row[key];
}

function summaryFromRow(row: DaptinAssetRow, explicitId = assetId(row)): CanasterAssetSummary {
  return {
    id: explicitId,
    name: String(rowAttr(row, 'name') ?? 'File'),
    mime: String(rowAttr(row, 'mime') ?? ''),
    updatedAt: stringOrNull(rowAttr(row, 'updated_at') ?? rowAttr(row, 'updatedAt')),
  };
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}
