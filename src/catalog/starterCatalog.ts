import { hydrateDocumentCollection } from '../engine/documentModel';
import type { CanvasDocumentCollection } from '../engine/documentTypes';
import type { CanvasModel } from '../engine/types';
import serviceBusinessAtlas from './service-business-atlas.json';
import type { StarterCatalogEntry } from './types';

const entries = [serviceBusinessAtlas as unknown as StarterCatalogEntry] as const;

export const starterCatalog: readonly StarterCatalogEntry[] = entries;
export const defaultStarterEntry = entries[0];
export const STARTER_WORKSPACE_STORAGE_KEY = defaultStarterEntry.storageKey;

export function defaultStarterCollection(): CanvasDocumentCollection {
  return hydrateDocumentCollection(defaultStarterEntry.collection);
}

export function defaultStarterRootModel(): CanvasModel {
  return defaultStarterCollection().documents[defaultStarterEntry.collection.rootCanvasId].model;
}
