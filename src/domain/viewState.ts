import { cloneNodeData } from '../core/nodeData';
import type { Camera, CanvasNode, CanvasSelectionState } from './types';
import type {
  CanvasDocument,
  CanvasDocumentId,
  NestedCanvasViewState,
  NestedCanvasViewportMemoryState,
  ParentContextRegion,
  SerializableNestedCanvasViewState,
  ViewportMemory,
  ViewportMemoryKey,
} from './documentTypes';

type ParentContextPaneViewportIdentity = {
  ownerCanvasId: CanvasDocumentId;
  parentCanvasId: CanvasDocumentId;
  sourceNodeId: string;
  region: ParentContextRegion;
};

type EmbeddedPortalViewportIdentity = {
  parentCanvasId: CanvasDocumentId;
  portalNodeId: string;
  childCanvasId: CanvasDocumentId;
};

export function createEmptyViewportMemoryState(): NestedCanvasViewportMemoryState {
  return { schemaVersion: 1, contextPanes: {}, embeddedPortals: {} };
}

export function cloneViewState(view: NestedCanvasViewState): NestedCanvasViewState {
  return {
    ...view,
    cameras: cloneRecord(view.cameras ?? {}),
    selections: cloneSelectionRecord(view.selections ?? {}),
    paneLayouts: cloneRecord(view.paneLayouts ?? {}),
    viewportMemory: cloneViewportMemoryState(view.viewportMemory),
    previewFocus: view.previewFocus ? { ...view.previewFocus } : null,
    stackPath: (view.stackPath ?? []).map((frame) => ({ ...frame })),
    parentContext: {
      ...(view.parentContext ?? { sourceCanvasId: null, sourcePortalNodeId: null, shapes: [] }),
      shapes: (view.parentContext?.shapes ?? []).map((shape) => ({
        ...shape,
        projectedRect: { ...shape.projectedRect },
        node: cloneNode(shape.node),
      })),
    },
    deleteConfirmation: view.deleteConfirmation ? { ...view.deleteConfirmation, nodeIds: [...view.deleteConfirmation.nodeIds] } : null,
  };
}

export function cloneViewportMemoryState(memory?: NestedCanvasViewportMemoryState): NestedCanvasViewportMemoryState {
  if (!memory || memory.schemaVersion !== 1) return createEmptyViewportMemoryState();
  return {
    schemaVersion: 1,
    contextPanes: cloneViewportMemoryRecord(memory.contextPanes ?? {}),
    embeddedPortals: cloneViewportMemoryRecord(memory.embeddedPortals ?? {}),
  };
}

export function parentContextPaneViewportKey(identity: ParentContextPaneViewportIdentity): ViewportMemoryKey {
  return viewportKey('parent-context-pane', [identity.ownerCanvasId, identity.parentCanvasId, identity.sourceNodeId, identity.region]);
}

export function embeddedPortalViewportKey(identity: EmbeddedPortalViewportIdentity): ViewportMemoryKey {
  return viewportKey('embedded-portal', [identity.parentCanvasId, identity.portalNodeId, identity.childCanvasId]);
}

export function contextPaneViewportMemory(
  view: NestedCanvasViewState,
  key: ViewportMemoryKey,
  targetSignature: string,
): ViewportMemory | null {
  const memory = view.viewportMemory?.contextPanes?.[key];
  if (!memory) return null;
  if (memory.targetSignature && memory.targetSignature !== targetSignature) return null;
  return cloneViewportMemory(memory);
}

export function rememberContextPaneViewport(
  view: NestedCanvasViewState,
  key: ViewportMemoryKey,
  camera: Camera,
  targetSignature: string,
  updatedAt = Date.now(),
): NestedCanvasViewState {
  const next = cloneViewState(view);
  next.viewportMemory.contextPanes[key] = {
    camera: { ...camera },
    targetSignature,
    updatedAt,
  };
  return next;
}

export function pruneViewStateForDocuments(
  view: NestedCanvasViewState,
  documents: Record<CanvasDocumentId, CanvasDocument>,
): NestedCanvasViewState {
  const next = cloneViewState(view);
  next.cameras = keepDocumentRecord(next.cameras, documents);
  next.selections = keepDocumentRecord(next.selections, documents);
  next.paneLayouts = keepDocumentRecord(next.paneLayouts, documents);
  next.viewportMemory.contextPanes = Object.fromEntries(
    Object.entries(next.viewportMemory.contextPanes).filter(([key]) => isLiveParentContextPaneKey(key, documents)),
  );
  next.viewportMemory.embeddedPortals = Object.fromEntries(
    Object.entries(next.viewportMemory.embeddedPortals).filter(([key]) => isLiveEmbeddedPortalKey(key, documents)),
  );
  return next;
}

export function exportSerializableViewState(view: NestedCanvasViewState): SerializableNestedCanvasViewState {
  return {
    schemaVersion: 1,
    cameras: cloneRecord(view.cameras ?? {}),
    selections: cloneSelectionRecord(view.selections ?? {}),
    paneLayouts: cloneRecord(view.paneLayouts ?? {}),
    viewportMemory: cloneViewportMemoryState(view.viewportMemory),
    activeCanvasId: view.activeCanvasId,
    focusedEngineId: view.focusedEngineId,
    previewFocus: view.previewFocus ? { ...view.previewFocus } : null,
    animationEnabled: view.animationEnabled,
  };
}

export function applySerializableViewState(
  baseView: NestedCanvasViewState,
  serializableView: SerializableNestedCanvasViewState,
): NestedCanvasViewState {
  return {
    ...cloneViewState(baseView),
    cameras: cloneRecord(serializableView.cameras ?? {}),
    selections: cloneSelectionRecord(serializableView.selections ?? {}),
    paneLayouts: cloneRecord(serializableView.paneLayouts ?? {}),
    viewportMemory: cloneViewportMemoryState(serializableView.viewportMemory),
    activeCanvasId: serializableView.activeCanvasId,
    focusedEngineId: serializableView.focusedEngineId,
    previewFocus: serializableView.previewFocus ? { ...serializableView.previewFocus } : null,
    animationEnabled: serializableView.animationEnabled,
    deleteConfirmation: null,
  };
}

function viewportKey(kind: string, segments: string[]): ViewportMemoryKey {
  return [kind, ...segments.map(encodeURIComponent)].join('/');
}

function parseViewportKey(key: ViewportMemoryKey): { kind: string; segments: string[] } | null {
  const [kind, ...rawSegments] = key.split('/');
  if (!kind || rawSegments.length === 0) return null;
  try {
    return { kind, segments: rawSegments.map(decodeURIComponent) };
  } catch {
    return null;
  }
}

function isLiveParentContextPaneKey(key: ViewportMemoryKey, documents: Record<CanvasDocumentId, CanvasDocument>): boolean {
  const parsed = parseViewportKey(key);
  if (!parsed || parsed.kind !== 'parent-context-pane' || parsed.segments.length !== 4) return false;
  const [ownerCanvasId, parentCanvasId, sourceNodeId] = parsed.segments;
  const owner = documents[ownerCanvasId];
  const parent = documents[parentCanvasId];
  return Boolean(owner && parent?.model.nodes.some((node) => node.id === sourceNodeId));
}

function isLiveEmbeddedPortalKey(key: ViewportMemoryKey, documents: Record<CanvasDocumentId, CanvasDocument>): boolean {
  const parsed = parseViewportKey(key);
  if (!parsed || parsed.kind !== 'embedded-portal' || parsed.segments.length !== 3) return false;
  const [parentCanvasId, portalNodeId, childCanvasId] = parsed.segments;
  const parent = documents[parentCanvasId];
  return Boolean(parent && documents[childCanvasId] && parent.model.nodes.some((node) => node.id === portalNodeId));
}

function cloneViewportMemoryRecord(record: Record<ViewportMemoryKey, ViewportMemory>): Record<ViewportMemoryKey, ViewportMemory> {
  return Object.fromEntries(Object.entries(record).map(([key, memory]) => [key, cloneViewportMemory(memory)]));
}

function cloneViewportMemory(memory: ViewportMemory): ViewportMemory {
  return {
    camera: { ...memory.camera },
    selection: memory.selection ? cloneSelection(memory.selection) : undefined,
    targetSignature: memory.targetSignature,
    updatedAt: memory.updatedAt,
  };
}

function cloneSelectionRecord(record: Record<string, CanvasSelectionState>): Record<string, CanvasSelectionState> {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, cloneSelection(value)]));
}

function cloneSelection(selection: CanvasSelectionState): CanvasSelectionState {
  return {
    selectedNodeIds: [...selection.selectedNodeIds],
    primarySelectedNodeId: selection.primarySelectedNodeId,
    resizeMode: selection.resizeMode,
  };
}

function cloneRecord<T extends object>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, { ...value }]));
}

function keepDocumentRecord<T>(record: Record<string, T>, documents: Record<CanvasDocumentId, CanvasDocument>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([canvasId]) => Boolean(documents[canvasId])));
}

function cloneNode(node: CanvasNode): CanvasNode {
  const themeId = typeof node.appearance?.themeId === 'string' && node.appearance.themeId ? node.appearance.themeId : null;
  return {
    ...node,
    appearance: themeId ? { themeId } : undefined,
    data: cloneNodeData(node.data),
  };
}
