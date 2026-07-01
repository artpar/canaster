import { dateNodeDateLabel, normalizeDateNodeData, type DateNodeData } from '../../../domain/dateNodeData';
import { defineNodeType } from '../nodeDefinition/defineNodeType';
import { clipText, drawNodeBodyLines, drawNodeMeta, drawNodeTitle, nodeLayout, nodeText, wrapText } from '../nodeRendering';
import { createNodeDetailsEditor } from './createNodeDetailsEditor';
import { nodeContentInteractionRegion } from './nodeContentInteractionRegion';
import { nodeTypeSpecs } from '../nodeDefinition/nodeTypeSpecs';
import type { NodeContentRect, NodeDefinition } from '../nodeDefinition/nodeDefinitionTypes';
import type { CanvasTheme } from '../theme';

export const dateNodeDefinition: NodeDefinition<DateNodeData> = defineNodeType({
  ...nodeTypeSpecs.date,
  createDefaultData() {
    return { title: 'Date', date: '', time: '', place: '', note: '' };
  },
  parseData(raw) {
    return normalizeDateNodeData(raw);
  },
  render({ ctx, data, theme, contentRect, state }) {
    const layout = nodeLayout(theme);
    if (state.quality === 'compact' && !state.selected && !state.hovered) return;

    drawNodeTitle(ctx, contentRect, data.title || 'Date', theme);
    drawDateLine(ctx, contentRect, data, theme);
    drawNodeMeta(ctx, contentRect, [data.time, data.place].filter(Boolean).join(' / ') || 'No time or place', theme, layout.contentY + layout.bodyLineHeight);
    const lines = wrapText(ctx, data.note, Math.max(0, contentRect.w - layout.insetX * 2), 2);
    drawNodeBodyLines(ctx, contentRect, lines, theme, { y: contentRect.y + layout.contentY + layout.bodyLineHeight * 2 });
  },
  describe({ data }) {
    return {
      label: data.title || 'Date',
      roleDescription: 'Date',
      details: [dateNodeDateLabel(data.date), data.time, data.place, data.note].filter(Boolean),
      state: data.date ? [] : ['No date set'],
      actions: [],
    };
  },
  getInteractionRegions({ contentRect }) {
    return nodeContentInteractionRegion(contentRect, 'pointer', 'edit date');
  },
  createInteraction(ctx) {
    if (ctx.region.id !== 'details') return null;
    return createNodeDetailsEditor<DateNodeData>({
      mount: ctx.mount,
      className: 'node-inline-details-editor node-inline-date-editor',
      title: 'Date',
      fields: [
        { id: 'title', label: 'Title', value: ctx.data.title },
        { id: 'date', label: 'Date', value: ctx.data.date, inputMode: 'date' },
        { id: 'time', label: 'Time', value: ctx.data.time, inputMode: 'time' },
        { id: 'place', label: 'Place', value: ctx.data.place },
        { id: 'note', label: 'Note', value: ctx.data.note, rows: 3 },
      ],
      commit: (nextData) => ctx.requestCommit(nextData, 'pointer'),
      close: ctx.requestClose,
      buildData: (values) => normalizeDateNodeData(values),
    });
  },
});

function drawDateLine(ctx: CanvasRenderingContext2D, rect: NodeContentRect, data: DateNodeData, theme: CanvasTheme) {
  const text = nodeText(theme);
  const layout = nodeLayout(theme);
  ctx.font = text.title;
  ctx.fillStyle = data.date ? theme.headerText : theme.mutedText;
  ctx.textBaseline = 'top';
  ctx.fillText(clipText(ctx, dateNodeDateLabel(data.date), Math.max(0, rect.w - layout.insetX * 2)), rect.x + layout.insetX, rect.y + layout.contentY);
}
