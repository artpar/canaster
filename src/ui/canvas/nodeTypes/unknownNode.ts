import { asJsonObject } from '../../../core/nodeData';
import { defineNodeType } from '../nodeDefinition/defineNodeType';
import type { NodeData } from '../../../core/nodePrimitives';
import { nodeLayout, nodeText, wrapText } from '../nodeRendering';
import { nodeTypeSpecs } from '../nodeDefinition/nodeTypeSpecs';
import type { NodeDefinition } from '../nodeDefinition/nodeDefinitionTypes';

export const unknownNodeDefinition: NodeDefinition<NodeData> = defineNodeType({
  ...nodeTypeSpecs.unknown,
  createDefaultData() {
    return {};
  },
  parseData(raw) {
    return asJsonObject(raw);
  },
  render({ ctx, node, theme, contentRect }) {
    const layout = nodeLayout(theme);
    const text = nodeText(theme);
    ctx.fillStyle = theme.bodyText;
    ctx.font = text.body;
    const lines = wrapText(ctx, node.type, Math.max(0, contentRect.w - layout.insetX * 2), 2);
    let y = contentRect.y + layout.titleY;
    for (const line of lines) {
      ctx.fillText(line, contentRect.x + layout.insetX, y);
      y += layout.bodyLineHeight;
    }
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
});
