import { asJsonObject } from '../../core/nodeData';
import type { NodeData } from '../types';
import type { NodeSemanticDefinition } from './NodeSemanticDefinition';

export const unknownNodeSemanticDefinition: NodeSemanticDefinition<NodeData> = {
  type: 'unknown',
  createDefaultData() {
    return {};
  },
  parseData(raw) {
    return asJsonObject(raw);
  },
  describe({ node }) {
    return {
      label: `Unknown item type ${node.type}`,
      roleDescription: 'Unknown item',
      details: [`Type ${node.type}`],
      state: [],
      actions: [],
    };
  },
};
