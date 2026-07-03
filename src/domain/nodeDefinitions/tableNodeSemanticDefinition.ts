import { BuiltInNodeTypes } from '../BuiltInNodeTypes';
import { normalizeTableNodeData, type TableNodeData } from '../tableNodeData';
import type { NodeSemanticDefinition } from './NodeSemanticDefinition';

export const tableNodeSemanticDefinition: NodeSemanticDefinition<TableNodeData> = {
  type: BuiltInNodeTypes.table,
  createDefaultData() {
    return { title: 'Table', columns: ['Item', 'Owner', 'Status'], rows: [] };
  },
  parseData(raw) {
    return normalizeTableNodeData(raw);
  },
  describe({ data }) {
    return {
      label: data.title || 'Table',
      roleDescription: 'Table',
      details: [`${data.columns.length} columns`, `${data.rows.length} rows`],
      state: data.rows.length ? [] : ['No rows'],
      actions: [],
    };
  },
};
