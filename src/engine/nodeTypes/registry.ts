import type { CanvasNode } from '../types';
import { cardNodeDefinition } from './cardNode';
import { canvasNodeDefinition } from './canvasNode';
import { checkNodeDefinition } from './checkNode';
import { imageNodeDefinition } from './imageNode';
import {
  safeDescribeNodeContent,
  safeHitTestNodeContent,
  safeParseNodeData,
  safeRenderNodeContent,
  type DefinitionHitTestContext,
  type DefinitionRenderContext,
} from './safety';
import { textNodeDefinition } from './textNode';
import type { NodeDefinition, NodeDescription, NodeHitTarget, NodeHitTestContext, NodeRenderContext } from './types';
import { unknownNodeDefinition } from './unknownNode';

const definitions = createRegistry([cardNodeDefinition, textNodeDefinition, imageNodeDefinition, canvasNodeDefinition, checkNodeDefinition]);

function createRegistry(items: NodeDefinition[]) {
  const map = new Map<string, NodeDefinition>();
  for (const definition of items) {
    if (!definition.type.trim()) throw new Error('Node type id cannot be empty');
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

export function parseNodeData(node: CanvasNode) {
  return safeParseNodeData(nodeDefinitionFor(node), node);
}

export function renderNodeContent(context: DefinitionRenderContext | (NodeRenderContext & { definition: NodeDefinition })) {
  safeRenderNodeContent(context);
}

export function hitTestNodeContent(context: DefinitionHitTestContext | (NodeHitTestContext & { definition: NodeDefinition })): NodeHitTarget | null {
  return safeHitTestNodeContent(context);
}

export function describeNode(node: CanvasNode): NodeDescription {
  const definition = nodeDefinitionFor(node);
  const data = safeParseNodeData(definition, node);
  return safeDescribeNodeContent(definition, node, data);
}
