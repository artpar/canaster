import Dexie, { type Table } from 'dexie';
import { isImageAssetMime, isSupportedWorkspaceAssetFile } from '../../core/workspaceAssetTypes';

export type LocalAssetSummary = {
  id: string;
  name: string;
  mime: string;
  updatedAt: string | null;
};

export type LocalAssetObject = LocalAssetSummary & {
  objectUrl: string;
};

type StoredLocalAsset = {
  id: string;
  schemaVersion: 1;
  name: string;
  mime: string;
  blob: Blob;
  updatedAt: number;
};

const DATABASE_NAME = 'canway-local-assets';
const LOCAL_ASSET_PREFIX = 'local:';
const objectUrls = new Map<string, { url: string; refCount: number }>();

class CanwayLocalAssetDatabase extends Dexie {
  assets!: Table<StoredLocalAsset, string>;

  constructor() {
    super(DATABASE_NAME);
    this.version(1).stores({
      assets: 'id, updatedAt, mime',
    });
  }
}

const db = new CanwayLocalAssetDatabase();

export function isLocalAssetId(assetId: string | null | undefined): assetId is string {
  return typeof assetId === 'string' && assetId.startsWith(LOCAL_ASSET_PREFIX);
}

export async function saveLocalAsset(file: File): Promise<LocalAssetSummary> {
  if (!isSupportedWorkspaceAssetFile(file)) throw new Error('Choose an image, PDF, or Markdown file.');
  const now = Date.now();
  const record: StoredLocalAsset = {
    id: `${LOCAL_ASSET_PREFIX}${assetToken()}`,
    schemaVersion: 1,
    name: file.name || 'file',
    mime: file.type || 'application/octet-stream',
    blob: file,
    updatedAt: now,
  };
  await db.assets.put(record);
  return summaryFromRecord(record);
}

// Image-only convenience wrapper; current app flows store files through the workspace asset service.
export async function saveLocalImageAsset(file: File): Promise<LocalAssetSummary> {
  if (!isImageAssetMime(file.type)) throw new Error('Choose an image file.');
  return saveLocalAsset(file);
}

export async function loadLocalAssetObject(assetId: string): Promise<LocalAssetObject> {
  const record = await db.assets.get(assetId);
  if (!record || record.schemaVersion !== 1) throw new Error('Local file was not found on this device.');
  const previous = objectUrls.get(assetId);
  if (previous) {
    previous.refCount += 1;
    return { ...summaryFromRecord(record), objectUrl: previous.url };
  }
  const objectUrl = URL.createObjectURL(record.blob);
  objectUrls.set(assetId, { url: objectUrl, refCount: 1 });
  return { ...summaryFromRecord(record), objectUrl };
}

export async function loadLocalAssetFile(assetId: string): Promise<File> {
  const record = await db.assets.get(assetId);
  if (!record || record.schemaVersion !== 1) throw new Error('Local file was not found on this device.');
  return new File([record.blob], record.name || 'file', { type: record.mime || record.blob.type || 'application/octet-stream' });
}

export function releaseLocalAssetObjectUrls(): void {
  for (const entry of objectUrls.values()) URL.revokeObjectURL(entry.url);
  objectUrls.clear();
}

export function releaseLocalAssetObjectUrl(assetId: string): void {
  const entry = objectUrls.get(assetId);
  if (!entry) return;
  entry.refCount -= 1;
  if (entry.refCount > 0) return;
  URL.revokeObjectURL(entry.url);
  objectUrls.delete(assetId);
}

function assetToken(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function summaryFromRecord(record: StoredLocalAsset): LocalAssetSummary {
  return {
    id: record.id,
    name: record.name || 'File',
    mime: record.mime,
    updatedAt: new Date(record.updatedAt).toISOString(),
  };
}
