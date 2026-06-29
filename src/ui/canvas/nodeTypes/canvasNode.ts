import { asNullableString, asNumber, asString } from '../../../core/nodeData';
import { defineNodeType } from '../nodeDefinition/defineNodeType';
import type { JsonObject } from '../../../core/nodePrimitives';
import { drawCompactNode, drawNodeMeta, drawNodeTitle, drawTypeBadge, nodeLayout, nodeText } from '../nodeRendering';
import { nodeTypeSpecs } from '../nodeDefinition/nodeTypeSpecs';
import type { NodeContentRect, NodeDefinition } from '../nodeDefinition/nodeDefinitionTypes';

type CanvasPortalNodeData = {
  childCanvasId: string | null;
  title: string;
  nodeCount: number;
} & JsonObject;

export const canvasNodeDefinition: NodeDefinition<CanvasPortalNodeData> = defineNodeType({
  ...nodeTypeSpecs.canvas,
  createDefaultData() {
    return { childCanvasId: null, title: 'View', nodeCount: 0 };
  },
  parseData(raw) {
    return {
      childCanvasId: asNullableString(raw.childCanvasId),
      title: asString(raw.title, 'View'),
      nodeCount: Math.max(0, Math.floor(asNumber(raw.nodeCount, 0))),
    };
  },
  render({ ctx, data, theme, contentRect, state }) {
    const text = nodeText(theme);
    const layout = nodeLayout(theme);
    if (state.quality === 'compact' && !state.selected && !state.hovered) {
      drawCompactNode(ctx, contentRect, 'VIEW', data.title || 'View', theme);
      return;
    }

    drawNodeTitle(ctx, contentRect, data.title || 'View', theme, layout.titleY);

    if (state.quality !== 'compact') {
      ctx.strokeStyle = theme.nodeBorder;
      const preview = canvasPortalViewportRect(contentRect, theme);
      const previewX = preview.x;
      const previewY = preview.y;
      const previewW = preview.w;
      const previewH = preview.h;
      ctx.strokeRect(previewX, previewY, previewW, previewH);
      ctx.fillStyle = theme.mutedText;
      ctx.font = text.label;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      if (!data.childCanvasId) {
        ctx.fillText('No view inside', previewX + layout.insetX, previewY + layout.labelLineHeight * 0.6);
      } else if (state.portalPreview === 'none') {
        ctx.fillText(`${data.nodeCount} item${data.nodeCount === 1 ? '' : 's'} inside`, previewX + layout.insetX, previewY + layout.labelLineHeight * 0.6);
      }
      if (state.portalPreview !== 'live') drawPreviewBoxes(ctx, previewX, previewY, previewW, previewH, theme);
    } else {
      drawNodeMeta(ctx, contentRect, data.childCanvasId ? `${data.nodeCount} item${data.nodeCount === 1 ? '' : 's'} inside` : 'No view inside', theme);
    }

    drawTypeBadge(ctx, contentRect, 'VIEW', theme);
  },
  hitTest({ data, point, contentRect, theme }) {
    const preview = canvasPortalViewportRect(contentRect, theme);
    if (point.x >= preview.x && point.x <= preview.x + preview.w && point.y >= preview.y && point.y <= preview.y + preview.h) {
      return { type: 'activate', action: data.childCanvasId ? 'enter-child-canvas' : 'create-child-canvas' };
    }
    return { type: 'body' };
  },
  describe({ data }) {
    return {
      label: data.title || 'View inside',
      roleDescription: 'View inside',
      details: [data.childCanvasId ? `${data.nodeCount} item${data.nodeCount === 1 ? '' : 's'} inside` : 'No view inside'],
      state: [],
      actions: data.childCanvasId
        ? [
            { id: 'enter-child-canvas', label: 'Open view', available: true },
            { id: 'focus-portal-preview', label: 'Preview here', available: true },
          ]
        : [{ id: 'create-child-canvas', label: 'Add view inside', available: true }],
    };
  },
  portalInfo({ data }) {
    return {
      childCanvasId: data.childCanvasId,
      title: data.title,
      nodeCount: data.nodeCount,
    };
  },
  createPortalData(info) {
    return {
      childCanvasId: info.childCanvasId,
      title: info.title,
      nodeCount: info.nodeCount,
    };
  },
  updatePortalSummary({ data }, summary) {
    if (data.title === summary.title && data.nodeCount === summary.nodeCount) return data;
    return { ...data, title: summary.title, nodeCount: summary.nodeCount };
  },
  stripForPaste({ node, data }) {
    return {
      ...node,
      data: {
        ...data,
        childCanvasId: null,
        nodeCount: 0,
        title: `${data.title || 'Canvas'} copy`,
      },
    };
  },
});

export function canvasPortalViewportRect(contentRect: NodeContentRect, theme?: Parameters<typeof nodeLayout>[0]): NodeContentRect {
  const layout = theme ? nodeLayout(theme) : null;
  const inset = layout?.insetX ?? 6;
  const top = layout ? layout.contentY - Math.round(layout.bodyLineHeight * 0.55) : 36;
  const bottom = layout ? layout.footerHeight + layout.insetX : 72;
  return {
    x: contentRect.x + inset,
    y: contentRect.y + top,
    w: Math.max(0, contentRect.w - inset * 2),
    h: Math.max(0, contentRect.h - top - bottom),
  };
}

function drawPreviewBoxes(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, theme: Parameters<typeof nodeLayout>[0] & { nodeBorder: string }) {
  const layout = nodeLayout(theme);
  const boxW = Math.max(layout.rowHeight, layout.bodyLineHeight + layout.labelLineHeight);
  const boxH = layout.rowHeight;
  if (w < boxW * 2.7 || h < boxH * 2.7) return;
  ctx.strokeStyle = theme.nodeBorder;
  for (let i = 0; i < 3; i++) {
    ctx.strokeRect(
      x + layout.insetX * 2 + i * (boxW + layout.insetX * 2),
      y + h - boxH * 2 - i * Math.max(1, layout.insetX),
      boxW,
      boxH,
    );
  }
}
