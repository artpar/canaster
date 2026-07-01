import type { NodeContentRect, NodeInteractionRegion } from '../nodeDefinition/nodeDefinitionTypes';

export const PRIMARY_NODE_EDIT_REGION_ID = 'edit';

export function nodeEditInteractionRegion(contentRect: NodeContentRect, cursor: string, label: string): NodeInteractionRegion[] {
  return [{ id: PRIMARY_NODE_EDIT_REGION_ID, rect: { ...contentRect }, cursor, label }];
}

export function nodeContentInteractionRegion(contentRect: NodeContentRect, cursor: string, label: string): NodeInteractionRegion[] {
  return nodeEditInteractionRegion(contentRect, cursor, label);
}
