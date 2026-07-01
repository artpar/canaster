import { normalizeTableNodeData, type TableNodeData } from '../../../domain/tableNodeData';
import { defineNodeType } from '../nodeDefinition/defineNodeType';
import { clipText, drawNodeMeta, drawNodeTitle, nodeLayout, nodeText } from '../nodeRendering';
import { nodeTypeSpecs } from '../nodeDefinition/nodeTypeSpecs';
import type { NodeContentRect, NodeDefinition } from '../nodeDefinition/nodeDefinitionTypes';
import type { CanvasTheme } from '../theme';

export const tableNodeDefinition: NodeDefinition<TableNodeData> = defineNodeType({
  ...nodeTypeSpecs.table,
  createDefaultData() {
    return { title: 'Table', columns: ['Item', 'Owner', 'Status'], rows: [] };
  },
  parseData(raw) {
    return normalizeTableNodeData(raw);
  },
  render({ ctx, data, theme, contentRect, state }) {
    if (state.quality === 'compact' && !state.selected && !state.hovered) return;

    drawNodeTitle(ctx, contentRect, data.title || 'Table', theme);
    drawNodeMeta(ctx, contentRect, `${data.rows.length} row${data.rows.length === 1 ? '' : 's'}`, theme);
    drawTablePreview(ctx, contentRect, data, theme);
  },
  describe({ data }) {
    return {
      label: data.title || 'Table',
      roleDescription: 'Table',
      details: [`${data.columns.length} columns`, `${data.rows.length} rows`],
      state: data.rows.length ? [] : ['No rows'],
      actions: [],
    };
  },
});

function drawTablePreview(ctx: CanvasRenderingContext2D, rect: NodeContentRect, data: TableNodeData, theme: CanvasTheme) {
  const text = nodeText(theme);
  const layout = nodeLayout(theme);
  const x = rect.x + layout.insetX;
  const y = rect.y + layout.contentY + layout.labelLineHeight;
  const w = Math.max(0, rect.w - layout.insetX * 2);
  const columnCount = Math.max(1, data.columns.length);
  const columnWidth = w / columnCount;
  const rowHeight = layout.rowHeight;
  const maxRows = Math.max(0, Math.floor((rect.h - (y - rect.y)) / rowHeight) - 1);

  ctx.save();
  ctx.font = text.micro;
  ctx.fillStyle = theme.mutedText;
  ctx.strokeStyle = theme.nodeBorder;
  ctx.lineWidth = 1;
  drawTableRow(ctx, data.columns, x, y, columnWidth, rowHeight, theme, true);
  ctx.beginPath();
  ctx.moveTo(x, y + rowHeight);
  ctx.lineTo(x + w, y + rowHeight);
  ctx.stroke();

  ctx.font = text.body;
  const visibleRows = data.rows.slice(0, maxRows);
  for (let index = 0; index < visibleRows.length; index += 1) {
    drawTableRow(ctx, visibleRows[index], x, y + rowHeight * (index + 1), columnWidth, rowHeight, theme, false);
  }
  if (!visibleRows.length) {
    ctx.fillStyle = theme.mutedText;
    ctx.fillText('Add rows', x, y + rowHeight + 4);
  }
  ctx.restore();
}

function drawTableRow(ctx: CanvasRenderingContext2D, cells: readonly string[], x: number, y: number, columnWidth: number, rowHeight: number, theme: CanvasTheme, header: boolean) {
  for (let index = 0; index < cells.length; index += 1) {
    const cellX = x + index * columnWidth;
    ctx.fillStyle = header ? theme.headerText : theme.bodyText;
    ctx.fillText(clipText(ctx, cells[index] || '', Math.max(0, columnWidth - 8)), cellX, y + Math.max(2, (rowHeight - 14) / 2));
  }
}
