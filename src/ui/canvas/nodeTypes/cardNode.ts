import { normalizeCardNodeData, type CardNodeData } from '../../../domain/cardNodeData';
import { defineNodeType } from '../nodeDefinition/defineNodeType';
import { drawAccentMark, drawNodeBodyLines, nodeLayout, wrapText } from '../nodeRendering';
import { nodeTypeSpecs } from '../nodeDefinition/nodeTypeSpecs';
import type { NodeContentRect, NodeDefinition } from '../nodeDefinition/nodeDefinitionTypes';

export const cardNodeDefinition: NodeDefinition<CardNodeData> = defineNodeType({
  ...nodeTypeSpecs.card,
  createDefaultData() {
    return { title: 'Untitled work item', detail: '', accent: 'task' };
  },
  parseData(raw) {
    return normalizeCardNodeData(raw);
  },
  render({ ctx, data, theme, contentRect, state }) {
    const layout = nodeLayout(theme);
    const accent = theme.kind[data.accent];
    drawAccentMark(ctx, contentRect, accent, theme);

    if (state.quality === 'compact' && !state.selected && !state.hovered) return;

    const detailTop = layout.accentHeight + Math.round(layout.labelLineHeight * 0.7);
    const detailRect = {
      x: contentRect.x + layout.insetX,
      y: contentRect.y + detailTop,
      w: contentRect.w - layout.insetX * 2,
      h: Math.max(0, contentRect.h - detailTop),
    };
    const lines = wrapText(ctx, data.detail, Math.max(0, detailRect.w), cardDetailLineCapacity(detailRect, layout.bodyLineHeight));
    drawNodeBodyLines(ctx, detailRect, lines, theme, { x: detailRect.x, y: detailRect.y });
  },
  describe({ data }) {
    return {
      label: data.title || 'Untitled work item',
      roleDescription: 'Work item',
      details: [
        data.detail,
      ].filter(Boolean),
      state: [],
      actions: [],
    };
  },
});

function cardDetailLineCapacity(rect: NodeContentRect, lineHeight: number) {
  return Math.max(0, Math.min(4, Math.floor(rect.h / lineHeight)));
}
