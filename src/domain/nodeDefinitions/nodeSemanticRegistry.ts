import { asJsonObject, cloneNodeData } from '../../core/nodeData';
import { canvasNodeSemanticDefinition } from './canvasNodeSemanticDefinition';
import { checkNodeSemanticDefinition } from './checkNodeSemanticDefinition';
import { embedNodeSemanticDefinition } from './embedNodeSemanticDefinition';
import { imageNodeSemanticDefinition } from './imageNodeSemanticDefinition';
import { markdownNodeSemanticDefinition } from './markdownNodeSemanticDefinition';
import type { CanvasNode, NodeData } from '../types';
import type { NodeDescription, NodePortalInfo, NodePortalSummary, NodeSemanticDefinition } from './NodeSemanticDefinition';
import { pdfNodeSemanticDefinition } from './pdfNodeSemanticDefinition';
import { tableNodeSemanticDefinition } from './tableNodeSemanticDefinition';
import { textNodeSemanticDefinition } from './textNodeSemanticDefinition';
import { unknownNodeSemanticDefinition } from './unknownNodeSemanticDefinition';

const nodeSemanticDefinitions = createRegistry([
  textNodeSemanticDefinition,
  tableNodeSemanticDefinition,
  imageNodeSemanticDefinition,
  canvasNodeSemanticDefinition,
  checkNodeSemanticDefinition,
  pdfNodeSemanticDefinition,
  markdownNodeSemanticDefinition,
  embedNodeSemanticDefinition,
]);

export function semanticDefinitionForNode(node: CanvasNode): NodeSemanticDefinition {
  return semanticDefinitionForType(node.type) ?? unknownNodeSemanticDefinition;
}

export function semanticDefinitionForType(type: string): NodeSemanticDefinition | null {
  return nodeSemanticDefinitions.get(type) ?? null;
}

export function registeredSemanticDefinitions(): NodeSemanticDefinition[] {
  return [...nodeSemanticDefinitions.values()];
}

export function parseSemanticNodeData(node: CanvasNode): NodeData {
  return safeParseSemanticData(semanticDefinitionForNode(node), node);
}

export function describeSemanticNode(node: CanvasNode): NodeDescription {
  const definition = semanticDefinitionForNode(node);
  const data = safeParseSemanticData(definition, node);
  try {
    return definition.describe({ node: node as CanvasNode & { data: NodeData }, data });
  } catch {
    return unknownNodeSemanticDefinition.describe({ node: node as CanvasNode & { data: NodeData }, data: unknownNodeSemanticDefinition.createDefaultData() });
  }
}

export function portalInfoForSemanticNode(node: CanvasNode): NodePortalInfo | null {
  const definition = semanticDefinitionForNode(node);
  const data = safeParseSemanticData(definition, node);
  try {
    return definition.portalInfo?.({ node: node as CanvasNode & { data: NodeData }, data }) ?? null;
  } catch {
    return null;
  }
}

export function updateSemanticPortalSummary(node: CanvasNode, summary: NodePortalSummary): CanvasNode {
  const definition = semanticDefinitionForNode(node);
  const data = safeParseSemanticData(definition, node);
  try {
    const nextData = definition.updatePortalSummary?.({ node: node as CanvasNode & { data: NodeData }, data }, summary);
    return nextData && nextData !== data ? { ...node, data: nextData } : node;
  } catch {
    return node;
  }
}

export function stripSemanticNodeForPaste(node: CanvasNode): CanvasNode {
  const definition = semanticDefinitionForNode(node);
  if (!definition.stripForPaste) return { ...node, data: cloneNodeData(node.data) };
  const data = safeParseSemanticData(definition, node);
  try {
    return definition.stripForPaste({ node: node as CanvasNode & { data: NodeData }, data });
  } catch {
    return { ...node, data: cloneNodeData(node.data) };
  }
}

function createRegistry(items: NodeSemanticDefinition[]) {
  const map = new Map<string, NodeSemanticDefinition>();
  for (const definition of items) {
    if (!definition.type.trim()) throw new Error('Node semantic type id cannot be empty');
    if (map.has(definition.type)) throw new Error(`Duplicate node semantic type: ${definition.type}`);
    map.set(definition.type, definition);
  }
  return map;
}

function safeParseSemanticData(definition: NodeSemanticDefinition, node: CanvasNode): NodeData {
  const raw = asJsonObject((node as CanvasNode & { data?: unknown }).data);
  try {
    return definition.parseData(raw);
  } catch {
    try {
      return definition.createDefaultData();
    } catch {
      return unknownNodeSemanticDefinition.createDefaultData();
    }
  }
}
