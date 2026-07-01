import { normalizeChecklistNodeData, type ChecklistNodeData } from '../../../domain/checklistNodeData';
import { defineNodeType } from '../nodeDefinition/defineNodeType';
import { clipText, drawNodeMeta, nodeLayout, nodeText } from '../nodeRendering';
import { nodeTypeSpecs } from '../nodeDefinition/nodeTypeSpecs';
import type { NodeContentRect, NodeDefinition } from '../nodeDefinition/nodeDefinitionTypes';
import type { CanvasTheme } from '../theme';

export const checkNodeDefinition: NodeDefinition<ChecklistNodeData> = defineNodeType({
  ...nodeTypeSpecs.check,
  createDefaultData() {
    return { title: 'Checklist', items: [] };
  },
  parseData(raw) {
    return normalizeChecklistNodeData(raw);
  },
  render({ ctx, data, theme, contentRect, state }) {
    const text = nodeText(theme);
    const layout = nodeLayout(theme);
    const done = data.items.filter((item) => item.checked).length;
    const total = data.items.length;

    if (state.quality === 'compact' && !state.selected && !state.hovered) return;

    const metaY = layout.titleY;
    const itemsY = checklistItemsY(layout, total);
    drawNodeMeta(ctx, contentRect, total ? `${done}/${total} done` : 'No items yet', theme, metaY);
    if (total) drawProgressTrack(ctx, contentRect, done, total, theme, contentRect.y + checklistProgressY(layout));

    const rows = visibleRows(Math.max(0, contentRect.h - itemsY), layout);
    const visibleItems = data.items.slice(0, rows);
    const metrics = checklistMetrics(layout);
    let y = contentRect.y + itemsY;
    for (const item of visibleItems) {
      drawCheckbox(ctx, contentRect.x + layout.insetX, y + metrics.checkboxOffsetY, item.checked, theme);
      ctx.fillStyle = item.checked ? theme.mutedText : theme.bodyText;
      ctx.font = text.body;
      const textX = contentRect.x + layout.insetX + metrics.textOffsetX;
      const itemLabel = clipText(ctx, item.text || 'Untitled item', Math.max(0, contentRect.w - layout.insetX * 2 - metrics.textOffsetX));
      ctx.fillText(itemLabel, textX, y);
      if (item.checked) drawCompletedRule(ctx, textX, y, itemLabel, theme);
      y += layout.rowHeight;
    }

    if (visibleItems.length < rows) {
      drawAddCue(ctx, contentRect.x + layout.insetX, y + metrics.checkboxOffsetY, visibleItems.length ? 'Add item' : 'Add first item', theme);
    } else if (data.items.length > visibleItems.length) {
      ctx.fillStyle = theme.mutedText;
      ctx.font = text.label;
      const overflowLabel = `Open checklist (+${data.items.length - visibleItems.length})`;
      ctx.fillText(clipText(ctx, overflowLabel, Math.max(0, contentRect.w - layout.insetX * 2)), contentRect.x + layout.insetX, contentRect.y + Math.max(0, contentRect.h - layout.labelLineHeight));
    }
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
});

function visibleRows(height: number, layout: ReturnType<typeof nodeLayout>) {
  const available = height - layout.contentY - layout.footerHeight;
  return Math.max(0, Math.min(5, Math.floor(available / layout.rowHeight)));
}

function checklistItemsY(layout: ReturnType<typeof nodeLayout>, total: number) {
  return layout.titleY + layout.labelLineHeight + Math.round(layout.labelLineHeight * (total ? 1 : 0.6));
}

function checklistProgressY(layout: ReturnType<typeof nodeLayout>) {
  return layout.titleY + layout.labelLineHeight + 3;
}

function checklistMetrics(layout: ReturnType<typeof nodeLayout>) {
  const checkboxSize = Math.max(10, Math.round(layout.rowHeight * 0.68));
  const checkboxHitOutset = Math.max(2, Math.round((layout.rowHeight - checkboxSize) / 2));
  return {
    checkboxSize,
    checkboxOffsetY: Math.max(0, Math.round((layout.rowHeight - checkboxSize) / 2) - 1),
    checkboxHitOutset,
    textOffsetX: checkboxSize + Math.max(6, layout.insetX + 4),
  };
}

function drawCheckbox(ctx: CanvasRenderingContext2D, x: number, y: number, checked: boolean, theme: CanvasTheme) {
  const layout = nodeLayout(theme);
  const { checkboxSize } = checklistMetrics(layout);
  const radius = Math.min(3, Math.max(1.5, layout.controlRadius * 0.5));
  ctx.save();
  ctx.strokeStyle = checked ? theme.selected : theme.mutedText;
  ctx.fillStyle = checked ? theme.selected : 'transparent';
  ctx.lineWidth = Math.max(1, layout.controlRadius * 0.3);
  ctx.beginPath();
  ctx.roundRect(x, y, checkboxSize, checkboxSize, radius);
  if (checked) ctx.fill();
  ctx.stroke();
  if (!checked) {
    ctx.restore();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + checkboxSize * 0.21, y + checkboxSize * 0.54);
  ctx.lineTo(x + checkboxSize * 0.43, y + checkboxSize * 0.75);
  ctx.lineTo(x + checkboxSize * 0.83, y + checkboxSize * 0.27);
  ctx.strokeStyle = theme.nodeBg;
  ctx.lineWidth = Math.max(1.4, layout.controlRadius * 0.45);
  ctx.stroke();
  ctx.restore();
}

function drawCompletedRule(ctx: CanvasRenderingContext2D, x: number, y: number, label: string, theme: CanvasTheme) {
  const layout = nodeLayout(theme);
  const width = ctx.measureText(label).width;
  if (width <= 0) return;
  ctx.save();
  ctx.strokeStyle = theme.mutedText;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y + layout.bodyLineHeight * 0.52);
  ctx.lineTo(x + width, y + layout.bodyLineHeight * 0.52);
  ctx.stroke();
  ctx.restore();
}

function drawAddCue(ctx: CanvasRenderingContext2D, x: number, y: number, label: string, theme: CanvasTheme) {
  const layout = nodeLayout(theme);
  const text = nodeText(theme);
  const { checkboxSize, textOffsetX } = checklistMetrics(layout);
  const radius = Math.min(3, Math.max(1.5, layout.controlRadius * 0.5));
  ctx.save();
  ctx.strokeStyle = theme.mutedText;
  ctx.lineWidth = Math.max(1, layout.controlRadius * 0.3);
  ctx.beginPath();
  ctx.roundRect(x, y, checkboxSize, checkboxSize, radius);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + checkboxSize * 0.28, y + checkboxSize * 0.5);
  ctx.lineTo(x + checkboxSize * 0.72, y + checkboxSize * 0.5);
  ctx.moveTo(x + checkboxSize * 0.5, y + checkboxSize * 0.28);
  ctx.lineTo(x + checkboxSize * 0.5, y + checkboxSize * 0.72);
  ctx.stroke();
  ctx.fillStyle = theme.bodyText;
  ctx.font = text.body;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(label, x + textOffsetX, y - Math.max(0, Math.round((layout.bodyLineHeight - checkboxSize) / 2)));
  ctx.restore();
}

function drawProgressTrack(ctx: CanvasRenderingContext2D, rect: NodeContentRect, done: number, total: number, theme: CanvasTheme, y: number) {
  const layout = nodeLayout(theme);
  const x = rect.x + layout.insetX;
  const w = Math.max(0, rect.w - layout.insetX * 2);
  if (w <= 0) return;
  const h = 3;
  const fillW = Math.max(0, Math.min(w, w * (done / total)));
  ctx.save();
  ctx.globalAlpha = 0.34;
  ctx.fillStyle = theme.mutedText;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = theme.selected;
  ctx.beginPath();
  ctx.roundRect(x, y, fillW, h, h / 2);
  ctx.fill();
  ctx.restore();
}
