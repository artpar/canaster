import { cloneNodeData } from '../core/nodeData';
import {
  createCanvasPortalNode,
  describeNode,
  isPortalNode,
  portalInfoForNode,
  updatePortalSummaryForNode,
} from './nodeSemantics';
import type { CanvasBackgroundImage } from '../core/canvasAppearance';
import type { CanvasDocument, CanvasDocumentAppearance, CanvasDocumentCollection, CanvasDocumentId, CanvasWorkspaceAppearance, PortalNode, SerializableNestedCanvasViewState, StackFrame } from './documentTypes';
import type { NodePortalInfo } from './nodeSemantics';
import {
  type Camera,
  type CanvasModel,
  type CanvasNode,
  type CanvasSelectionState,
  type NodeData,
} from './types';
import {
  applySerializableViewState,
  cloneViewState,
  createEmptyViewportMemoryState,
  exportSerializableViewState,
  pruneViewStateForDocuments,
} from './viewState';

const DEFAULT_CAMERA: Camera = { x: 0, y: 0, scale: 1 };
const EMPTY_SELECTION: CanvasSelectionState = { selectedNodeIds: [], primarySelectedNodeId: null, resizeMode: false };
const DEFAULT_WORKSPACE_APPEARANCE: CanvasWorkspaceAppearance = { themeId: 'paperWorkbench' };

export function createInitialDocumentCollection(rootModel: CanvasModel, rootTitle: string): CanvasDocumentCollection {
  const rootCanvasId = 'root';
  const collection: CanvasDocumentCollection = {
    schemaVersion: 1,
    rootCanvasId,
    activeCanvasId: rootCanvasId,
    appearance: cloneWorkspaceAppearance(DEFAULT_WORKSPACE_APPEARANCE),
    documents: {
      [rootCanvasId]: {
        id: rootCanvasId,
        title: rootTitle,
        parentCanvasId: null,
        parentNodeId: null,
        model: cloneModel(rootModel),
      },
    },
    view: {
      cameras: { [rootCanvasId]: { ...DEFAULT_CAMERA } },
      selections: { [rootCanvasId]: { ...EMPTY_SELECTION, selectedNodeIds: [] } },
      paneLayouts: {},
      viewportMemory: createEmptyViewportMemoryState(),
      activeCanvasId: rootCanvasId,
      focusedEngineId: rootCanvasId,
      previewFocus: null,
      stackPath: [],
      parentContext: { sourceCanvasId: null, sourcePortalNodeId: null, shapes: [] },
      animationEnabled: true,
      deleteConfirmation: null,
    },
  };
  return syncDerivedView(collection);
}

export function cloneDocumentCollection(collection: CanvasDocumentCollection): CanvasDocumentCollection {
  const documents: Record<CanvasDocumentId, CanvasDocument> = {};
  for (const document of Object.values(collection.documents)) {
    documents[document.id] = {
      ...document,
      appearance: cloneDocumentAppearance(document.appearance),
      model: cloneModel(document.model),
    };
  }
  return {
    ...collection,
    appearance: cloneWorkspaceAppearance(collection.appearance),
    documents,
    view: cloneViewState(collection.view),
  };
}

export function hydrateDocumentCollection(collection: CanvasDocumentCollection): CanvasDocumentCollection {
  return syncPortalSummaries(syncDerivedView(cloneDocumentCollection(collection)));
}

export function canvasDocumentFor(collection: CanvasDocumentCollection, canvasId: CanvasDocumentId): CanvasDocument {
  const document = collection.documents[canvasId];
  if (!document) throw new Error(`Canvas document not found: ${canvasId}`);
  return document;
}

export function activeCanvasDocument(collection: CanvasDocumentCollection): CanvasDocument {
  return canvasDocumentFor(collection, collection.activeCanvasId);
}

export function parentDocumentFor(collection: CanvasDocumentCollection, canvasId: CanvasDocumentId): CanvasDocument | null {
  const document = canvasDocumentFor(collection, canvasId);
  return document.parentCanvasId ? canvasDocumentFor(collection, document.parentCanvasId) : null;
}

export function portalNodeForChild(collection: CanvasDocumentCollection, childCanvasId: CanvasDocumentId): PortalNode | null {
  const child = collection.documents[childCanvasId];
  if (!child?.parentCanvasId || !child.parentNodeId) return null;
  const parent = collection.documents[child.parentCanvasId];
  const node = parent?.model.nodes.find((candidate) => candidate.id === child.parentNodeId);
  return isPortalNode(node) ? cloneNode(node) as PortalNode : null;
}

export function childDocumentForPortal(collection: CanvasDocumentCollection, parentCanvasId: CanvasDocumentId, portalNodeId: string): CanvasDocument | null {
  const parent = canvasDocumentFor(collection, parentCanvasId);
  const node = parent.model.nodes.find((candidate) => candidate.id === portalNodeId);
  const portal = node ? portalInfoForNode(node) : null;
  return portal?.childCanvasId ? collection.documents[portal.childCanvasId] ?? null : null;
}

export function updateCanvasModel(collection: CanvasDocumentCollection, canvasId: CanvasDocumentId, model: CanvasModel): CanvasDocumentCollection {
  if (model.schemaVersion !== 2) throw new Error('Canvas documents only accept schemaVersion 2 models');
  canvasDocumentFor(collection, canvasId);
  const next = cloneDocumentCollection(collection);
  next.documents[canvasId] = { ...next.documents[canvasId], model: cloneModel(model) };
  return syncPortalSummaries(syncDerivedView(next));
}

export function updateNodeData(collection: CanvasDocumentCollection, canvasId: CanvasDocumentId, nodeId: string, data: NodeData): CanvasDocumentCollection {
  const next = cloneDocumentCollection(collection);
  const document = canvasDocumentFor(next, canvasId);
  let found = false;
  document.model = {
    schemaVersion: 2,
    nodes: document.model.nodes.map((node) => {
      if (node.id !== nodeId) return node;
      found = true;
      return { ...node, data: cloneNodeData(data) };
    }),
  };
  if (!found) throw new Error(`Node not found: ${nodeId}`);
  return syncPortalSummaries(syncDerivedView(next));
}

export function setWorkspaceThemeId(collection: CanvasDocumentCollection, themeId: string): CanvasDocumentCollection {
  if (collection.appearance?.themeId === themeId) return collection;
  const next = cloneDocumentCollection(collection);
  next.appearance = { themeId };
  return syncDerivedView(next);
}

export function setCanvasThemeId(collection: CanvasDocumentCollection, canvasId: CanvasDocumentId, themeId: string | null): CanvasDocumentCollection {
  const document = canvasDocumentFor(collection, canvasId);
  const current = document.appearance?.themeId ?? null;
  if (current === themeId) return collection;
  const next = cloneDocumentCollection(collection);
  next.documents[canvasId] = {
    ...next.documents[canvasId],
    appearance: normalizeDocumentAppearance({
      ...next.documents[canvasId].appearance,
      themeId,
    }),
  };
  return syncDerivedView(next);
}

export function setCanvasBackgroundImage(collection: CanvasDocumentCollection, canvasId: CanvasDocumentId, backgroundImage: CanvasBackgroundImage | null): CanvasDocumentCollection {
  const document = canvasDocumentFor(collection, canvasId);
  const nextBackground = cloneCanvasBackgroundImage(backgroundImage);
  if (sameCanvasBackgroundImage(document.appearance?.backgroundImage ?? null, nextBackground)) return collection;
  const next = cloneDocumentCollection(collection);
  next.documents[canvasId] = {
    ...next.documents[canvasId],
    appearance: normalizeDocumentAppearance({
      ...next.documents[canvasId].appearance,
      backgroundImage: nextBackground,
    }),
  };
  return syncDerivedView(next);
}

export function setNodeThemeId(collection: CanvasDocumentCollection, canvasId: CanvasDocumentId, nodeIds: string[], themeId: string | null): CanvasDocumentCollection {
  canvasDocumentFor(collection, canvasId);
  const next = cloneDocumentCollection(collection);
  const document = canvasDocumentFor(next, canvasId);
  const targetIds = new Set(nodeIds);
  if (!targetIds.size) return collection;
  let changed = false;
  const nodes = document.model.nodes.map((node) => {
    if (!targetIds.has(node.id)) return node;
    const current = node.appearance?.themeId ?? null;
    if (current === themeId) return node;
    changed = true;
    return {
      ...node,
      appearance: themeId ? { themeId } : undefined,
      data: cloneNodeData(node.data),
    };
  });
  if (!changed) return collection;
  next.documents[canvasId] = {
    ...next.documents[canvasId],
    model: { schemaVersion: 2, nodes },
  };
  return syncPortalSummaries(syncDerivedView(next));
}

export function documentThemeId(collection: CanvasDocumentCollection): string {
  return cloneWorkspaceAppearance(collection.appearance).themeId;
}

export function canvasThemeId(collection: CanvasDocumentCollection, canvasId: CanvasDocumentId): string {
  const document = collection.documents[canvasId];
  if (document?.appearance?.themeId) return document.appearance.themeId;
  return documentThemeId(collection);
}

export function nodeThemeId(collection: CanvasDocumentCollection, canvasId: CanvasDocumentId, node: CanvasNode): string {
  return node.appearance?.themeId || canvasThemeId(collection, canvasId);
}

export function createChildCanvasForNode(collection: CanvasDocumentCollection, parentCanvasId: CanvasDocumentId, nodeId: string): CanvasDocumentCollection {
  const parent = canvasDocumentFor(collection, parentCanvasId);
  const node = parent.model.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);
  const existingPortal = portalInfoForNode(node);
  if (existingPortal?.childCanvasId && collection.documents[existingPortal.childCanvasId]) return collection;

  const childCanvasId = nextCanvasId(collection);
  const title = descriptionLabel(node);
  const next = cloneDocumentCollection(collection);
  const nextParent = canvasDocumentFor(next, parentCanvasId);
  nextParent.model = {
    schemaVersion: 2,
    nodes: nextParent.model.nodes.map((candidate) =>
      candidate.id === nodeId
        ? createCanvasPortalNode(candidate, { childCanvasId, title, nodeCount: 0 })
        : candidate,
    ),
  };
  next.documents[childCanvasId] = {
    id: childCanvasId,
    title,
    parentCanvasId,
    parentNodeId: nodeId,
    model: { schemaVersion: 2, nodes: [] },
  };
  next.view.cameras[childCanvasId] = { ...DEFAULT_CAMERA };
  next.view.selections[childCanvasId] = { ...EMPTY_SELECTION, selectedNodeIds: [] };
  assertNoCanvasCycle(next);
  return syncPortalSummaries(syncDerivedView(next));
}

export function syncPortalSummaries(collection: CanvasDocumentCollection): CanvasDocumentCollection {
  const next = cloneDocumentCollection(collection);
  for (const document of Object.values(next.documents)) {
    document.model = {
      schemaVersion: 2,
      nodes: document.model.nodes.map((node) => {
        const portal = portalInfoForNode(node);
        if (!portal) return node;
        if (!portal.childCanvasId) return updatePortalSummaryForNode(node, { title: portal.title, nodeCount: 0 });
        const child = next.documents[portal.childCanvasId];
        if (!child) return node;
        return updatePortalSummaryForNode(node, { title: child.title, nodeCount: child.model.nodes.length });
      }),
    };
  }
  return syncDerivedView(next);
}

export function assertNoCanvasCycle(collection: CanvasDocumentCollection): void {
  for (const document of Object.values(collection.documents)) {
    const seen = new Set<CanvasDocumentId>();
    let current: CanvasDocument | undefined = document;
    while (current) {
      if (seen.has(current.id)) throw new Error(`Canvas cycle detected at ${current.id}`);
      seen.add(current.id);
      current = current.parentCanvasId ? collection.documents[current.parentCanvasId] : undefined;
    }
  }
}

export function stackPathFor(collection: CanvasDocumentCollection, activeCanvasId: CanvasDocumentId): StackFrame[] {
  const frames: StackFrame[] = [];
  let current: CanvasDocument | undefined = collection.documents[activeCanvasId];
  let depth = 0;
  while (current) {
    frames.unshift({
      canvasId: current.id,
      parentCanvasId: current.parentCanvasId,
      parentNodeId: current.parentNodeId,
      depth,
    });
    depth += 1;
    current = current.parentCanvasId ? collection.documents[current.parentCanvasId] : undefined;
  }
  return frames.map((frame, index) => ({ ...frame, depth: index }));
}

export function selectionForCanvas(collection: CanvasDocumentCollection, canvasId: CanvasDocumentId): CanvasSelectionState {
  const selection = collection.view.selections[canvasId] ?? EMPTY_SELECTION;
  return { selectedNodeIds: [...selection.selectedNodeIds], primarySelectedNodeId: selection.primarySelectedNodeId, resizeMode: selection.resizeMode };
}

export function cameraForCanvas(collection: CanvasDocumentCollection, canvasId: CanvasDocumentId): Camera {
  return { ...(collection.view.cameras[canvasId] ?? DEFAULT_CAMERA) };
}

export function setCameraForCanvas(collection: CanvasDocumentCollection, canvasId: CanvasDocumentId, camera: Camera): CanvasDocumentCollection {
  const next = cloneDocumentCollection(collection);
  canvasDocumentFor(next, canvasId);
  next.view.cameras[canvasId] = { ...camera };
  return syncDerivedView(next);
}

export function setSelectionForCanvas(collection: CanvasDocumentCollection, canvasId: CanvasDocumentId, selection: CanvasSelectionState): CanvasDocumentCollection {
  const next = cloneDocumentCollection(collection);
  canvasDocumentFor(next, canvasId);
  const ids = new Set(next.documents[canvasId].model.nodes.map((node) => node.id));
  const selectedNodeIds = selection.selectedNodeIds.filter((nodeId) => ids.has(nodeId));
  next.view.selections[canvasId] = {
    selectedNodeIds,
    primarySelectedNodeId: selection.primarySelectedNodeId && selectedNodeIds.includes(selection.primarySelectedNodeId) ? selection.primarySelectedNodeId : (selectedNodeIds[0] ?? null),
    resizeMode: selection.resizeMode && selectedNodeIds.length > 0,
  };
  return syncDerivedView(next);
}

export function selectNodeInCanvas(collection: CanvasDocumentCollection, canvasId: CanvasDocumentId, nodeId: string): CanvasDocumentCollection {
  return setSelectionForCanvas(collection, canvasId, { selectedNodeIds: [nodeId], primarySelectedNodeId: nodeId, resizeMode: false });
}

export function deleteNodesAndDescendants(collection: CanvasDocumentCollection, canvasId: CanvasDocumentId, nodeIds: string[]): CanvasDocumentCollection {
  const deleteSet = new Set(nodeIds);
  const document = canvasDocumentFor(collection, canvasId);
  const descendantIds = new Set<CanvasDocumentId>();
  for (const node of document.model.nodes) {
    if (!deleteSet.has(node.id)) continue;
    const portal = portalInfoForNode(node);
    if (portal?.childCanvasId) collectDescendants(collection, portal.childCanvasId, descendantIds);
  }

  const next = cloneDocumentCollection(collection);
  next.documents[canvasId].model = {
    schemaVersion: 2,
    nodes: next.documents[canvasId].model.nodes.filter((node) => !deleteSet.has(node.id)),
  };
  for (const childId of descendantIds) {
    delete next.documents[childId];
    delete next.view.cameras[childId];
    delete next.view.selections[childId];
    delete next.view.paneLayouts[childId];
  }
  next.view = pruneViewStateForDocuments(next.view, next.documents);
  next.view.deleteConfirmation = null;
  next.view.selections[canvasId] = { ...EMPTY_SELECTION, selectedNodeIds: [] };
  if (!next.documents[next.activeCanvasId]) next.activeCanvasId = canvasId;
  return syncPortalSummaries(syncDerivedView(next));
}

export function portalDataForNode(node: CanvasNode): NodePortalInfo | null {
  return portalInfoForNode(node);
}

export function cloneModel(model: CanvasModel): CanvasModel {
  return { schemaVersion: 2, nodes: model.nodes.map(cloneNode) };
}

export function cloneNode(node: CanvasNode): CanvasNode {
  return {
    ...node,
    appearance: cloneDocumentAppearance(node.appearance),
    data: cloneNodeData(node.data),
  };
}

export function syncDerivedView(collection: CanvasDocumentCollection): CanvasDocumentCollection {
  const activeCanvasId = collection.documents[collection.activeCanvasId] ? collection.activeCanvasId : collection.rootCanvasId;
  const prunedView = pruneViewStateForDocuments(collection.view, collection.documents);
  return {
    ...collection,
    activeCanvasId,
    appearance: cloneWorkspaceAppearance(collection.appearance),
    view: {
      ...prunedView,
      activeCanvasId,
      focusedEngineId: activeCanvasId,
      stackPath: stackPathFor(collection, activeCanvasId),
    },
  };
}

function cloneWorkspaceAppearance(appearance: CanvasWorkspaceAppearance | undefined): CanvasWorkspaceAppearance {
  return {
    themeId: typeof appearance?.themeId === 'string' && appearance.themeId ? appearance.themeId : DEFAULT_WORKSPACE_APPEARANCE.themeId,
  };
}

function cloneDocumentAppearance(appearance: CanvasDocumentAppearance | undefined): CanvasDocumentAppearance | undefined {
  const themeId = typeof appearance?.themeId === 'string' && appearance.themeId ? appearance.themeId : null;
  return normalizeDocumentAppearance({
    themeId,
    backgroundImage: cloneCanvasBackgroundImage(appearance?.backgroundImage ?? null),
  });
}

function normalizeDocumentAppearance(appearance: CanvasDocumentAppearance | undefined): CanvasDocumentAppearance | undefined {
  const themeId = typeof appearance?.themeId === 'string' && appearance.themeId ? appearance.themeId : null;
  const backgroundImage = cloneCanvasBackgroundImage(appearance?.backgroundImage ?? null);
  if (!themeId && !backgroundImage) return undefined;
  return {
    ...(themeId ? { themeId } : {}),
    ...(backgroundImage ? { backgroundImage } : {}),
  };
}

function cloneCanvasBackgroundImage(backgroundImage: CanvasBackgroundImage | null | undefined): CanvasBackgroundImage | null {
  const assetId = typeof backgroundImage?.assetId === 'string' ? backgroundImage.assetId.trim() : '';
  if (!assetId) return null;
  return {
    assetId,
    fit: backgroundImage?.fit === 'contain' || backgroundImage?.fit === 'stretch' ? backgroundImage.fit : 'cover',
    opacity: clampNumber(backgroundImage?.opacity, 0, 1, 1),
    x: finiteNumberOrUndefined(backgroundImage?.x),
    y: finiteNumberOrUndefined(backgroundImage?.y),
    w: positiveNumberOrUndefined(backgroundImage?.w),
    h: positiveNumberOrUndefined(backgroundImage?.h),
  };
}

function sameCanvasBackgroundImage(a: CanvasBackgroundImage | null, b: CanvasBackgroundImage | null): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.assetId === b.assetId && (a.fit ?? 'cover') === (b.fit ?? 'cover') && (a.opacity ?? 1) === (b.opacity ?? 1) && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function finiteNumberOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function positiveNumberOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

export function serializeCollectionViewState(collection: CanvasDocumentCollection): SerializableNestedCanvasViewState {
  return exportSerializableViewState(syncDerivedView(collection).view);
}

export function applySerializedViewState(collection: CanvasDocumentCollection, view: SerializableNestedCanvasViewState): CanvasDocumentCollection {
  const next = cloneDocumentCollection(collection);
  next.view = pruneViewStateForDocuments(applySerializableViewState(next.view, view), next.documents);
  next.activeCanvasId = next.documents[next.view.activeCanvasId] ? next.view.activeCanvasId : next.activeCanvasId;
  return syncDerivedView(next);
}

function collectDescendants(collection: CanvasDocumentCollection, canvasId: CanvasDocumentId, into: Set<CanvasDocumentId>) {
  if (into.has(canvasId)) return;
  const document = collection.documents[canvasId];
  if (!document) return;
  into.add(canvasId);
  for (const child of Object.values(collection.documents)) {
    if (child.parentCanvasId === canvasId) collectDescendants(collection, child.id, into);
  }
}

function nextCanvasId(collection: CanvasDocumentCollection): CanvasDocumentId {
  let counter = Object.keys(collection.documents).length + 1;
  let id = `canvas-${counter}`;
  while (collection.documents[id]) id = `canvas-${++counter}`;
  return id;
}

function descriptionLabel(node: CanvasNode) {
  return describeNode(node).label || 'Canvas';
}
