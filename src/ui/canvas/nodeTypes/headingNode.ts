import { normalizeHeadingNodeData, type HeadingNodeData } from '../../../domain/headingNodeData';
import { defineNodeType } from '../nodeDefinition/defineNodeType';
import { nodeLayout, nodeText, wrapText } from '../nodeRendering';
import { createNodeDetailsEditor } from './createNodeDetailsEditor';
import { nodeContentInteractionRegion } from './nodeContentInteractionRegion';
import { nodeTypeSpecs } from '../nodeDefinition/nodeTypeSpecs';
import type { NodeDefinition } from '../nodeDefinition/nodeDefinitionTypes';

export const headingNodeDefinition: NodeDefinition<HeadingNodeData> = defineNodeType({
  ...nodeTypeSpecs.heading,
  createDefaultData() {
    return { title: 'Heading' };
  },
  parseData(raw) {
    return normalizeHeadingNodeData(raw);
  },
  render({ ctx, data, theme, contentRect, state }) {
    const layout = nodeLayout(theme);
    const text = nodeText(theme);
    if (state.quality === 'compact' && !state.selected && !state.hovered) return;

    ctx.fillStyle = theme.headerText;
    ctx.font = text.title;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const titleLines = wrapText(ctx, data.title || 'Heading', Math.max(0, contentRect.w - layout.insetX * 2), 4);
    const lineHeight = layout.bodyLineHeight;
    const startY = contentRect.y + contentRect.h / 2 - Math.max(0, titleLines.length - 1) * lineHeight / 2;
    for (const [index, line] of titleLines.entries()) {
      ctx.fillText(line, contentRect.x + contentRect.w / 2, startY + index * lineHeight);
    }
  },
  describe({ data }) {
    return {
      label: data.title || 'Heading',
      roleDescription: 'Heading',
      details: [],
      state: [],
      actions: [],
    };
  },
  getInteractionRegions({ contentRect }) {
    return nodeContentInteractionRegion(contentRect, 'text', 'edit heading');
  },
  createInteraction(ctx) {
    if (ctx.region.id !== 'edit') return null;
    return createNodeDetailsEditor<HeadingNodeData>({
      mount: ctx.mount,
      className: 'node-inline-details-editor node-inline-heading-editor',
      title: 'Heading',
      fields: [
        { id: 'title', label: 'Title', value: ctx.data.title },
      ],
      commit: (nextData) => ctx.requestCommit(nextData),
      close: ctx.requestClose,
      buildData: (values) => normalizeHeadingNodeData(values),
    });
  },
});
