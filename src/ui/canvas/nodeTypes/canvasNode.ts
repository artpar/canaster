import { asNullableString, asNumber, asString } from '../../../core/nodeData';
import { defineNodeType } from '../nodeDefinition/defineNodeType';
import type { JsonObject } from '../../../core/nodePrimitives';
import { drawCompactNode, drawNodeMeta, drawNodeTitle, drawTypeBadge, nodeText } from '../nodeRendering';
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
    if (state.quality === 'compact' && !state.selected && !state.hovered) {
      drawCompactNode(ctx, contentRect, 'VIEW', data.title || 'View', theme);
      return;
    }

    drawNodeTitle(ctx, contentRect, data.title || 'View', theme, 4);

    if (state.quality !== 'compact') {
      ctx.strokeStyle = theme.nodeBorder;
      const preview = canvasPortalViewportRect(contentRect);
      const previewX = preview.x;
      const previewY = preview.y;
      const previewW = preview.w;
      const previewH = preview.h;
      ctx.strokeRect(previewX, previewY, previewW, previewH);
      ctx.fillStyle = theme.mutedText;
      ctx.font = nodeText.label;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      if (!data.childCanvasId) {
        ctx.fillText('No view inside', previewX + 10, previewY + 10);
      } else if (state.portalPreview === 'none') {
        ctx.fillText(`${data.nodeCount} item${data.nodeCount === 1 ? '' : 's'} inside`, previewX + 10, previewY + 10);
      }
      if (state.portalPreview !== 'live') drawPreviewBoxes(ctx, previewX, previewY, previewW, previewH, theme);
    } else {
      drawNodeMeta(ctx, contentRect, data.childCanvasId ? `${data.nodeCount} item${data.nodeCount === 1 ? '' : 's'} inside` : 'No view inside', theme);
    }

    drawTypeBadge(ctx, contentRect, 'VIEW', theme);
  },
  hitTest({ data, point, contentRect }) {
    const preview = canvasPortalViewportRect(contentRect);
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

export function canvasPortalViewportRect(contentRect: NodeContentRect): NodeContentRect {
  return {
    x: contentRect.x + 6,
    y: contentRect.y + 36,
    w: Math.max(0, contentRect.w - 12),
    h: Math.max(0, contentRect.h - 72),
  };
}

function drawPreviewBoxes(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, theme: { nodeBorder: string }) {
  if (w < 64 || h < 48) return;
  ctx.strokeStyle = theme.nodeBorder;
  for (let i = 0; i < 3; i++) {
    ctx.strokeRect(x + 14 + i * 34, y + h - 34 - i * 5, 24, 16);
  }
}
