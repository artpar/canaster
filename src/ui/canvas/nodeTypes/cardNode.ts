import { asEnum, asString } from '../../../core/nodeData';
import { defineNodeType } from '../nodeDefinition/defineNodeType';
import { createInlineTextarea, createInlineTextInput } from '../inlineEditorDom';
import type { JsonObject } from '../../../core/nodePrimitives';
import { drawAccentMark, drawNodeBodyLines, nodeLayout, wrapText } from '../nodeRendering';
import { nodeTypeSpecs } from '../nodeDefinition/nodeTypeSpecs';
import type { NodeDefinition, NodeContentRect, NodeInteractionRegion } from '../nodeDefinition/nodeDefinitionTypes';
import type { CanvasTheme } from '../theme';

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
  getInteractionRegions({ contentRect, theme }) {
    return cardRegions(contentRect, theme);
  },
  createInteraction(ctx) {
    if (ctx.region.id === 'title') {
      return createInlineTextInput({
        mount: ctx.mount,
        className: 'node-inline-card-title-editor',
        value: ctx.data.title,
        placeholder: 'Work item title',
        ariaLabel: 'Edit work item title',
        commit: (value) => ctx.requestCommit({ ...ctx.data, title: value }, 'pointer'),
        close: ctx.requestClose,
      });
    }
    if (ctx.region.id === 'detail') {
      return createInlineTextarea({
        mount: ctx.mount,
        className: 'node-inline-card-detail-editor',
        value: ctx.data.detail,
        placeholder: 'Work item detail',
        ariaLabel: 'Edit work item detail',
        commit: (value) => ctx.requestCommit({ ...ctx.data, detail: value }, 'pointer'),
        close: ctx.requestClose,
      });
    }
    return null;
  },
});

function cardRegions(contentRect: NodeContentRect, theme: CanvasTheme): NodeInteractionRegion[] {
  const layout = nodeLayout(theme);
  const detailTop = layout.accentHeight + Math.round(layout.labelLineHeight * 0.7);
  return [
    {
      id: 'title',
      rect: { x: contentRect.x + layout.insetX, y: contentRect.y, w: Math.max(0, contentRect.w - layout.insetX * 2), h: layout.titleHeight + Math.round(layout.labelLineHeight * 0.25) },
      cursor: 'text',
      label: 'work item title',
    },
    {
      id: 'detail',
      rect: { x: contentRect.x + layout.insetX, y: contentRect.y + detailTop, w: Math.max(0, contentRect.w - layout.insetX * 2), h: Math.max(layout.rowHeight, contentRect.h - detailTop) },
      cursor: 'text',
      label: 'work item detail',
    },
  ];
}

function cardDetailLineCapacity(rect: NodeContentRect, lineHeight: number) {
  return Math.max(0, Math.min(4, Math.floor(rect.h / lineHeight)));
}
