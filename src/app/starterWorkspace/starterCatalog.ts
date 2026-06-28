import { hydrateDocumentCollection } from '../../domain/documentModel';
import type { CanvasDocumentCollection } from '../../domain/documentTypes';
import type { CanvasModel } from '../../domain/types';
import serviceBusinessAtlas from './catalog/service-business-atlas.json';
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
