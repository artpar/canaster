import type { NodeData } from '../types';
import { asJsonObject } from './data';
import { clipText, drawTypeBadge, wrapText } from './rendering';
import type { NodeDefinition } from './types';

export const unknownNodeDefinition: NodeDefinition<NodeData> = {
  type: 'unknown',
  displayName: 'Unknown',
  defaultSize: { w: 220, h: 120 },
  minSize: { w: 140, h: 76 },
  createDefaultData() {
    return {};
  },
  parseData(raw) {
    return asJsonObject(raw);
  },
  render({ ctx, node, theme, contentRect }) {
    ctx.fillStyle = theme.headerText;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = '600 14px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText('Unknown node type', contentRect.x + 4, contentRect.y + 4);
    ctx.fillStyle = theme.bodyText;
    ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
    const lines = wrapText(ctx, node.type, Math.max(0, contentRect.w - 8), 2);
    let y = contentRect.y + 28;
    for (const line of lines) {
      ctx.fillText(line, contentRect.x + 4, y);
      y += 15;
    }
    drawTypeBadge(ctx, contentRect, clipText(ctx, 'UNKNOWN', Math.max(0, contentRect.w - 4)), theme);
  },
  describe({ node }) {
    return {
      label: `Unknown node type ${node.type}`,
      roleDescription: 'Unknown node',
      details: [`type ${node.type}`, `size ${Math.round(node.w)}x${Math.round(node.h)}`],
      state: [],
      actions: [],
    };
  },
};
