import { cloneNodeData } from '../../core/nodeData';
import type { CanvasNode, NodeData } from '../../core/nodePrimitives';
import {
  safeDescribeNodeContent,
  safeCreateNodeInteraction,
  safeHitTestNodeContent,
  safeNodeInteractionRegions,
  safeParseNodeData,
  safeRenderNodeContent,
  type DefinitionInteractionContext,
  type DefinitionInteractionRegionContext,
  type DefinitionHitTestContext,
  type DefinitionRenderContext,
} from './nodeDefinition/nodeDefinitionSafety';
import type { NodeAddMenuMetadata, NodeDefinition, NodeDescription, NodeHitTarget, NodeHitTestContext, NodeInteractionController, NodeInteractionRegion, NodePortalInfo, NodePortalSummary, NodeRenderContext } from './nodeDefinition/nodeDefinitionTypes';
import { cardNodeDefinition } from './nodeTypes/cardNode';
import { canvasNodeDefinition } from './nodeTypes/canvasNode';
import { checkNodeDefinition } from './nodeTypes/checkNode';
import { embedNodeDefinition } from './nodeTypes/embedNode';
import { imageNodeDefinition } from './nodeTypes/imageNode';
import { markdownNodeDefinition } from './nodeTypes/markdownNode';
import { pdfNodeDefinition } from './nodeTypes/pdfNode';
import { textNodeDefinition } from './nodeTypes/textNode';
import { unknownNodeDefinition } from './nodeTypes/unknownNode';

const definitions = createRegistry([cardNodeDefinition, textNodeDefinition, imageNodeDefinition, canvasNodeDefinition, checkNodeDefinition, pdfNodeDefinition, markdownNodeDefinition, embedNodeDefinition]);

function createRegistry(items: NodeDefinition[]) {
  const map = new Map<string, NodeDefinition>();
  for (const definition of items) {
    if (!definition.type.trim()) throw new Error('Node type id cannot be empty');
    if (!definition.displayName.trim()) throw new Error(`Node type ${definition.type} must have a display name`);
    if (!definition.roleDescription.trim()) throw new Error(`Node type ${definition.type} must have a role description`);
    if (!definition.typeBadge.trim()) throw new Error(`Node type ${definition.type} must have a type badge`);
    if (!definition.addMenu.label.trim() || !definition.addMenu.detail.trim() || !definition.addMenu.badge.trim()) {
      throw new Error(`Node type ${definition.type} must have add menu metadata`);
    }
    if (map.has(definition.type)) throw new Error(`Duplicate node type: ${definition.type}`);
    map.set(definition.type, definition);
  }
  return map;
}

export function nodeDefinitionFor(node: CanvasNode): NodeDefinition {
  return definitions.get(node.type) ?? unknownNodeDefinition;
}

export function nodeDefinitionForType(type: string): NodeDefinition | null {
  return definitions.get(type) ?? null;
}

export function registeredNodeDefinitions(): NodeDefinition[] {
  return [...definitions.values()];
}

export type RegisteredNodeAddOption = NodeAddMenuMetadata & {
  type: string;
};

export function registeredNodeAddOptions(): RegisteredNodeAddOption[] {
  return registeredNodeDefinitions().map((definition) => ({
    type: definition.type,
    ...definition.addMenu,
  }));
}

export function parseNodeData(node: CanvasNode) {
  return safeParseNodeData(nodeDefinitionFor(node), node);
}

export function renderNodeContent(context: DefinitionRenderContext | (NodeRenderContext & { definition: NodeDefinition })) {
  safeRenderNodeContent(context);
}

export function hitTestNodeContent(context: DefinitionHitTestContext | (NodeHitTestContext & { definition: NodeDefinition })): NodeHitTarget | null {
  return safeHitTestNodeContent(context);
}

export function nodeInteractionRegions(context: DefinitionInteractionRegionContext): NodeInteractionRegion[] {
  return safeNodeInteractionRegions(context);
}

export function createNodeInteraction(context: DefinitionInteractionContext): NodeInteractionController | null {
  return safeCreateNodeInteraction(context);
}

export function describeNode(node: CanvasNode): NodeDescription {
  const definition = nodeDefinitionFor(node);
  const data = safeParseNodeData(definition, node);
  return safeDescribeNodeContent(definition, node, data);
}

export function portalInfoForNode(node: CanvasNode): NodePortalInfo | null {
  const definition = nodeDefinitionFor(node);
  const data = safeParseNodeData(definition, node);
  try {
    return definition.portalInfo?.({ node: node as CanvasNode & { data: NodeData }, data }) ?? null;
  } catch {
    return null;
  }
}

export function isPortalNode(node: CanvasNode | undefined): node is CanvasNode {
  return Boolean(node && portalInfoForNode(node));
}

export function createCanvasPortalData(info: NodePortalInfo): NodeData {
  return canvasNodeDefinition.createPortalData?.(info) ?? canvasNodeDefinition.createDefaultData();
}

export function createCanvasPortalNode(node: CanvasNode, info: NodePortalInfo): CanvasNode {
  return {
    ...node,
    type: canvasNodeDefinition.type,
    data: createCanvasPortalData(info),
  };
}

export function updatePortalSummaryForNode(node: CanvasNode, summary: NodePortalSummary): CanvasNode {
  const definition = nodeDefinitionFor(node);
  const data = safeParseNodeData(definition, node);
  try {
    const nextData = definition.updatePortalSummary?.({ node: node as CanvasNode & { data: NodeData }, data }, summary);
    return nextData && nextData !== data ? { ...node, data: nextData } : node;
  } catch {
    return node;
  }
}

export function stripNodeForPaste(node: CanvasNode): CanvasNode {
  const definition = nodeDefinitionFor(node);
  const data = safeParseNodeData(definition, node);
  try {
    return definition.stripForPaste?.({ node: node as CanvasNode & { data: NodeData }, data }) ?? { ...node, data: cloneNodeData(node.data) };
  } catch {
    return { ...node, data: cloneNodeData(node.data) };
  }
}

export function referencedAssetIdsForNode(node: CanvasNode): string[] {
  const definition = nodeDefinitionFor(node);
  const data = safeParseNodeData(definition, node);
  try {
    return definition.referencedAssetIds?.({ node: node as CanvasNode & { data: NodeData }, data }) ?? [];
  } catch {
    return [];
  }
}
