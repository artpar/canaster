import {
    type MutableRefObject,
    useCallback,
    useEffect,
    useMemo,
    useRef
} from 'react';
import {
    cleanAssetTitle,
    isImageAssetMime,
    isSupportedWorkspaceAssetFile,
    workspaceAssetKindForFile
} from '../core/workspaceAssetTypes';
import {workspacePreviewAssetFileName} from '../core/workspacePreviewAssetFileName';
import type {
    CanvasDocumentCollection,
    CanvasWorkspacePreviewImage,
    CanvasWorkspaceSnapshot
} from '../domain/documentTypes';
import {
    BuiltInNodeTypes,
    type NodeData,
    type WorldPoint
} from '../domain/types';
import {
    isLocalAssetId,
    loadLocalAssetFile,
    loadLocalAssetObject,
    releaseLocalAssetObjectUrl,
    releaseLocalAssetObjectUrls,
    saveLocalAsset,
    type LocalAssetSummary,
    type LocalAssetObject
} from '../infra/browser/localAssets';
import {
    loadAssetFile,
    loadAssetObject,
    listImageAssets,
    releaseAssetObjectUrl,
    releaseAssetObjectUrls,
    setAssetVisibility as setDaptinAssetVisibility,
    uploadImageAsset,
    uploadWorkspaceAsset
} from '../infra/daptin/assets';
import {hasUsableStoredToken, normalizeDaptinError} from '../infra/daptin/daptinClient';
import {
    cacheAssetImage,
    clearCachedAssetImage,
    clearCachedAssetImages,
    hasCachedAssetImage
} from './canvas/imageAssets';
import {
    releasePdfCanvasPreviewAsset,
    releasePdfCanvasPreviewCache
} from './canvas/nodeTypes/pdfCanvasPreview';
import type {
    CanasterAssetRecord,
    CanasterLoadedAsset,
    CanvasNodeAssetService
} from './canvas/nodeAssetService';
import type {
    NestedCanvasWorkspaceHandle,
    WorkspaceFileDropRequest
} from './canvas/nested/NestedCanvasWorkspace';
import {
    imageAssetIdsForCollection,
    referencedAssetIdsForCollection
} from '../domain/workspaceAssetReferences';
import type {WorkspacePreviewCapture} from './useWorkspaceExport';
import {
    isRecord,
    stringField
} from './workspaceDocumentWorkflow';
import type {SyncStatusSetter} from './workspaceWorkflowTypes';

type StoredWorkspaceAsset = CanasterAssetRecord;

type FileNodeCreateRequest = {
    nodeType: string;
    data: NodeData;
};

export function useWorkspaceAssets(input: {
    activeDocumentId: string;
    collection: CanvasDocumentCollection;
    setSyncMessage: (message: string) => void;
    setSyncStatus: SyncStatusSetter;
    signedIn: boolean;
    workspaceRef: MutableRefObject<NestedCanvasWorkspaceHandle | null>;
}) {
    const {
        activeDocumentId,
        collection,
        setSyncMessage,
        setSyncStatus,
        signedIn,
        workspaceRef,
    } = input;
    const activeDocumentIdRef = useRef(activeDocumentId);
    const referencedAssetIdsRef = useRef(new Set(referencedAssetIdsForCollection(collection)));
    const signedInRef = useRef(signedIn);
    activeDocumentIdRef.current = activeDocumentId;
    signedInRef.current = signedIn;

    const nodeAssetService = useMemo<CanvasNodeAssetService>(() => {
        const shouldStoreOnline = () => Boolean(activeDocumentIdRef.current && signedInRef.current && hasUsableStoredToken());
        const canChooseSavedImages = () => Boolean(activeDocumentIdRef.current && signedInRef.current && hasUsableStoredToken());
        return {
            canStoreFiles: () => true,
            canChooseSavedImages,
            loadAssetObject: loadWorkspaceAssetObject,
            loadAssetFile: loadWorkspaceAssetFile,
            async storeWorkspaceFile(file) {
                return storeWorkspaceAsset(file, shouldStoreOnline());
            },
            async storeImageFile(file) {
                if (!isImageAssetMime(file.type)) throw new Error('Choose an image file.');
                return storeWorkspaceLoadedAsset(file, shouldStoreOnline());
            },
            async listImageAssets() {
                if (!canChooseSavedImages()) return [];
                return listImageAssets();
            },
            async setAssetVisibility(assetId, visibility) {
                if (isLocalAssetId(assetId)) throw new Error('Save online before changing file visibility.');
                await setDaptinAssetVisibility(assetId, visibility);
                return loadAssetSummary(assetId);
            },
            releaseAssetObjectUrl: releaseWorkspaceAssetObjectUrl,
            assetErrorMessage(error, fallback) {
                const apiError = normalizeDaptinError(error, fallback);
                if (apiError.kind === 'session' || apiError.kind === 'permission') return 'Sign in to use saved files.';
                return error instanceof Error ? error.message : fallback;
            },
        };
    }, []);

    useEffect(() => {
        const assetIds = imageAssetIdsForCollection(collection).filter(
            (assetId) => !hasCachedAssetImage(assetId) && (isLocalAssetId(assetId) || (signedIn && hasUsableStoredToken())));
        if (!assetIds.length) return;
        let canceled = false;
        for (const assetId of assetIds) {
            void loadWorkspaceAssetObject(assetId)
                .then(async (asset) => {
                    try {
                        await cacheAssetImage(asset.id, asset.objectUrl);
                    } finally {
                        releaseWorkspaceAssetObjectUrl(asset.id);
                    }
                })
                .then(() => {
                    if (!canceled) workspaceRef.current?.refreshActiveCanvas();
                })
                .catch(() => undefined);
        }
        return () => {
            canceled = true;
        };
    }, [collection, signedIn, workspaceRef]);

    useEffect(() => {
        const previous = referencedAssetIdsRef.current;
        const next = new Set(referencedAssetIdsForCollection(collection));
        for (const assetId of previous) {
            if (!next.has(assetId)) releaseWorkspaceAssetRuntimeResources(assetId);
        }
        referencedAssetIdsRef.current = next;
    }, [collection]);

    useEffect(() => () => {
        releaseWorkspaceRuntimeResources();
    }, []);

    const handleWorkspaceFileDrop = useCallback(async (request: WorkspaceFileDropRequest) => {
        if (request.canvasId !== (workspaceRef.current?.collection().activeCanvasId ?? collection.activeCanvasId)) return;
        const supportedFiles = request.files.filter(isSupportedWorkspaceAssetFile);
        if (!supportedFiles.length) {
            setSyncStatus((current) => current === 'saving' || current === 'loading' ? current : 'error');
            setSyncMessage('Use image, PDF, or Markdown files.');
            return;
        }
        setSyncMessage(supportedFiles.length > 1 ? `Adding ${supportedFiles.length} files` : 'Adding file');
        try {
            const storeOnline = Boolean(activeDocumentId && signedIn && hasUsableStoredToken());
            for (const [index, file] of supportedFiles.entries()) {
                const asset = isImageAssetMime(file.type)
                    ? await storeWorkspaceLoadedAsset(file, storeOnline)
                    : await storeWorkspaceAsset(file, storeOnline);
                if (isLoadedAsset(asset)) {
                    try {
                        await cacheAssetImage(asset.id, asset.objectUrl);
                    } finally {
                        releaseWorkspaceAssetObjectUrl(asset.id);
                    }
                }
                if (workspaceRef.current?.collection().activeCanvasId !== request.canvasId) {
                    setSyncMessage('File add cancelled because the view changed.');
                    return;
                }
                const node = await nodeCreateRequestForFile(file, asset);
                const at = offsetDropPoint(request.at, index);
                workspaceRef.current?.executeActiveCanvasCommand({
                    type    : 'create-node',
                    nodeType: node.nodeType,
                    source  : 'pointer',
                    at,
                    data    : node.data,
                });
            }
            workspaceRef.current?.refreshActiveCanvas();
        } catch (error) {
            setSyncStatus('error');
            setSyncMessage(error instanceof Error ? error.message : 'Could not add this file.');
        }
    }, [activeDocumentId, collection.activeCanvasId, setSyncMessage, setSyncStatus, signedIn, workspaceRef]);

    return {handleWorkspaceFileDrop, nodeAssetService};
}

export async function storeWorkspaceAsset(file: File, online: boolean): Promise<StoredWorkspaceAsset> {
    if (online) {
        return uploadWorkspaceAsset(file);
    }
    const asset = await saveLocalAsset(file);
    return localAssetRecord(asset);
}

async function storeWorkspaceLoadedAsset(file: File, online: boolean): Promise<CanasterLoadedAsset> {
    const asset = await storeWorkspaceAsset(file, online);
    return loadWorkspaceAssetObject(asset.id);
}

async function loadWorkspaceAssetObject(assetId: string): Promise<CanasterLoadedAsset> {
    return isLocalAssetId(assetId) ? localLoadedAsset(await loadLocalAssetObject(assetId)) : loadAssetObject(assetId);
}

async function loadAssetSummary(assetId: string): Promise<CanasterAssetRecord> {
    const asset = await loadAssetObject(assetId);
    releaseAssetObjectUrl(asset.id);
    const { objectUrl: _objectUrl, ...record } = asset;
    return record;
}

async function loadWorkspaceAssetFile(assetId: string): Promise<File> {
    return isLocalAssetId(assetId) ? loadLocalAssetFile(assetId) : loadAssetFile(assetId);
}

function localAssetRecord(asset: LocalAssetSummary): CanasterAssetRecord {
    const record: CanasterAssetRecord = {
        source: 'local',
        id: asset.id,
        assetId: asset.id,
        name: asset.name,
        mime: asset.mime,
        createdAt: asset.updatedAt,
        updatedAt: asset.updatedAt,
        visibility: 'private',
        daptin: null,
        file: null,
        urls: {},
    };
    return record;
}

function localLoadedAsset(asset: LocalAssetObject): CanasterLoadedAsset {
    return {...localAssetRecord(asset), objectUrl: asset.objectUrl};
}

function isLoadedAsset(asset: CanasterAssetRecord): asset is CanasterLoadedAsset {
    return typeof (asset as { objectUrl?: unknown }).objectUrl === 'string';
}

export function releaseWorkspaceAssetObjectUrl(assetId: string): void {
    if (isLocalAssetId(assetId)) {
        releaseLocalAssetObjectUrl(assetId);
        return;
    }
    releaseAssetObjectUrl(assetId);
}

export function releaseWorkspaceAssetObjectUrls(): void {
    releaseAssetObjectUrls();
    releaseLocalAssetObjectUrls();
}

export function releaseWorkspaceAssetRuntimeResources(assetId: string): void {
    releasePdfCanvasPreviewAsset(assetId);
    clearCachedAssetImage(assetId);
}

export function releaseWorkspaceRuntimeResources(): void {
    releasePdfCanvasPreviewCache();
    clearCachedAssetImages();
    releaseWorkspaceAssetObjectUrls();
}

export async function uploadWorkspacePreviewImage(capture: WorkspacePreviewCapture, documentTitle: string): Promise<CanvasWorkspacePreviewImage> {
    const capturedAt = new Date().toISOString();
    const file = new File([capture.blob], workspacePreviewAssetFileName({
        capturedAt,
        canvasId: capture.canvasId,
        documentTitle,
    }), {type: 'image/png'});
    const asset = await uploadImageAsset(file);
    return {
        assetId   : asset.id,
        mime      : 'image/png',
        width     : capture.width,
        height    : capture.height,
        capturedAt,
        canvasId  : capture.canvasId,
    };
}

async function nodeCreateRequestForFile(file: File, asset: StoredWorkspaceAsset): Promise<FileNodeCreateRequest> {
    const kind = workspaceAssetKindForFile(file);
    const title = cleanAssetTitle(asset.name || file.name, kind === 'pdf' ? 'PDF' : kind === 'markdown' ? 'Markdown' : 'Image');
    if (kind === 'image') {
        return {
            nodeType: BuiltInNodeTypes.image,
            data    : {
                assetId: asset.id,
                alt    : title,
                fit    : 'contain',
                caption: '',
            },
        };
    }
    if (kind === 'pdf') {
        return {
            nodeType: BuiltInNodeTypes.pdf,
            data    : {
                assetId : asset.id,
                title,
                fileName: asset.name || file.name || 'document.pdf',
                mime    : asset.mime || 'application/pdf',
            },
        };
    }
    if (kind === 'markdown') {
        return {
            nodeType: BuiltInNodeTypes.md,
            data    : {
                assetId    : asset.id,
                title,
                fileName   : asset.name || file.name || 'note.md',
                mime       : asset.mime || 'text/markdown',
                markdownText: '',
            },
        };
    }
    throw new Error('Use image, PDF, or Markdown files.');
}

function offsetDropPoint(point: WorldPoint, index: number): WorldPoint {
    const offset = index * 32;
    return { x: point.x + offset, y: point.y + offset };
}

export async function promoteLocalAssetsForOnlineSave(
    snapshot: CanvasWorkspaceSnapshot
): Promise<{ snapshot: CanvasWorkspaceSnapshot; changed: boolean }> {
    const localIds = localAssetIdsInSnapshot(snapshot);
    if (!localIds.length) return { snapshot, changed: false };
    const promotedIds = new Map<string, string>();
    for (const localId of localIds) {
        const file = await loadLocalAssetFile(localId);
        const asset = await uploadWorkspaceAsset(file);
        promotedIds.set(localId, asset.id);
    }
    return {
        snapshot: rewriteSnapshotAssetIds(snapshot, promotedIds),
        changed : promotedIds.size > 0,
    };
}

function localAssetIdsInSnapshot(snapshot: CanvasWorkspaceSnapshot): string[] {
    const ids = new Set<string>();
    for (const collection of collectionsInSnapshot(snapshot)) {
        for (const assetId of referencedAssetIdsForCollection(collection)) {
            if (isLocalAssetId(assetId)) ids.add(assetId);
        }
    }
    return [...ids];
}

function collectionsInSnapshot(snapshot: CanvasWorkspaceSnapshot): CanvasDocumentCollection[] {
    return [
        snapshot.history.present,
        ...snapshot.history.undoStack,
        ...snapshot.history.redoStack,
    ];
}

function rewriteSnapshotAssetIds(snapshot: CanvasWorkspaceSnapshot, promotedIds: Map<string, string>): CanvasWorkspaceSnapshot {
    const next = structuredClone(snapshot) as CanvasWorkspaceSnapshot;
    for (const collection of collectionsInSnapshot(next)) {
        const previewAssetId = collection.appearance?.previewImage?.assetId;
        const promotedPreviewId = previewAssetId ? promotedIds.get(previewAssetId) : null;
        if (promotedPreviewId && collection.appearance?.previewImage) {
            collection.appearance.previewImage = {
                ...collection.appearance.previewImage,
                assetId: promotedPreviewId,
            };
        }
        for (const document of Object.values(collection.documents)) {
            const backgroundAssetId = document.appearance?.backgroundImage?.assetId;
            const promotedBackgroundId = backgroundAssetId ? promotedIds.get(backgroundAssetId) : null;
            if (promotedBackgroundId && document.appearance?.backgroundImage) {
                document.appearance.backgroundImage = {
                    ...document.appearance.backgroundImage,
                    assetId: promotedBackgroundId,
                };
            }
            document.model = {
                ...document.model,
                nodes: document.model.nodes.map((node) => {
                    const assetId = isRecord(node.data) ? stringField(node.data.assetId) : '';
                    const promotedId = promotedIds.get(assetId);
                    return promotedId ? { ...node, data: { ...node.data, assetId: promotedId } } : node;
                }),
            };
        }
    }
    return next;
}
