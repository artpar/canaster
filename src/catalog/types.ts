import type { CanvasDocumentCollection } from '../engine/documentTypes';

export type StarterCatalogEntry = {
  id: string;
  title: string;
  summary: string;
  audience: string;
  tags: string[];
  storageKey: string;
  collection: CanvasDocumentCollection;
};
