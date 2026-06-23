import { BuiltInNodeTypes, type CanvasPortalNodeData } from '../types';
import { asNullableString, asNumber, asString } from './data';
import { clipText, drawTypeBadge } from './rendering';
import type { NodeContentRect, NodeDefinition } from './types';

export const canvasNodeDefinition: NodeDefinition<CanvasPortalNodeData> = {
  type: BuiltInNodeTypes.canvas,
  displayName: 'View',
  defaultSize: { w: 300, h: 180 },
  minSize: { w: 160, h: 100 },
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
    ctx.fillStyle = theme.headerText;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = '600 15px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText(clipText(ctx, data.title || 'View', Math.max(0, contentRect.w - 8)), contentRect.x + 4, contentRect.y + 4);

    if (state.quality !== 'compact') {
      ctx.strokeStyle = theme.nodeBorder;
      const preview = canvasPortalViewportRect(contentRect);
      const previewX = preview.x;
      const previewY = preview.y;
      const previewW = preview.w;
      const previewH = preview.h;
      ctx.strokeRect(previewX, previewY, previewW, previewH);
      ctx.fillStyle = theme.mutedText;
      ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
      if (!data.childCanvasId) {
        ctx.fillText('No view inside', previewX + 10, previewY + 10);
      } else if (state.portalPreview === 'none') {
        ctx.fillText(`${data.nodeCount} item${data.nodeCount === 1 ? '' : 's'} inside`, previewX + 10, previewY + 10);
      }
      if (state.portalPreview !== 'live') drawPreviewBoxes(ctx, previewX, previewY, previewW, previewH, theme);
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
};

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
