import { isImageAssetMime, isSupportedWorkspaceAssetFile } from '../../core/workspaceAssetTypes';
import { isWorkspacePreviewAssetFileName } from '../../core/workspacePreviewAssetFileName';
import { getDaptinClient, getDaptinEndpoint, getToken, normalizeDaptinError, requireUsableStoredToken } from './daptinClient';
import { daptinActionFailureMessage } from './daptinActionFailureMessage';

export type CanasterAssetSummary = {
  source: 'daptin';
  id: string;
  assetId: string;
  name: string;
  mime: string;
  createdAt: string | null;
  updatedAt: string | null;
  visibility: AssetVisibility | 'shared' | 'unknown';
  daptin: {
    referenceId: string;
    createdAt: string | null;
    updatedAt: string | null;
    ownerUserAccountId: string | null;
    permission: number | null;
    version: number | null;
    userGroups: DaptinUserGroupAccess[];
  };
  file: {
    table: 'asset';
    column: 'file';
    cloudStoreNamespace: 'assets';
    keyName: 'img';
    size: number | null;
    md5: string | null;
    path: string | null;
    src: string | null;
  };
  urls: {
    assetUrl: string;
    publicAssetUrl?: string;
  };
};

export type CanasterAssetObject = CanasterAssetSummary & {
  objectUrl: string;
};

export type AssetVisibility = 'private' | 'public';

type DaptinUserGroupAccess = {
  id?: string;
  referenceId: string;
  relationReferenceId?: string;
  permission?: number | null;
  name?: string;
};

type DaptinAssetAttributes = {
  name?: string;
  mime?: string;
  file?: string | DaptinBlobFileObject[] | DaptinStoredFileObject[];
  permission?: number;
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
  updatedAt?: string;
  user_account_id?: string;
  userAccountId?: string;
  reference_id?: string;
  referenceId?: string;
  version?: number;
  usergroup_id?: DaptinRelationList | DaptinRelationData[];
  usergroupId?: DaptinRelationList | DaptinRelationData[];
};

type DaptinAssetRow = {
  id?: string;
  reference_id?: string;
  referenceId?: string;
  attributes?: DaptinAssetAttributes;
  relationships?: {
    usergroup_id?: DaptinRelationList | DaptinRelationData[];
    usergroupId?: DaptinRelationList | DaptinRelationData[];
    [key: string]: unknown;
  };
} & DaptinAssetAttributes;

type DaptinBlobFileObject = {
  name: string;
  file: string;
  type: string;
  path?: string;
};

type DaptinStoredFileObject = {
  name?: string;
  type?: string;
  size?: number;
  md5?: string;
  path?: string;
  src?: string;
};

type DaptinRelationData = {
  id?: string;
  type?: string;
  reference_id?: string;
  relation_reference_id?: string;
  permission?: number;
  name?: string;
  attributes?: {
    reference_id?: string;
    relation_reference_id?: string;
    permission?: number;
    name?: string;
  };
};

type DaptinRelationList = {
  data?: DaptinRelationData | DaptinRelationData[] | null;
};

const ASSET_TABLE = 'asset';
const SET_ASSET_PRIVATE_ACTION = 'set_canaster_asset_private';
const SET_ASSET_PUBLIC_ACTION = 'set_canaster_asset_public';
const PRIVATE_ASSET_PERMISSION = 16256;
const PUBLIC_ASSET_PERMISSION = 16259;
const modelLoad = { promise: null as Promise<void> | null };
const objectUrls = new Map<string, { url: string; refCount: number }>();

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
    await setAssetVisibility(ref, 'private');
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
  for (const entry of objectUrls.values()) URL.revokeObjectURL(entry.url);
  objectUrls.clear();
}

export function releaseAssetObjectUrl(assetRef: string): void {
  const entry = objectUrls.get(assetRef);
  if (!entry) return;
  entry.refCount -= 1;
  if (entry.refCount > 0) return;
  URL.revokeObjectURL(entry.url);
  objectUrls.delete(assetRef);
}

export async function setAssetVisibility(assetRef: string, visibility: AssetVisibility): Promise<void> {
  return authenticatedAssetRequest('Could not update file visibility', async () => {
    await ensureAssetModelLoaded();
    const response = await getDaptinClient().actionManager.doAction(ASSET_TABLE, assetVisibilityActionName(visibility), {}, {
      referenceId: assetRef,
    });
    const failureMessage = daptinActionFailureMessage(response);
    if (failureMessage) throw new Error(failureMessage);
  });
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
  if (previous) {
    previous.refCount += 1;
    return { objectUrl: previous.url };
  }
  const objectUrl = URL.createObjectURL(blob);
  objectUrls.set(assetRef, { url: objectUrl, refCount: 1 });
  return { objectUrl };
}

function assetVisibilityActionName(visibility: AssetVisibility): string {
  return visibility === 'public' ? SET_ASSET_PUBLIC_ACTION : SET_ASSET_PRIVATE_ACTION;
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
  const permission = numberOrNull(rowAttr(row, 'permission'));
  const file = fileMetadataFromRow(row);
  return {
    source: 'daptin',
    id: explicitId,
    assetId: explicitId,
    name: String(rowAttr(row, 'name') ?? 'File'),
    mime: String(rowAttr(row, 'mime') ?? ''),
    createdAt: stringOrNull(rowAttr(row, 'created_at') ?? rowAttr(row, 'createdAt')),
    updatedAt: stringOrNull(rowAttr(row, 'updated_at') ?? rowAttr(row, 'updatedAt')),
    visibility: visibilityFromPermission(permission),
    daptin: {
      referenceId: explicitId,
      createdAt: stringOrNull(rowAttr(row, 'created_at') ?? rowAttr(row, 'createdAt')),
      updatedAt: stringOrNull(rowAttr(row, 'updated_at') ?? rowAttr(row, 'updatedAt')),
      ownerUserAccountId: stringOrNull(rowAttr(row, 'user_account_id') ?? rowAttr(row, 'userAccountId')),
      permission,
      version: numberOrNull(rowAttr(row, 'version')),
      userGroups: userGroupsFromRow(row),
    },
    file: {
      table: ASSET_TABLE,
      column: 'file',
      cloudStoreNamespace: 'assets',
      keyName: 'img',
      size: numberOrNull(file?.size),
      md5: stringOrNull(file?.md5),
      path: stringOrNull(file?.path),
      src: stringOrNull(file?.src ?? file?.name),
    },
    urls: {
      assetUrl: assetFileUrl(explicitId),
      ...(permission === PUBLIC_ASSET_PERMISSION ? { publicAssetUrl: assetFileUrl(explicitId) } : {}),
    },
  };
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function visibilityFromPermission(permission: number | null): AssetVisibility | 'shared' | 'unknown' {
  if (permission === PRIVATE_ASSET_PERMISSION) return 'private';
  if (permission === PUBLIC_ASSET_PERMISSION) return 'public';
  if (permission !== null && (permission & (1 << 15))) return 'shared';
  return 'unknown';
}

function fileMetadataFromRow(row: DaptinAssetRow): DaptinStoredFileObject | null {
  const raw = rowAttr(row, 'file');
  const files = typeof raw === 'string' ? parseFileMetadata(raw) : raw;
  return Array.isArray(files) && files[0] && typeof files[0] === 'object' ? files[0] as DaptinStoredFileObject : null;
}

function parseFileMetadata(value: string): DaptinStoredFileObject[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as DaptinStoredFileObject[] : [];
  } catch {
    return [];
  }
}

function userGroupsFromRow(row: DaptinAssetRow): DaptinUserGroupAccess[] {
  const relation = row.relationships?.usergroup_id ?? row.relationships?.usergroupId ?? rowAttr(row, 'usergroup_id') ?? rowAttr(row, 'usergroupId');
  if (!relation || typeof relation !== 'object') return [];
  const relationData = (relation as DaptinRelationList).data;
  const groups = Array.isArray(relation)
    ? relation
    : Array.isArray(relationData)
      ? relationData
      : relationData
        ? [relationData]
        : [];
  return groups.map((group) => {
    const referenceId = String(group.attributes?.reference_id ?? group.reference_id ?? group.id ?? '');
    const relationReferenceId = group.attributes?.relation_reference_id ?? group.relation_reference_id;
    const permission = group.attributes?.permission ?? group.permission;
    const name = group.attributes?.name ?? group.name;
    return {
      ...(group.id ? { id: group.id } : {}),
      referenceId,
      ...(relationReferenceId ? { relationReferenceId: String(relationReferenceId) } : {}),
      ...(typeof permission === 'number' ? { permission } : {}),
      ...(name ? { name: String(name) } : {}),
    };
  }).filter((group) => group.referenceId);
}
