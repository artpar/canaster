import type { CanvasDocumentCollection, CanvasWorkspaceSnapshot } from './documentTypes';
import { BuiltInNodeTypes } from './BuiltInNodeTypes';
import { referencedAssetIdsForSemanticNode } from './nodeDefinitions/nodeSemanticRegistry';

export function referencedAssetIdsForCollection(collection: CanvasDocumentCollection): string[] {
  const ids = new Set<string>();
  const previewAssetId = collection.appearance?.previewImage?.assetId;
  if (previewAssetId) ids.add(previewAssetId);
  for (const document of Object.values(collection.documents)) {
    const backgroundAssetId = document.appearance?.backgroundImage?.assetId;
    if (backgroundAssetId) ids.add(backgroundAssetId);
    for (const node of document.model.nodes) {
      for (const assetId of referencedAssetIdsForSemanticNode(node)) ids.add(assetId);
    }
  }
  return [...ids];
}

export function imageAssetIdsForCollection(collection: CanvasDocumentCollection): string[] {
  const ids = new Set<string>();
  for (const document of Object.values(collection.documents)) {
    const backgroundAssetId = document.appearance?.backgroundImage?.assetId;
    if (backgroundAssetId) ids.add(backgroundAssetId);
    for (const node of document.model.nodes) {
      if (node.type !== BuiltInNodeTypes.image) continue;
      for (const assetId of referencedAssetIdsForSemanticNode(node)) ids.add(assetId);
    }
  }
  return [...ids];
}

export function referencedAssetIdsForSnapshot(snapshot: CanvasWorkspaceSnapshot): string[] {
  const ids = new Set<string>();
  for (const collection of [
    snapshot.history.present,
    ...snapshot.history.undoStack,
    ...snapshot.history.redoStack,
  ]) {
    for (const assetId of referencedAssetIdsForCollection(collection)) ids.add(assetId);
  }
  return [...ids];
}
