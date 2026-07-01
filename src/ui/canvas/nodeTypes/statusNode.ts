import { dateNodeDateLabel } from '../../../domain/dateNodeData';
import {
  normalizeStatusNodeData,
  STATUS_NODE_VALUES,
  statusNodeLabel,
  type StatusNodeData,
  type StatusNodeValue,
} from '../../../domain/statusNodeData';
import { defineNodeType } from '../nodeDefinition/defineNodeType';
import { clipText, drawNodeBodyLines, nodeLayout, nodeText, wrapText } from '../nodeRendering';
import { createNodeDetailsEditor } from './createNodeDetailsEditor';
import { nodeContentInteractionRegion } from './nodeContentInteractionRegion';
import { nodeTypeSpecs } from '../nodeDefinition/nodeTypeSpecs';
import type { NodeContentRect, NodeDefinition } from '../nodeDefinition/nodeDefinitionTypes';
import type { CanvasTheme } from '../theme';

export const statusNodeDefinition: NodeDefinition<StatusNodeData> = defineNodeType({
  ...nodeTypeSpecs.status,
  createDefaultData() {
    return { title: 'Status', status: 'not-started', owner: '', dueDate: '', detail: '' };
  },
  parseData(raw) {
    return normalizeStatusNodeData(raw);
  },
  render({ ctx, data, theme, contentRect, state }) {
    const layout = nodeLayout(theme);
    const tone = statusTone(data.status, theme);
    drawStatusSignalRail(ctx, contentRect, data.status, tone, theme);

    if (state.quality === 'compact' && !state.selected && !state.hovered) return;

    drawStatusHeader(ctx, contentRect, data, tone, theme);
    drawStatusMeta(ctx, contentRect, data, tone, theme);
    const detailY = contentRect.y + layout.contentY + Math.round(layout.labelLineHeight * 0.55);
    const lines = wrapText(
      ctx,
      data.detail || 'Add the current state and next step.',
      Math.max(0, contentRect.w - layout.insetX * 2),
      statusDetailLineCapacity(contentRect, detailY, layout.bodyLineHeight),
    );
    drawNodeBodyLines(ctx, contentRect, lines, theme, { y: detailY });
  },
  describe({ data }) {
    return {
      label: data.title || 'Status',
      roleDescription: 'Status',
      details: [
        statusNodeLabel(data.status),
        data.owner ? `Owner: ${data.owner}` : 'Unassigned',
        data.dueDate && `Due: ${dateNodeDateLabel(data.dueDate)}`,
        data.detail,
      ].filter(Boolean),
      state: data.status === 'blocked' ? ['Blocked'] : [],
      actions: [],
    };
  },
  getInteractionRegions({ contentRect }) {
    return nodeContentInteractionRegion(contentRect, 'pointer', 'edit status');
  },
  createInteraction(ctx) {
    if (ctx.region.id !== 'edit') return null;
    return createNodeDetailsEditor<StatusNodeData>({
      mount: ctx.mount,
      className: 'node-inline-details-editor node-inline-status-editor',
      title: 'Status',
      fields: [
        { id: 'title', label: 'Title', value: ctx.data.title },
        { id: 'status', label: 'Status', value: ctx.data.status, options: STATUS_NODE_VALUES.map((value) => ({ value, label: statusNodeLabel(value) })) },
        { id: 'owner', label: 'Owner', value: ctx.data.owner },
        { id: 'dueDate', label: 'Due date', value: ctx.data.dueDate, inputMode: 'date' },
        { id: 'detail', label: 'Detail', value: ctx.data.detail, rows: 3 },
      ],
      commit: (nextData) => ctx.requestCommit(nextData),
      close: ctx.requestClose,
      buildData: (values) => normalizeStatusNodeData(values),
    });
  },
});

type StatusTone = {
  color: string;
  labelColor: string;
  muted: boolean;
};

function statusTone(status: StatusNodeValue, theme: CanvasTheme): StatusTone {
  switch (status) {
    case 'done':
      return { color: theme.kind.data, labelColor: theme.headerText, muted: false };
    case 'in-progress':
      return { color: theme.selected, labelColor: theme.headerText, muted: false };
    case 'blocked':
      return { color: theme.kind.system, labelColor: theme.headerText, muted: false };
    case 'not-started':
      return { color: theme.mutedText, labelColor: theme.mutedText, muted: true };
  }
}

function drawStatusHeader(ctx: CanvasRenderingContext2D, rect: NodeContentRect, data: StatusNodeData, tone: StatusTone, theme: CanvasTheme) {
  const text = nodeText(theme);
  const layout = nodeLayout(theme);
  const badgeWidth = statusBadgeWidth(ctx, data.status, theme);
  const titleMaxWidth = Math.max(0, rect.w - layout.insetX * 3 - badgeWidth);
  ctx.save();
  ctx.fillStyle = theme.headerText;
  ctx.font = text.title;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(clipText(ctx, data.title || 'Status', titleMaxWidth), rect.x + layout.insetX, rect.y + layout.titleY);
  ctx.restore();
  drawStatusBadge(ctx, rect, data.status, badgeWidth, tone, theme);
}

function drawStatusBadge(
  ctx: CanvasRenderingContext2D,
  rect: NodeContentRect,
  status: StatusNodeValue,
  width: number,
  tone: StatusTone,
  theme: CanvasTheme,
) {
  const text = nodeText(theme);
  const layout = nodeLayout(theme);
  const label = statusNodeLabel(status);
  const badgeWidth = Math.min(width, Math.max(0, rect.w - layout.insetX * 2));
  const labelWidth = Math.max(0, badgeWidth - 24);
  const height = Math.min(20, layout.titleHeight + 2);
  const x = rect.x + rect.w - layout.insetX - badgeWidth;
  const y = rect.y + Math.max(0, layout.titleY - 1);
  const centerY = rect.y + layout.titleY + layout.titleHeight / 2;

  ctx.save();
  ctx.globalAlpha = tone.muted ? 0.09 : 0.14;
  ctx.fillStyle = tone.color;
  ctx.beginPath();
  ctx.roundRect(x, y, badgeWidth, height, theme.nodeControlRadius);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = tone.color;
  ctx.beginPath();
  ctx.arc(x + 8, centerY, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = tone.labelColor;
  ctx.font = text.label;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(clipText(ctx, label, labelWidth), x + 16, centerY);
  ctx.restore();
}

function drawStatusSignalRail(
  ctx: CanvasRenderingContext2D,
  rect: NodeContentRect,
  status: StatusNodeValue,
  tone: StatusTone,
  theme: CanvasTheme,
) {
  const layout = nodeLayout(theme);
  const stages = STATUS_NODE_VALUES;
  const activeIndex = stages.indexOf(status);
  const gap = 3;
  const railX = rect.x + layout.insetX;
  const railY = rect.y + layout.metaY + layout.labelLineHeight + 2;
  const railW = Math.max(0, rect.w - layout.insetX * 2);
  const segmentW = Math.max(0, (railW - gap * (stages.length - 1)) / stages.length);
  const h = 4;

  ctx.save();
  for (const [index] of stages.entries()) {
    const x = railX + index * (segmentW + gap);
    ctx.globalAlpha = index <= activeIndex ? (tone.muted ? 0.22 : 0.9) : 0.12;
    ctx.fillStyle = index <= activeIndex ? tone.color : theme.mutedText;
    ctx.beginPath();
    ctx.roundRect(x, railY, segmentW, h, h / 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawStatusMeta(
  ctx: CanvasRenderingContext2D,
  rect: NodeContentRect,
  data: StatusNodeData,
  tone: StatusTone,
  theme: CanvasTheme,
) {
  const text = nodeText(theme);
  const layout = nodeLayout(theme);
  const x = rect.x + layout.insetX;
  const y = rect.y + layout.metaY;
  const availableWidth = Math.max(0, rect.w - layout.insetX * 2);
  const due = data.dueDate.trim() ? `Due ${dateNodeDateLabel(data.dueDate)}` : 'No due date';
  const owner = data.owner.trim() || 'Unassigned';
  const separator = '  /  ';

  ctx.save();
  ctx.font = text.label;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = theme.mutedText;
  const ownerText = clipText(ctx, owner, Math.max(0, availableWidth * 0.46));
  ctx.fillText(ownerText, x, y);
  const ownerWidth = ctx.measureText(ownerText).width;
  ctx.fillStyle = tone.muted ? theme.mutedText : tone.color;
  ctx.fillText(separator, x + ownerWidth, y);
  ctx.fillStyle = theme.mutedText;
  ctx.fillText(clipText(ctx, due, Math.max(0, availableWidth - ownerWidth - ctx.measureText(separator).width)), x + ownerWidth + ctx.measureText(separator).width, y);
  ctx.restore();
}

function statusBadgeWidth(ctx: CanvasRenderingContext2D, status: StatusNodeValue, theme: CanvasTheme) {
  ctx.save();
  ctx.font = nodeText(theme).label;
  const width = Math.ceil(ctx.measureText(statusNodeLabel(status)).width + 26);
  ctx.restore();
  return width;
}

function statusDetailLineCapacity(rect: NodeContentRect, y: number, lineHeight: number) {
  return Math.max(0, Math.min(3, Math.floor((rect.y + rect.h - y) / lineHeight)));
}
