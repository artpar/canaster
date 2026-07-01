import type { NodeContentRect, NodeInteractionRegion } from '../nodeDefinition/nodeDefinitionTypes';

export function nodeContentInteractionRegion(contentRect: NodeContentRect, cursor: string, label: string): NodeInteractionRegion[] {
  return [{ id: 'details', rect: { ...contentRect }, cursor, label }];
}
