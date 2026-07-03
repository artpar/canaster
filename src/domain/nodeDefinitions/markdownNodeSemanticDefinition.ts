import { boundedMarkdownNodeText } from '../../core/boundedMarkdownNodeText';
import { asString } from '../../core/nodeData';
import { cleanAssetTitle } from '../../core/workspaceAssetTypes';
import { BuiltInNodeTypes } from '../BuiltInNodeTypes';
import type { JsonObject } from '../types';
import type { NodeSemanticDefinition } from './NodeSemanticDefinition';

export type MarkdownNodeData = {
  assetId: string;
  title: string;
  fileName: string;
  mime: string;
  markdownText: string;
} & JsonObject;

export const markdownNodeSemanticDefinition: NodeSemanticDefinition<MarkdownNodeData> = {
  type: BuiltInNodeTypes.md,
  createDefaultData() {
    return { assetId: '', title: 'Markdown', fileName: '', mime: 'text/markdown', markdownText: '' };
  },
  parseData(raw) {
    const assetId = asString(raw.assetId, '');
    const fileName = asString(raw.fileName, '');
    return {
      assetId,
      title: asString(raw.title, cleanAssetTitle(fileName, 'Markdown')),
      fileName,
      mime: asString(raw.mime, 'text/markdown'),
      markdownText: assetId ? '' : boundedMarkdownNodeText(asString(raw.markdownText, '')),
    };
  },
  describe({ data }) {
    return {
      label: data.title || cleanAssetTitle(data.fileName, 'Markdown'),
      roleDescription: 'Markdown document',
      details: [data.assetId ? data.fileName || 'Markdown file' : 'No Markdown file'],
      state: [],
      actions: [],
    };
  },
  referencedAssetIds({ data }) {
    return data.assetId ? [data.assetId] : [];
  },
};
