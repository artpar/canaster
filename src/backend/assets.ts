import type { DaptinJsonApiSingleResponse } from 'daptin-client';
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

export async function uploadImageAsset(file: File): Promise<CanasterAssetSummary> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.');
  return authenticatedAssetRequest('Could not upload this image', async () => {
    await ensureAssetModelLoaded();
    const encoded = await encodeAssetFile(file);
    const created = await getDaptinClient().jsonApi.create?.<DaptinAssetAttributes>(ASSET_TABLE, {
      name: file.name || 'image',
      mime: file.type,
      file: [encoded],
    });
    if (!created?.data) throw new Error('Daptin asset create did not return a row');
    const ref = assetId(created.data as DaptinAssetRow);
    if (!ref) throw new Error('Daptin asset create did not return a reference id');
    await updateAsset(ref, { permission: PRIVATE_PERMISSION });
    return summaryFromRow(created.data as DaptinAssetRow, ref);
  });
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
      .filter((row) => assetId(row) && String(rowAttr(row, 'mime') ?? '').startsWith('image/'))
      .map((row) => summaryFromRow(row));
  });
}

export async function loadAssetObject(assetRef: string): Promise<CanasterAssetObject> {
  return authenticatedAssetRequest('Could not load this image asset', async () => {
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
    name: file.name || 'image',
    file: await fileToDataUri(file),
    type: file.type || 'application/octet-stream',
  };
}

function decodeAssetFile(fileValue: unknown): Blob {
  const files = typeof fileValue === 'string' ? JSON.parse(fileValue) as DaptinBlobFileObject[] : fileValue;
  if (!Array.isArray(files) || files.length < 1) throw new Error('Daptin asset file is empty');
  const first = files[0];
  if (!first || typeof first.file !== 'string') throw new Error('Daptin asset file is missing its payload');
  const [header, base64] = first.file.split(',');
  if (!base64) throw new Error('Daptin asset file is missing base64 data');
  const mime = first.type || header.match(/^data:([^;]+)/)?.[1] || 'application/octet-stream';
  const bytes = base64ToBytes(base64);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Blob([buffer], { type: mime });
}

async function fetchAssetBlob(assetRef: string): Promise<Blob> {
  const response = await fetch(`${getDaptinEndpoint()}/asset/${ASSET_TABLE}/${encodeURIComponent(assetRef)}/file`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!response.ok) throw new Error(`Daptin asset download failed with ${response.status}`);
  return response.blob();
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

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
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
    name: String(rowAttr(row, 'name') ?? 'Image'),
    mime: String(rowAttr(row, 'mime') ?? ''),
    updatedAt: stringOrNull(rowAttr(row, 'updated_at') ?? rowAttr(row, 'updatedAt')),
  };
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}
