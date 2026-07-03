import {
    type MutableRefObject,
    useCallback,
    useEffect
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
    saveLocalAsset
} from '../infra/browser/localAssets';
import {
    loadAssetObject,
    uploadImageAsset,
    uploadWorkspaceAsset
} from '../infra/daptin/assets';
import {hasUsableStoredToken} from '../infra/daptin/daptinClient';
import {
    cacheAssetImage,
    hasCachedAssetImage
} from './canvas/imageAssets';
import type {
    NestedCanvasWorkspaceHandle,
    WorkspaceFileDropRequest
} from './canvas/nested/NestedCanvasWorkspace';
import {referencedAssetIdsForNode} from './canvas/nodeRegistry';
import type {WorkspacePreviewCapture} from './useWorkspaceExport';
import {
    isRecord,
    stringField
} from './workspaceDocumentWorkflow';

type SyncStatusSetter = (value: SyncStatus | ((current: SyncStatus) => SyncStatus)) => void;

type StoredWorkspaceAsset = {
    id: string;
    name: string;
    mime: string;
    objectUrl: string;
};

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

    useEffect(() => {
        const assetIds = imageAssetIdsInCollection(collection).filter(
            (assetId) => !hasCachedAssetImage(assetId) && (isLocalAssetId(assetId) || (signedIn && hasUsableStoredToken())));
        if (!assetIds.length) return;
        let canceled = false;
        for (const assetId of assetIds) {
            const loadObject = isLocalAssetId(assetId) ? loadLocalAssetObject(assetId) : loadAssetObject(assetId);
            void loadObject
                .then((asset) => cacheAssetImage(asset.id, asset.objectUrl))
                .then(() => {
                    if (!canceled) workspaceRef.current?.refreshActiveCanvas();
                })
                .catch(() => undefined);
        }
        return () => {
            canceled = true;
        };
    }, [collection, signedIn, workspaceRef]);

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
                const asset = await storeWorkspaceAsset(file, storeOnline);
                if (isImageAssetMime(asset.mime)) await cacheAssetImage(asset.id, asset.objectUrl);
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

    return {handleWorkspaceFileDrop};
}

export async function storeWorkspaceAsset(file: File, online: boolean): Promise<StoredWorkspaceAsset> {
    if (online) {
        const asset = await uploadWorkspaceAsset(file);
        return loadAssetObject(asset.id);
    }
    const asset = await saveLocalAsset(file);
    return loadLocalAssetObject(asset.id);
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

function imageAssetIdsInCollection(collection: CanvasDocumentCollection): string[] {
    const ids = new Set<string>();
    for (const document of Object.values(collection.documents)) {
        const backgroundAssetId = document.appearance?.backgroundImage?.assetId;
        if (backgroundAssetId) ids.add(backgroundAssetId);
        for (const node of document.model.nodes) {
            if (node.type !== BuiltInNodeTypes.image) continue;
            for (const assetId of referencedAssetIdsForNode(node)) ids.add(assetId);
        }
    }
    return [...ids];
}

function assetIdsInCollection(collection: CanvasDocumentCollection): string[] {
    const ids = new Set<string>();
    const previewAssetId = collection.appearance?.previewImage?.assetId;
    if (previewAssetId) ids.add(previewAssetId);
    for (const document of Object.values(collection.documents)) {
        const backgroundAssetId = document.appearance?.backgroundImage?.assetId;
        if (backgroundAssetId) ids.add(backgroundAssetId);
        for (const node of document.model.nodes) {
            for (const assetId of referencedAssetIdsForNode(node)) ids.add(assetId);
        }
    }
    return [...ids];
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
        for (const assetId of assetIdsInCollection(collection)) {
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
