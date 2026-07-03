import { asNullableString, asNumber, asString } from '../../core/nodeData';
import { BuiltInNodeTypes } from '../BuiltInNodeTypes';
import type { JsonObject } from '../types';
import type { NodePortalInfo, NodeSemanticDefinition } from './NodeSemanticDefinition';

export type CanvasPortalNodeData = {
  childCanvasId: string | null;
  title: string;
  nodeCount: number;
} & JsonObject;

export const canvasNodeSemanticDefinition: NodeSemanticDefinition<CanvasPortalNodeData> = {
  type: BuiltInNodeTypes.canvas,
  createDefaultData() {
    return { childCanvasId: null, title: 'View', nodeCount: 0 };
  },
  parseData(raw) {
    return parseCanvasPortalData(raw);
  },
  describe({ data }) {
    return {
      label: data.title || 'View inside',
      roleDescription: 'View inside',
      details: [data.childCanvasId ? `${data.nodeCount} item${data.nodeCount === 1 ? '' : 's'} inside` : 'No view inside'],
      state: [],
      actions: data.childCanvasId
        ? [
            { id: 'enter-child-canvas', label: 'Open view', available: true },
            { id: 'focus-portal-preview', label: 'Preview here', available: true },
          ]
        : [{ id: 'create-child-canvas', label: 'Add view inside', available: true }],
    };
  },
  portalInfo({ data }) {
    return {
      childCanvasId: data.childCanvasId,
      title: data.title,
      nodeCount: data.nodeCount,
    };
  },
  createPortalData(info) {
    return parseCanvasPortalData(info as unknown as JsonObject);
  },
  updatePortalSummary({ data }, summary) {
    if (data.title === summary.title && data.nodeCount === summary.nodeCount) return data;
    return { ...data, title: summary.title, nodeCount: summary.nodeCount };
  },
  stripForPaste({ node, data }) {
    return {
      ...node,
      data: {
        ...data,
        childCanvasId: null,
        nodeCount: 0,
        title: `${data.title || 'Canvas'} copy`,
      },
    };
  },
};

export function parseCanvasPortalData(raw: JsonObject): NodePortalInfo & JsonObject {
  return {
    childCanvasId: asNullableString(raw.childCanvasId),
    title: asString(raw.title, 'View'),
    nodeCount: Math.max(0, Math.floor(asNumber(raw.nodeCount, 0))),
  };
}
