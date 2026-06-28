import type { CanvasDocumentCollection, CanvasDocumentId, DocumentCommand } from '../../../domain/documentTypes';
import type { CanvasEditSource, CanvasNode } from '../../../domain/types';
import { describeNode } from '../nodeRegistry';

export function commandForNodeActivation(
  collection: CanvasDocumentCollection,
  canvasId: CanvasDocumentId,
  node: CanvasNode,
  actionId: string,
  source: CanvasEditSource,
): DocumentCommand {
  if (actionId === 'enter-child-canvas') return { type: 'enter-child-canvas', parentCanvasId: canvasId, portalNodeId: node.id, source };
  if (actionId === 'create-child-canvas') return { type: 'create-child-canvas', parentCanvasId: canvasId, nodeId: node.id, source };
  if (actionId === 'focus-portal-preview') return { type: 'focus-portal-preview', parentCanvasId: canvasId, portalNodeId: node.id, source };
  const available = describeNode(node).actions.some((action) => action.id === actionId && action.available);
  return available
    ? { type: 'execute-node-action', canvasId, nodeId: node.id, actionId, source }
    : { type: 'execute-node-action', canvasId: collection.activeCanvasId, nodeId: node.id, actionId, source };
}
