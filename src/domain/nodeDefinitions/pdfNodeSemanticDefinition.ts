import { asString } from '../../core/nodeData';
import { cleanAssetTitle } from '../../core/workspaceAssetTypes';
import { BuiltInNodeTypes } from '../BuiltInNodeTypes';
import type { JsonObject } from '../types';
import type { NodeSemanticDefinition } from './NodeSemanticDefinition';

export type PdfNodeData = {
  assetId: string;
  title: string;
  fileName: string;
  mime: string;
} & JsonObject;

export const pdfNodeSemanticDefinition: NodeSemanticDefinition<PdfNodeData> = {
  type: BuiltInNodeTypes.pdf,
  createDefaultData() {
    return { assetId: '', title: 'PDF', fileName: '', mime: 'application/pdf' };
  },
  parseData(raw) {
    const fileName = asString(raw.fileName, '');
    return {
      assetId: asString(raw.assetId, ''),
      title: asString(raw.title, cleanAssetTitle(fileName, 'PDF')),
      fileName,
      mime: asString(raw.mime, 'application/pdf'),
    };
  },
  describe({ data }) {
    return {
      label: data.title || cleanAssetTitle(data.fileName, 'PDF'),
      roleDescription: 'PDF document',
      details: [data.assetId ? data.fileName || 'PDF file' : 'No PDF file'],
      state: [],
      actions: [],
    };
  },
};
