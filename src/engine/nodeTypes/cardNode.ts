import { asEnum, asString } from './data';
import { defineNodeType } from './define';
import { createInlineTextarea, createInlineTextInput } from './inlineEditorDom';
import type { JsonObject } from './primitives';
import { drawAccentMark, drawCompactNode, drawNodeBodyLines, drawNodeTitle, drawTypeBadge, nodeLayout, wrapText } from './rendering';
import { nodeTypeSpecs } from './specs';
import type { NodeDefinition, NodeContentRect, NodeInteractionRegion } from './types';

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
    return { title: 'Untitled card', detail: '', accent: 'task' };
  },
  parseData(raw) {
    return {
      title: asString(raw.title, 'Untitled card'),
      detail: asString(raw.detail, ''),
      accent: asEnum(raw.accent, CARD_ACCENTS, 'task'),
    };
  },
  render({ ctx, data, theme, contentRect, state }) {
    const accent = theme.kind[data.accent];
    drawAccentMark(ctx, contentRect, accent);

    if (state.quality === 'compact' && !state.selected && !state.hovered) {
      drawCompactNode(ctx, { ...contentRect, y: contentRect.y + 14, h: Math.max(0, contentRect.h - 14) }, data.accent.toUpperCase(), data.title || 'Untitled work item', theme);
      return;
    }

    drawNodeTitle(ctx, contentRect, data.title || 'Untitled work item', theme, 16);

    const detailRect = { x: contentRect.x + 4, y: contentRect.y + 44, w: contentRect.w - 8, h: Math.max(0, contentRect.h - 70) };
    const lines = wrapText(ctx, data.detail, Math.max(0, detailRect.w), cardDetailLineCapacity(detailRect));
    drawNodeBodyLines(ctx, detailRect, lines, theme, { x: detailRect.x, y: detailRect.y });

    drawTypeBadge(ctx, contentRect, data.accent.toUpperCase(), theme);
  },
  describe({ data }) {
    return {
      label: data.title || 'Untitled card',
      roleDescription: 'Work item',
      details: [
        data.detail,
      ].filter(Boolean),
      state: [],
      actions: [],
    };
  },
  getInteractionRegions({ contentRect }) {
    return cardRegions(contentRect);
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

function cardRegions(contentRect: NodeContentRect): NodeInteractionRegion[] {
  return [
    {
      id: 'title',
      rect: { x: contentRect.x + nodeLayout.insetX, y: contentRect.y + 14, w: Math.max(0, contentRect.w - nodeLayout.insetX * 2), h: 22 },
      cursor: 'text',
      label: 'work item title',
    },
    {
      id: 'detail',
      rect: { x: contentRect.x + nodeLayout.insetX, y: contentRect.y + 42, w: Math.max(0, contentRect.w - nodeLayout.insetX * 2), h: Math.max(22, contentRect.h - 62) },
      cursor: 'text',
      label: 'work item detail',
    },
  ];
}

function cardDetailLineCapacity(rect: NodeContentRect) {
  const lineHeight = 18;
  const textHeight = 13;
  const available = rect.h - textHeight;
  return Math.max(0, Math.min(2, Math.floor(available / lineHeight) + 1));
}
