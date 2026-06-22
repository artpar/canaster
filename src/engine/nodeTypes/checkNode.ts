import { BuiltInNodeTypes, type CheckNodeData, type CheckNodeItem, type JsonObject } from '../types';
import { asString } from './data';
import { clipText, drawTypeBadge } from './rendering';
import type { NodeDefinition } from './types';

const MAX_ITEMS = 100;
const CHECKBOX_SIZE = 12;

export const checkNodeDefinition: NodeDefinition<CheckNodeData> = {
  type: BuiltInNodeTypes.check,
  displayName: 'Checklist',
  defaultSize: { w: 280, h: 180 },
  minSize: { w: 180, h: 110 },
  createDefaultData() {
    return { title: 'Checklist', items: [] };
  },
  parseData(raw) {
    return {
      title: asString(raw.title, 'Checklist'),
      items: parseItems(raw.items),
    };
  },
  render({ ctx, data, theme, contentRect, state }) {
    const done = data.items.filter((item) => item.checked).length;
    const total = data.items.length;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = theme.headerText;
    ctx.font = '600 15px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText(clipText(ctx, data.title || 'Checklist', Math.max(0, contentRect.w - 8)), contentRect.x + 4, contentRect.y + 2);

    ctx.fillStyle = theme.mutedText;
    ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(total ? `${done}/${total} done` : 'No checklist items', contentRect.x + 4, contentRect.y + 25);

    if (state.quality === 'compact' && !state.selected && !state.hovered) {
      drawTypeBadge(ctx, contentRect, 'LIST', theme);
      return;
    }

    const rows = visibleRows(contentRect.h);
    const visibleItems = data.items.slice(0, rows);
    let y = contentRect.y + 48;
    for (const item of visibleItems) {
      drawCheckbox(ctx, contentRect.x + 4, y + 1, item.checked, theme);
      ctx.fillStyle = item.checked ? theme.mutedText : theme.bodyText;
      ctx.font = '13px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.fillText(clipText(ctx, item.text || 'Untitled item', Math.max(0, contentRect.w - 28)), contentRect.x + 24, y);
      y += 19;
    }

    if (!visibleItems.length) {
      ctx.fillStyle = theme.bodyText;
      ctx.font = '13px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.fillText('Add first item', contentRect.x + 4, contentRect.y + 50);
    }

    drawTypeBadge(ctx, contentRect, 'LIST', theme);
  },
  describe({ data }) {
    const done = data.items.filter((item) => item.checked).length;
    const total = data.items.length;
    return {
      label: data.title || 'Checklist',
      roleDescription: 'Checklist',
      details: [total ? `${done} of ${total} done` : 'No checklist items'],
      state: [],
      actions: [],
    };
  },
};

function parseItems(value: unknown): CheckNodeItem[] {
  if (!Array.isArray(value)) return [];
  const parsed: CheckNodeItem[] = [];
  for (let index = 0; index < value.length && parsed.length < MAX_ITEMS; index += 1) {
    const item = parseItem(value[index], index);
    if (item) parsed.push(item);
  }
  return parsed;
}

function parseItem(value: unknown, index: number): CheckNodeItem | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as JsonObject;
  const text = typeof raw.text === 'string' ? raw.text : null;
  if (text === null) return null;
  const rawId = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : `item-${index + 1}`;
  return {
    id: rawId,
    text,
    checked: typeof raw.checked === 'boolean' ? raw.checked : false,
  };
}

function visibleRows(height: number) {
  const available = height - 72;
  return Math.max(0, Math.min(5, Math.floor(available / 19)));
}

function drawCheckbox(ctx: CanvasRenderingContext2D, x: number, y: number, checked: boolean, theme: { bodyText: string; mutedText: string; selected: string }) {
  ctx.strokeStyle = checked ? theme.selected : theme.mutedText;
  ctx.lineWidth = 1.4;
  ctx.strokeRect(x, y, CHECKBOX_SIZE, CHECKBOX_SIZE);
  if (!checked) return;
  ctx.beginPath();
  ctx.moveTo(x + 2.5, y + 6.5);
  ctx.lineTo(x + 5.2, y + 9);
  ctx.lineTo(x + 10, y + 3.2);
  ctx.strokeStyle = theme.selected;
  ctx.lineWidth = 1.8;
  ctx.stroke();
}
