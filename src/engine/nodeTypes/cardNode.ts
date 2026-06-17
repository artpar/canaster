import { BuiltInNodeTypes, type CardAccent, type CardNodeData } from '../types';
import { asEnum, asString } from './data';
import { clipText, drawTypeBadge, wrapText } from './rendering';
import type { NodeDefinition, NodeContentRect } from './types';

const CARD_ACCENTS: readonly CardAccent[] = ['task', 'data', 'system'];

export const cardNodeDefinition: NodeDefinition<CardNodeData> = {
  type: BuiltInNodeTypes.card,
  displayName: 'Card',
  defaultSize: { w: 256, h: 128 },
  minSize: { w: 140, h: 76 },
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
    ctx.fillStyle = accent;
    roundRectPath(ctx, contentRect.x, contentRect.y, 28, 6, 3);
    ctx.fill();

    if (state.quality === 'compact' && !state.selected && !state.hovered) return;

    ctx.fillStyle = theme.headerText;
    ctx.font = '600 15px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText(clipText(ctx, data.title || 'Untitled card', Math.max(0, contentRect.w - 40)), contentRect.x + 4, contentRect.y + 16);

    ctx.fillStyle = theme.bodyText;
    ctx.font = '13px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    const detailRect = { x: contentRect.x + 4, y: contentRect.y + 44, w: contentRect.w - 8, h: Math.max(0, contentRect.h - 70) };
    const lines = wrapText(ctx, data.detail, Math.max(0, detailRect.w), cardDetailLineCapacity(detailRect));
    let y = detailRect.y;
    for (const line of lines) {
      ctx.fillText(line, detailRect.x, y);
      y += 18;
    }

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
};

function cardDetailLineCapacity(rect: NodeContentRect) {
  const lineHeight = 18;
  const textHeight = 13;
  const available = rect.h - textHeight;
  return Math.max(0, Math.min(2, Math.floor(available / lineHeight) + 1));
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}
