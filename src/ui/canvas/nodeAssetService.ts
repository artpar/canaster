export type DaptinUserGroupAccess = {
  id?: string;
  referenceId: string;
  relationReferenceId?: string;
  permission?: number | null;
  name?: string;
};

export type DaptinEntityAccess = {
  referenceId: string;
  createdAt: string | null;
  updatedAt: string | null;
  ownerUserAccountId: string | null;
  permission: number | null;
  version: number | null;
  userGroups: DaptinUserGroupAccess[];
};

export type CanasterAssetVisibility = 'private' | 'public' | 'shared' | 'unknown';

export type CanasterAssetRecord = {
  source: 'daptin' | 'local';
  id: string;
  assetId: string;
  name: string;
  mime: string;
  createdAt: string | null;
  updatedAt: string | null;
  visibility: CanasterAssetVisibility;
  daptin: DaptinEntityAccess | null;
  file: {
    table: 'asset';
    column: 'file';
    cloudStoreNamespace?: 'assets';
    keyName?: 'img';
    size?: number | null;
    md5?: string | null;
    path?: string | null;
    src?: string | null;
  } | null;
  urls: {
    assetUrl?: string;
    publicAssetUrl?: string;
  };
};

export type CanasterLoadedAsset = CanasterAssetRecord & {
  objectUrl: string;
};

export type CanvasNodeAssetService = {
  canStoreFiles(): boolean;
  canChooseSavedImages(): boolean;
  loadAssetObject(assetId: string): Promise<CanasterLoadedAsset>;
  loadAssetFile(assetId: string): Promise<File>;
  storeWorkspaceFile(file: File): Promise<CanasterAssetRecord>;
  storeImageFile(file: File): Promise<CanasterLoadedAsset>;
  listImageAssets(): Promise<CanasterAssetRecord[]>;
  setAssetVisibility?(assetId: string, visibility: 'private' | 'public'): Promise<CanasterAssetRecord>;
  releaseAssetObjectUrl(assetId: string): void;
  assetErrorMessage(error: unknown, fallback: string): string;
};

export const unavailableCanvasNodeAssetService: CanvasNodeAssetService = {
  canStoreFiles: () => false,
  canChooseSavedImages: () => false,
  loadAssetObject: () => Promise.reject(new Error('File assets are unavailable in this view.')),
  loadAssetFile: () => Promise.reject(new Error('File assets are unavailable in this view.')),
  storeWorkspaceFile: () => Promise.reject(new Error('File assets are unavailable in this view.')),
  storeImageFile: () => Promise.reject(new Error('File assets are unavailable in this view.')),
  listImageAssets: () => Promise.resolve([]),
  releaseAssetObjectUrl: () => undefined,
  assetErrorMessage(error, fallback) {
    return error instanceof Error ? error.message : fallback;
  },
};
