import { asJsonObject } from '../core/nodeData';
import { BuiltInNodeTypes } from './BuiltInNodeTypes';
import {
  describeSemanticNode,
  portalInfoForSemanticNode,
  semanticDefinitionForType,
  stripSemanticNodeForPaste,
  updateSemanticPortalSummary,
} from './nodeDefinitions/nodeSemanticRegistry';
import type { CanvasNode, NodeData } from './types';
import type { NodeDescription, NodePortalInfo, NodePortalSummary } from './nodeDefinitions/NodeSemanticDefinition';

export type { NodeActionDescriptor, NodeDescription, NodePortalInfo, NodePortalSummary } from './nodeDefinitions/NodeSemanticDefinition';

export function normalizeNodeData(nodeType: string, raw: unknown): NodeData {
  const data = asJsonObject(raw);
  return semanticDefinitionForType(nodeType)?.parseData(data) ?? data;
}

export function describeNode(node: CanvasNode): NodeDescription {
  return describeSemanticNode(node);
}

export function portalInfoForNode(node: CanvasNode): NodePortalInfo | null {
  return portalInfoForSemanticNode(node);
}

export function isPortalNode(node: CanvasNode | undefined): node is CanvasNode {
  return Boolean(node && portalInfoForNode(node));
}

export function createCanvasPortalNode(node: CanvasNode, info: NodePortalInfo): CanvasNode {
  return {
    ...node,
    type: BuiltInNodeTypes.canvas,
    data: createCanvasPortalData(info),
  };
}

export function createCanvasPortalData(info: NodePortalInfo): NodeData {
  return semanticDefinitionForType(BuiltInNodeTypes.canvas)?.createPortalData?.(info) ?? { ...info };
}

export function updatePortalSummaryForNode(node: CanvasNode, summary: NodePortalSummary): CanvasNode {
  return updateSemanticPortalSummary(node, summary);
}

export function stripNodeForPaste(node: CanvasNode): CanvasNode {
  return stripSemanticNodeForPaste(node);
}
