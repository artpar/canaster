import { asEnum, asString } from '../../../core/nodeData';
import { defineNodeType } from '../nodeDefinition/defineNodeType';
import { createNodeDetailsEditor } from './createNodeDetailsEditor';
import type { JsonObject } from '../../../core/nodePrimitives';
import { drawAccentMark, drawNodeBodyLines, nodeLayout, wrapText } from '../nodeRendering';
import { nodeEditInteractionRegion } from './nodeContentInteractionRegion';
import { nodeTypeSpecs } from '../nodeDefinition/nodeTypeSpecs';
import type { NodeContentRect, NodeDefinition } from '../nodeDefinition/nodeDefinitionTypes';

type CardAccent = 'task' | 'data' | 'system';
type CardNodeData = {
  title: string;
  detail: string;
  accent: CardAccent;
} & JsonObject;

const CARD_ACCENTS: readonly CardAccent[] = ['task', 'data', 'system'];

export const cardNodeDefinition: NodeDefinition<CardNodeData> = defineNodeType({
  ...nodeTypeSpecs.card,
  createDefaultData() {
    return { title: 'Untitled work item', detail: '', accent: 'task' };
  },
  parseData(raw) {
    return {
      title: asString(raw.title, 'Untitled work item'),
      detail: asString(raw.detail, ''),
      accent: asEnum(raw.accent, CARD_ACCENTS, 'task'),
    };
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
  getInteractionRegions({ contentRect }) {
    return nodeEditInteractionRegion(contentRect, 'pointer', 'edit work item');
  },
  createInteraction(ctx) {
    if (ctx.region.id !== 'edit') return null;
    return createNodeDetailsEditor<CardNodeData>({
      mount: ctx.mount,
      className: 'node-inline-details-editor node-inline-card-editor',
      title: 'Work item',
      fields: [
        { id: 'title', label: 'Title', value: ctx.data.title },
        { id: 'detail', label: 'Detail', value: ctx.data.detail, rows: 4 },
        { id: 'accent', label: 'Type', value: ctx.data.accent, options: CARD_ACCENTS.map((value) => ({ value, label: cardAccentLabel(value) })) },
      ],
      commit: (nextData) => ctx.requestCommit(nextData),
      close: ctx.requestClose,
      buildData: (values) => ({
        title: asString(values.title, 'Untitled work item'),
        detail: asString(values.detail, ''),
        accent: asEnum(values.accent, CARD_ACCENTS, 'task'),
      }),
    });
  },
});

function cardDetailLineCapacity(rect: NodeContentRect, lineHeight: number) {
  return Math.max(0, Math.min(4, Math.floor(rect.h / lineHeight)));
}

function cardAccentLabel(accent: CardAccent) {
  switch (accent) {
    case 'task':
      return 'Task';
    case 'data':
      return 'Data';
    case 'system':
      return 'System';
  }
}
