import type { CanvasNode, NodeData } from '../types';
import { asJsonObject } from './data';
import { unknownNodeDefinition } from './unknownNode';
import type {
  NodeDefinition,
  NodeDescription,
  NodeHitTarget,
  NodeHitTestContext,
  NodeInteractionContext,
  NodeInteractionController,
  NodeInteractionRegion,
  NodeInteractionRegionContext,
  NodeRenderContext,
} from './types';

export type DefinitionRenderContext = Omit<NodeRenderContext, 'data'> & {
  definition: NodeDefinition;
  data: NodeData;
};

export type DefinitionHitTestContext = Omit<NodeHitTestContext, 'data'> & {
  definition: NodeDefinition;
  data: NodeData;
};

export type DefinitionInteractionRegionContext = Omit<NodeInteractionRegionContext, 'data'> & {
  definition: NodeDefinition;
  data: NodeData;
};

export type DefinitionInteractionContext = Omit<NodeInteractionContext, 'data'> & {
  definition: NodeDefinition;
  data: NodeData;
};

export function safeParseNodeData(definition: NodeDefinition, node: CanvasNode): NodeData {
  const raw = asJsonObject((node as CanvasNode & { data?: unknown }).data);
  try {
    return definition.parseData(raw);
  } catch {
    try {
      return definition.createDefaultData();
    } catch {
      return unknownNodeDefinition.createDefaultData();
    }
  }
}

export function safeRenderNodeContent(context: DefinitionRenderContext) {
  const node = context.node as CanvasNode & { data: NodeData };
  try {
    context.definition.render({ ...context, node });
  } catch {
    unknownNodeDefinition.render({ ...context, node, data: unknownNodeDefinition.createDefaultData() });
  }
}

export function safeHitTestNodeContent(context: DefinitionHitTestContext): NodeHitTarget | null {
  const node = context.node as CanvasNode & { data: NodeData };
  try {
    return context.definition.hitTest?.({ ...context, node }) ?? { type: 'body' };
  } catch {
    return { type: 'body' };
  }
}

export function safeNodeInteractionRegions(context: DefinitionInteractionRegionContext): NodeInteractionRegion[] {
  const node = context.node as CanvasNode & { data: NodeData };
  try {
    return context.definition.getInteractionRegions?.({ ...context, node }) ?? [];
  } catch {
    return [];
  }
}

export function safeCreateNodeInteraction(context: DefinitionInteractionContext): NodeInteractionController | null {
  const node = context.node as CanvasNode & { data: NodeData };
  try {
    return context.definition.createInteraction?.({ ...context, node }) ?? null;
  } catch {
    return null;
  }
}

export function safeDescribeNodeContent(definition: NodeDefinition, node: CanvasNode, data: NodeData): NodeDescription {
  try {
    return definition.describe({ node: node as CanvasNode & { data: NodeData }, data });
  } catch {
    return unknownNodeDefinition.describe({ node: node as CanvasNode & { data: NodeData }, data: unknownNodeDefinition.createDefaultData() });
  }
}
