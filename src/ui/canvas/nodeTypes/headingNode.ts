import {
  HEADING_NODE_LEVELS,
  headingNodeLevelLabel,
  normalizeHeadingNodeData,
  type HeadingNodeData,
} from '../../../domain/headingNodeData';
import { defineNodeType } from '../nodeDefinition/defineNodeType';
import { drawNodeBodyLines, drawNodeMeta, nodeLayout, nodeText, wrapText } from '../nodeRendering';
import { createNodeDetailsEditor } from './createNodeDetailsEditor';
import { nodeContentInteractionRegion } from './nodeContentInteractionRegion';
import { nodeTypeSpecs } from '../nodeDefinition/nodeTypeSpecs';
import type { NodeDefinition } from '../nodeDefinition/nodeDefinitionTypes';

export const headingNodeDefinition: NodeDefinition<HeadingNodeData> = defineNodeType({
  ...nodeTypeSpecs.heading,
  createDefaultData() {
    return { title: 'Heading', subtitle: '', level: 'section' };
  },
  parseData(raw) {
    return normalizeHeadingNodeData(raw);
  },
  render({ ctx, data, theme, contentRect, state }) {
    const layout = nodeLayout(theme);
    const text = nodeText(theme);
    if (state.quality === 'compact' && !state.selected && !state.hovered) return;

    drawNodeMeta(ctx, contentRect, headingNodeLevelLabel(data.level), theme, 0);
    ctx.fillStyle = theme.headerText;
    ctx.font = data.level === 'section' ? text.title : text.titleSmall;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const titleLines = wrapText(ctx, data.title || 'Heading', Math.max(0, contentRect.w - layout.insetX * 2), data.subtitle ? 2 : 3);
    drawNodeBodyLines(ctx, contentRect, titleLines, theme, {
      y: contentRect.y + layout.contentY,
      color: theme.headerText,
      font: data.level === 'section' ? text.title : text.titleSmall,
      lineHeight: layout.bodyLineHeight,
    });
    if (data.subtitle) {
      const subtitleY = contentRect.y + layout.contentY + Math.max(1, titleLines.length) * layout.bodyLineHeight;
      const subtitleLines = wrapText(ctx, data.subtitle, Math.max(0, contentRect.w - layout.insetX * 2), 2);
      drawNodeBodyLines(ctx, contentRect, subtitleLines, theme, { y: subtitleY, color: theme.bodyText });
    }
  },
  describe({ data }) {
    return {
      label: data.title || 'Heading',
      roleDescription: 'Heading',
      details: [headingNodeLevelLabel(data.level), data.subtitle].filter(Boolean),
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
        { id: 'subtitle', label: 'Subtitle', value: ctx.data.subtitle, rows: 2 },
        { id: 'level', label: 'Level', value: ctx.data.level, options: HEADING_NODE_LEVELS.map((value) => ({ value, label: headingNodeLevelLabel(value) })) },
      ],
      commit: (nextData) => ctx.requestCommit(nextData),
      close: ctx.requestClose,
      buildData: (values) => normalizeHeadingNodeData(values),
    });
  },
});
