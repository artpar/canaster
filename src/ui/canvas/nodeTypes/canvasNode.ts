import { canvasNodeSemanticDefinition, type CanvasPortalNodeData } from '../../../domain/nodeDefinitions/canvasNodeSemanticDefinition';
import { defineNodeType } from '../nodeDefinition/defineNodeType';
import { nodeLayout } from '../nodeRendering';
import { nodeTypeSpecs } from '../nodeDefinition/nodeTypeSpecs';
import type { NodeContentRect, NodeDefinition } from '../nodeDefinition/nodeDefinitionTypes';

const PORTAL_CHROME_GUTTER = 4;

export const canvasNodeDefinition: NodeDefinition<CanvasPortalNodeData> = defineNodeType({
  ...nodeTypeSpecs.canvas,
  createDefaultData: canvasNodeSemanticDefinition.createDefaultData,
  parseData: canvasNodeSemanticDefinition.parseData,
  render({ ctx, data, theme, contentRect, state }) {
    if (state.quality === 'compact' && !state.selected && !state.hovered) return;

    const preview = canvasPortalViewportRect(contentRect, theme);
    const previewX = preview.x;
    const previewY = preview.y;
    const previewW = preview.w;
    const previewH = preview.h;
    if (state.portalPreview !== 'live') drawPreviewBoxes(ctx, previewX, previewY, previewW, previewH, theme);
  },
  hitTest({ data, point, contentRect, theme }) {
    const preview = canvasPortalViewportRect(contentRect, theme);
    if (point.x >= preview.x && point.x <= preview.x + preview.w && point.y >= preview.y && point.y <= preview.y + preview.h) {
      return { type: 'activate', action: data.childCanvasId ? 'enter-child-canvas' : 'create-child-canvas' };
    }
    return { type: 'body' };
  },
  describe: canvasNodeSemanticDefinition.describe,
  portalInfo: canvasNodeSemanticDefinition.portalInfo,
  createPortalData: canvasNodeSemanticDefinition.createPortalData,
  updatePortalSummary: canvasNodeSemanticDefinition.updatePortalSummary,
  stripForPaste: canvasNodeSemanticDefinition.stripForPaste,
});

export function canvasPortalViewportRect(contentRect: NodeContentRect, theme?: Parameters<typeof nodeLayout>[0]): NodeContentRect {
  void theme;
  return {
    x: contentRect.x + PORTAL_CHROME_GUTTER,
    y: contentRect.y + PORTAL_CHROME_GUTTER,
    w: Math.max(0, contentRect.w - PORTAL_CHROME_GUTTER * 2),
    h: Math.max(0, contentRect.h - PORTAL_CHROME_GUTTER * 2),
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
