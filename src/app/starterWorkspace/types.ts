import type { CanvasDocumentCollection } from '../../domain/documentTypes';

export type StarterCatalogEntry = {
  id: string;
  title: string;
  summary: string;
  audience: string;
  tags: string[];
  storageKey: string;
  collection: CanvasDocumentCollection;
};
