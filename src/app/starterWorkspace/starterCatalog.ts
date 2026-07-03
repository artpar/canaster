import { hydrateDocumentCollection } from '../../domain/documentModel';
import type { CanvasDocumentCollection } from '../../domain/documentTypes';
import type { CanvasModel } from '../../domain/types';
import type { StarterCatalogEntry } from './types';

const DEFAULT_STARTER_ID = 'service-business-atlas';
const catalogModules = import.meta.glob<StarterCatalogEntry>('./catalog/*.json', {
  eager: true,
  import: 'default',
});

const entries = Object.values(catalogModules).sort((a, b) => a.title.localeCompare(b.title));

export const starterCatalog: readonly StarterCatalogEntry[] = entries;
export const defaultStarterEntry = defaultStarterFor(starterCatalog);
export const STARTER_WORKSPACE_STORAGE_KEY = defaultStarterEntry.storageKey;

export function starterEntryById(entryId: string): StarterCatalogEntry {
  return starterCatalog.find((entry) => entry.id === entryId) ?? defaultStarterEntry;
}

export function starterCollectionForEntry(entry: StarterCatalogEntry): CanvasDocumentCollection {
  return hydrateDocumentCollection(entry.collection);
}

export function defaultStarterCollection(): CanvasDocumentCollection {
  return starterCollectionForEntry(defaultStarterEntry);
}

export function defaultStarterRootModel(): CanvasModel {
  return defaultStarterCollection().documents[defaultStarterEntry.collection.rootCanvasId].model;
}

function defaultStarterFor(entries: readonly StarterCatalogEntry[]): StarterCatalogEntry {
  const entry = entries.find((candidate) => candidate.id === DEFAULT_STARTER_ID) ?? entries[0];
  if (!entry) throw new Error('Starter catalog must contain at least one entry');
  return entry;
}
