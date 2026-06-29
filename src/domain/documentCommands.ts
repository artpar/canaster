import { assertJsonValue } from '../core/nodeData';
import { arrangeLayoutLabel, arrangeNodeGeometries } from './arrangeLayout';
import {
  cloneDocumentCollection,
  cloneNode,
  createChildCanvasForNode,
  deleteNodesAndDescendants,
  portalDataForNode,
  selectNodeInCanvas,
  setCanvasThemeId,
  setNodeThemeId,
  setSelectionForCanvas,
  setWorkspaceThemeId,
  syncDerivedView,
  syncPortalSummaries,
  updateNodeData,
} from './documentModel';
import {
  normalizeNodeData,
  portalInfoForNode,
  stripNodeForPaste,
} from './nodeSemantics';
import type { CanvasDocumentCollection, CanvasDocumentId, DocumentCommand, DocumentModelChange, PortalNode } from './documentTypes';
import type { NodeActionDescriptor } from './nodeSemantics';
import type { CanvasArrangeLayout, CanvasEditSource, CanvasNode, CanvasSelectionState } from './types';
import { cloneViewState } from './viewState';

export type DocumentCommandPlan = {
  collection: CanvasDocumentCollection;
  changes: DocumentModelChange[];
  interaction: string;
};

export function planDocumentCommand(collection: CanvasDocumentCollection, command: DocumentCommand): DocumentCommandPlan {
  switch (command.type) {
    case 'select-canvas':
      return selectCanvas(collection, command.canvasId, command.source);
    case 'set-document-theme':
      return setDocumentTheme(collection, command.themeId, command.source);
    case 'set-canvas-theme':
      return setCanvasTheme(collection, command.canvasId, command.themeId, command.source);
    case 'set-node-theme':
      return setNodeTheme(collection, command.canvasId, command.nodeIds, command.themeId, command.source);
    case 'enter-child-canvas':
      return enterChildCanvas(collection, command.parentCanvasId, command.portalNodeId, command.source);
    case 'go-to-parent-canvas':
      return goToParentCanvas(collection, command.source);
    case 'activate-neighbor-portal':
      return enterChildCanvas(collection, command.parentCanvasId, command.portalNodeId, command.source);
    case 'focus-portal-preview':
      return focusPortalPreview(collection, command.parentCanvasId, command.portalNodeId, command.source);
    case 'arrange-canvas':
      return arrangeCanvas(collection, command.canvasId, command.layout, command.source);
    case 'create-child-canvas':
    case 'create-canvas-portal':
      return createChildCanvas(collection, command.parentCanvasId, command.nodeId, command.source);
    case 'set-node-data':
      return setNodeData(collection, command.canvasId, command.nodeId, command.to, command.source);
    case 'execute-node-action':
      return executeNodeAction(collection, command.canvasId, command.nodeId, command.actionId, command.source);
    case 'confirm-delete-selection':
      return confirmDeleteSelection(collection, command.canvasId, command.source);
    case 'cancel-delete-confirmation':
      return closeDeleteConfirmation(collection, command.source);
  }
}

export function executeNodeAction(
  collection: CanvasDocumentCollection,
  canvasId: CanvasDocumentId,
  nodeId: string,
  actionId: string,
  source: CanvasEditSource,
): DocumentCommandPlan {
  const document = collection.documents[canvasId];
  const node = document?.model.nodes.find((candidate) => candidate.id === nodeId);
  if (!document || !node) return noChange(collection, 'Action unavailable');
  if (actionId === 'enter-child-canvas') return enterChildCanvas(collection, canvasId, nodeId, source);
  if (actionId === 'create-child-canvas') return createChildCanvas(collection, canvasId, nodeId, source);
  if (actionId === 'focus-portal-preview') return focusPortalPreview(collection, canvasId, nodeId, source);
  return noChange(collection, 'Action unavailable');
}

export function commandForNodeAction(action: NodeActionDescriptor, canvasId: CanvasDocumentId, nodeId: string, source: CanvasEditSource): DocumentCommand {
  return { type: 'execute-node-action', canvasId, nodeId, actionId: action.id, source };
}

export function stripPortalChildReferenceOnPaste(node: CanvasNode): CanvasNode {
  return stripNodeForPaste(cloneNode(node));
}

export function selectedPortalNodesWithChildrenForSelection(
  collection: CanvasDocumentCollection,
  canvasId: CanvasDocumentId,
  selection: CanvasSelectionState,
): PortalNode[] {
  const document = collection.documents[canvasId];
  if (!document) return [];
  const selected = new Set(selection.selectedNodeIds);
  return document.model.nodes.filter((node): node is PortalNode => {
    if (!selected.has(node.id)) return false;
    const portal = portalInfoForNode(node);
    return Boolean(portal?.childCanvasId && collection.documents[portal.childCanvasId]);
  });
}

export function selectedPortalNodesWithChildren(collection: CanvasDocumentCollection, canvasId: CanvasDocumentId): PortalNode[] {
  return selectedPortalNodesWithChildrenForSelection(
    collection,
    canvasId,
    collection.view.selections[canvasId] ?? { selectedNodeIds: [], primarySelectedNodeId: null, resizeMode: false },
  );
}

export function openDeleteConfirmation(collection: CanvasDocumentCollection, canvasId: CanvasDocumentId, nodeIds: string[], source: CanvasEditSource): DocumentCommandPlan {
  const next = cloneDocumentCollection(collection);
  next.view.deleteConfirmation = { canvasId, nodeIds: [...nodeIds] };
  return {
    collection: next,
    changes: [{ kind: 'delete-confirmation-open', canvasId, nodeIds: [...nodeIds], source }],
    interaction: 'Confirm portal delete',
  };
}

function selectCanvas(collection: CanvasDocumentCollection, canvasId: CanvasDocumentId, source: CanvasEditSource): DocumentCommandPlan {
  if (!collection.documents[canvasId]) return noChange(collection, 'Canvas unavailable');
  if (collection.activeCanvasId === canvasId) return noChange(collection, 'Canvas already active');
  const next = cloneCollectionForNavigation(collection);
  const from = next.activeCanvasId;
  next.activeCanvasId = canvasId;
  next.view.activeCanvasId = canvasId;
  next.view.focusedEngineId = canvasId;
  next.view.previewFocus = null;
  next.view.deleteConfirmation = null;
  return {
    collection: syncDerivedView(next),
    changes: [{ kind: 'active-canvas-change', from, to: canvasId, source }],
    interaction: 'Canvas activated',
  };
}

function setDocumentTheme(collection: CanvasDocumentCollection, themeId: string, source: CanvasEditSource): DocumentCommandPlan {
  if (collection.appearance?.themeId === themeId) return noChange(collection, 'Document theme unchanged');
  return {
    collection: setWorkspaceThemeId(collection, themeId),
    changes: [{ kind: 'document-theme-change', themeId, source }],
    interaction: 'Document theme changed',
  };
}

function setCanvasTheme(collection: CanvasDocumentCollection, canvasId: CanvasDocumentId, themeId: string | null, source: CanvasEditSource): DocumentCommandPlan {
  const document = collection.documents[canvasId];
  if (!document) return noChange(collection, 'View unavailable');
  if ((document.appearance?.themeId ?? null) === themeId) return noChange(collection, 'View theme unchanged');
  return {
    collection: setCanvasThemeId(collection, canvasId, themeId),
    changes: [{ kind: 'canvas-theme-change', canvasId, themeId, source }],
    interaction: themeId ? 'View theme changed' : 'View theme inherited',
  };
}

function setNodeTheme(collection: CanvasDocumentCollection, canvasId: CanvasDocumentId, nodeIds: string[], themeId: string | null, source: CanvasEditSource): DocumentCommandPlan {
  const document = collection.documents[canvasId];
  if (!document) return noChange(collection, 'Panel unavailable');
  const existingIds = new Set(document.model.nodes.map((node) => node.id));
  const targetNodeIds = nodeIds.filter((nodeId) => existingIds.has(nodeId));
  if (!targetNodeIds.length) return noChange(collection, 'Panel unavailable');
  if (targetNodeIds.every((nodeId) => {
    const node = document.model.nodes.find((candidate) => candidate.id === nodeId);
    return (node?.appearance?.themeId ?? null) === themeId;
  })) return noChange(collection, 'Panel theme unchanged');
  return {
    collection: setNodeThemeId(collection, canvasId, targetNodeIds, themeId),
    changes: [{ kind: 'node-theme-change', canvasId, nodeIds: targetNodeIds, themeId, source }],
    interaction: themeId ? (targetNodeIds.length > 1 ? 'Panel themes changed' : 'Panel theme changed') : (targetNodeIds.length > 1 ? 'Panel themes inherited' : 'Panel theme inherited'),
  };
}

function enterChildCanvas(collection: CanvasDocumentCollection, parentCanvasId: CanvasDocumentId, portalNodeId: string, source: CanvasEditSource): DocumentCommandPlan {
  const parent = collection.documents[parentCanvasId];
  const node = parent?.model.nodes.find((candidate) => candidate.id === portalNodeId);
  const data = node ? portalDataForNode(node) : null;
  if (!parent || !node || !data?.childCanvasId || !collection.documents[data.childCanvasId]) return noChange(collection, 'Child canvas unavailable');
  const next = cloneCollectionForNavigation(collection);
  const from = next.activeCanvasId;
  next.activeCanvasId = data.childCanvasId;
  next.view.activeCanvasId = data.childCanvasId;
  next.view.focusedEngineId = data.childCanvasId;
  next.view.previewFocus = null;
  next.view.deleteConfirmation = null;
  return {
    collection: syncDerivedView(next),
    changes: [{ kind: 'active-canvas-change', from, to: data.childCanvasId, source }],
    interaction: 'Entered child canvas',
  };
}

function goToParentCanvas(collection: CanvasDocumentCollection, source: CanvasEditSource): DocumentCommandPlan {
  const active = collection.documents[collection.activeCanvasId];
  if (!active?.parentCanvasId || !active.parentNodeId) return noChange(collection, 'No parent canvas');
  const selected = selectNodeInCanvas(collection, active.parentCanvasId, active.parentNodeId);
  const next = cloneCollectionForNavigation(selected);
  const from = next.activeCanvasId;
  next.activeCanvasId = active.parentCanvasId;
  next.view.activeCanvasId = active.parentCanvasId;
  next.view.focusedEngineId = active.parentCanvasId;
  next.view.previewFocus = null;
  next.view.deleteConfirmation = null;
  return {
    collection: syncDerivedView(next),
    changes: [{ kind: 'active-canvas-change', from, to: active.parentCanvasId, source }],
    interaction: 'Returned to parent canvas',
  };
}

function cloneCollectionForNavigation(collection: CanvasDocumentCollection): CanvasDocumentCollection {
  return {
    ...collection,
    documents: collection.documents,
    view: cloneViewState(collection.view),
  };
}

function focusPortalPreview(collection: CanvasDocumentCollection, parentCanvasId: CanvasDocumentId, portalNodeId: string, source: CanvasEditSource): DocumentCommandPlan {
  const parent = collection.documents[parentCanvasId];
  const node = parent?.model.nodes.find((candidate) => candidate.id === portalNodeId);
  const data = node ? portalDataForNode(node) : null;
  if (!parent || !node || !data?.childCanvasId || !collection.documents[data.childCanvasId]) return noChange(collection, 'Child canvas unavailable');
  const next = cloneDocumentCollection(collection);
  next.view.previewFocus = { parentCanvasId, portalNodeId, childCanvasId: data.childCanvasId };
  return {
    collection: next,
    changes: [{ kind: 'portal-preview-focus', canvasId: parentCanvasId, nodeId: portalNodeId, source }],
    interaction: 'Preview focused',
  };
}

function arrangeCanvas(collection: CanvasDocumentCollection, canvasId: CanvasDocumentId, layout: CanvasArrangeLayout, source: CanvasEditSource): DocumentCommandPlan {
  const document = collection.documents[canvasId];
  if (!document) return noChange(collection, 'Canvas unavailable');
  if (document.model.nodes.length < 2) return noChange(collection, document.model.nodes.length ? 'Arrange needs more panels' : 'Arrange no panels');

  const geometries = arrangeNodeGeometries(document.model.nodes, layout, 32);
  const nextNodes = document.model.nodes.map((candidate) => {
    const geometry = geometries.get(candidate.id);
    return geometry ? { ...candidate, ...geometry } : candidate;
  });
  const changedNodeIds = nextNodes
    .filter((candidate, index) => !sameNodeGeometry(candidate, document.model.nodes[index]))
    .map((candidate) => candidate.id);
  if (!changedNodeIds.length) return noChange(collection, 'Arrangement unchanged');

  const next = cloneDocumentCollection(collection);
  next.documents[canvasId] = {
    ...document,
    model: {
      schemaVersion: 2,
      nodes: nextNodes,
    },
  };
  return {
    collection: syncDerivedView(next),
    changes: [{ kind: 'canvas-arrange', canvasId, nodeIds: changedNodeIds, source }],
    interaction: `Arranged canvas as ${arrangeLayoutLabel(layout)}`,
  };
}

function createChildCanvas(collection: CanvasDocumentCollection, parentCanvasId: CanvasDocumentId, nodeId: string, source: CanvasEditSource): DocumentCommandPlan {
  const beforeIds = new Set(Object.keys(collection.documents));
  const next = createChildCanvasForNode(collection, parentCanvasId, nodeId);
  const created = Object.keys(next.documents).find((id) => !beforeIds.has(id));
  if (!created) return noChange(collection, 'Child canvas already exists');
  return {
    collection: next,
    changes: [{ kind: 'canvas-create', canvasId: created, parentCanvasId, parentNodeId: nodeId, source }],
    interaction: 'Child canvas created',
  };
}

function setNodeData(collection: CanvasDocumentCollection, canvasId: CanvasDocumentId, nodeId: string, data: unknown, source: CanvasEditSource): DocumentCommandPlan {
  const document = collection.documents[canvasId];
  const node = document?.model.nodes.find((candidate) => candidate.id === nodeId);
  if (!document || !node) return noChange(collection, 'Node unavailable');
  assertJsonValue(data);
  const parsed = normalizeNodeData(node.type, data);
  return {
    collection: updateNodeData(collection, canvasId, nodeId, parsed),
    changes: [{ kind: 'node-data-change', canvasId, nodeId, source }],
    interaction: 'Node data updated',
  };
}

function confirmDeleteSelection(collection: CanvasDocumentCollection, canvasId: CanvasDocumentId, source: CanvasEditSource): DocumentCommandPlan {
  const confirmation = collection.view.deleteConfirmation;
  if (!confirmation || confirmation.canvasId !== canvasId) return noChange(collection, 'Delete confirmation unavailable');
  const collectionAfterDelete = deleteNodesAndDescendants(collection, canvasId, confirmation.nodeIds);
  const deletedCanvasIds = Object.keys(collection.documents).filter((id) => !collectionAfterDelete.documents[id]);
  return {
    collection: setSelectionForCanvas(collectionAfterDelete, canvasId, { selectedNodeIds: [], primarySelectedNodeId: null, resizeMode: false }),
    changes: [{ kind: 'document-delete', canvasIds: deletedCanvasIds, source }],
    interaction: 'Deleted portal and child canvases',
  };
}

function closeDeleteConfirmation(collection: CanvasDocumentCollection, source: CanvasEditSource): DocumentCommandPlan {
  const next = cloneDocumentCollection(collection);
  next.view.deleteConfirmation = null;
  return {
    collection: next,
    changes: [{ kind: 'delete-confirmation-close', source }],
    interaction: 'Delete canceled',
  };
}

function noChange(collection: CanvasDocumentCollection, interaction: string): DocumentCommandPlan {
  return { collection, changes: [], interaction };
}

function sameNodeGeometry(a: CanvasNode, b: CanvasNode): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}
