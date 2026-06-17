import {
  cloneDocumentCollection,
  cloneNode,
  createChildCanvasForNode,
  deleteNodesAndDescendants,
  portalDataForNode,
  selectNodeInCanvas,
  setSelectionForCanvas,
  syncDerivedView,
  syncPortalSummaries,
  updateNodeData,
} from './documentModel';
import { asJsonObject, assertJsonValue } from './nodeTypes/data';
import { nodeDefinitionFor, parseNodeData } from './nodeTypes/registry';
import type { NodeActionDescriptor } from './nodeTypes/types';
import { BuiltInNodeTypes, type CanvasEditSource, type CanvasNode, type CanvasPortalNodeData } from './types';
import type { CanvasDocumentCollection, CanvasDocumentId, DocumentCommand, DocumentModelChange, PortalNode } from './documentTypes';

export type DocumentCommandPlan = {
  collection: CanvasDocumentCollection;
  changes: DocumentModelChange[];
  interaction: string;
};

export function planDocumentCommand(collection: CanvasDocumentCollection, command: DocumentCommand): DocumentCommandPlan {
  switch (command.type) {
    case 'select-canvas':
      return selectCanvas(collection, command.canvasId, command.source);
    case 'enter-child-canvas':
      return enterChildCanvas(collection, command.parentCanvasId, command.portalNodeId, command.source);
    case 'go-to-parent-canvas':
      return goToParentCanvas(collection, command.source);
    case 'activate-neighbor-portal':
      return enterChildCanvas(collection, command.parentCanvasId, command.portalNodeId, command.source);
    case 'focus-portal-preview':
      return focusPortalPreview(collection, command.parentCanvasId, command.portalNodeId, command.source);
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
  if (node.type !== BuiltInNodeTypes.canvas) return cloneNode(node);
  const data = parseNodeData(node) as CanvasPortalNodeData;
  return {
    ...cloneNode(node),
    data: {
      ...data,
      childCanvasId: null,
      nodeCount: 0,
      title: `${data.title || 'Canvas'} copy`,
    },
  };
}

export function selectedPortalNodesWithChildren(collection: CanvasDocumentCollection, canvasId: CanvasDocumentId): PortalNode[] {
  const document = collection.documents[canvasId];
  if (!document) return [];
  const selected = new Set(collection.view.selections[canvasId]?.selectedNodeIds ?? []);
  return document.model.nodes.filter((node): node is PortalNode => {
    if (!selected.has(node.id) || node.type !== BuiltInNodeTypes.canvas) return false;
    const data = parseNodeData(node) as CanvasPortalNodeData;
    return Boolean(data.childCanvasId && collection.documents[data.childCanvasId]);
  });
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
    view: {
      ...collection.view,
      cameras: { ...collection.view.cameras },
      selections: { ...collection.view.selections },
      paneLayouts: { ...collection.view.paneLayouts },
      stackPath: collection.view.stackPath.map((frame) => ({ ...frame })),
      previewFocus: collection.view.previewFocus ? { ...collection.view.previewFocus } : null,
      parentContext: {
        ...collection.view.parentContext,
        shapes: collection.view.parentContext.shapes.map((shape) => ({ ...shape, projectedRect: { ...shape.projectedRect }, node: cloneNode(shape.node) })),
      },
      deleteConfirmation: collection.view.deleteConfirmation
        ? { ...collection.view.deleteConfirmation, nodeIds: [...collection.view.deleteConfirmation.nodeIds] }
        : null,
    },
  };
}

function focusPortalPreview(collection: CanvasDocumentCollection, parentCanvasId: CanvasDocumentId, portalNodeId: string, source: CanvasEditSource): DocumentCommandPlan {
  const parent = collection.documents[parentCanvasId];
  const node = parent?.model.nodes.find((candidate) => candidate.id === portalNodeId);
  const data = node ? portalDataForNode(node) : null;
  if (!parent || !node || !data?.childCanvasId || !collection.documents[data.childCanvasId]) return noChange(collection, 'Preview unavailable');
  const next = cloneDocumentCollection(collection);
  next.view.previewFocus = { parentCanvasId, portalNodeId, childCanvasId: data.childCanvasId };
  return {
    collection: next,
    changes: [{ kind: 'portal-preview-focus', canvasId: parentCanvasId, nodeId: portalNodeId, source }],
    interaction: 'Preview focused',
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
  const definition = nodeDefinitionFor(node);
  const parsed = definition.parseData(asJsonObject(data));
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
