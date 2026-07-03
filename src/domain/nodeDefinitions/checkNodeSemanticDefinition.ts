import { BuiltInNodeTypes } from '../BuiltInNodeTypes';
import { normalizeChecklistNodeData, type ChecklistNodeData } from '../checklistNodeData';
import type { NodeSemanticDefinition } from './NodeSemanticDefinition';

export const checkNodeSemanticDefinition: NodeSemanticDefinition<ChecklistNodeData> = {
  type: BuiltInNodeTypes.check,
  createDefaultData() {
    return { title: 'Checklist', items: [] };
  },
  parseData(raw) {
    return normalizeChecklistNodeData(raw);
  },
  describe({ data }) {
    const done = data.items.filter((item) => item.checked).length;
    const total = data.items.length;
    return {
      label: data.title || 'Checklist',
      roleDescription: 'Checklist',
      details: [total ? `${done} of ${total} done` : 'No checklist items'],
      state: [],
      actions: [],
    };
  },
};
