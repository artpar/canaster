import { BuiltInNodeTypes } from '../BuiltInNodeTypes';
import { normalizeCardNodeData, type CardNodeData } from '../cardNodeData';
import type { NodeSemanticDefinition } from './NodeSemanticDefinition';

export const cardNodeSemanticDefinition: NodeSemanticDefinition<CardNodeData> = {
  type: BuiltInNodeTypes.card,
  createDefaultData() {
    return { title: 'Untitled work item', detail: '', accent: 'task' };
  },
  parseData(raw) {
    return normalizeCardNodeData(raw);
  },
  describe({ data }) {
    return {
      label: data.title || 'Untitled work item',
      roleDescription: 'Work item',
      details: [data.detail].filter(Boolean),
      state: [],
      actions: [],
    };
  },
};
