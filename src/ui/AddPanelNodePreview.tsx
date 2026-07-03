import { useEffect, useRef } from 'react';
import { contentViewportForNode } from '../core/nodeAppearance';
import type { CanvasNode, JsonObject } from '../core/nodePrimitives';
import { BuiltInNodeTypes } from '../domain/types';
import { canvasThemeFor } from './canvas/theme';
import { nodeDefinitionForType, parseNodeData, renderNodeContent } from './canvas/nodeRegistry';
import { unavailableCanvasNodeAssetService } from './canvas/nodeAssetService';
import type { CanvasTheme } from './canvas/theme';
import type { NodeContentRect } from './canvas/nodeDefinition/nodeDefinitionTypes';
import { DEFAULT_CANASTER_THEME_ID } from './theme/CanasterThemeRegistry';

const PREVIEW_NODE_PADDING = 4;

export function AddPanelNodePreview({
  type,
  width,
  height = 150,
  className = 'panel-type-preview',
}: {
  type: string;
  width?: number;
  height?: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const render = () => {
      const rect = canvas.getBoundingClientRect();
      const renderWidth = Math.max(1, Math.round((width ?? rect.width) || 240));
      const renderHeight = Math.max(1, Math.round(height || rect.height || 150));
      renderAddPanelNodePreview(canvas, type, renderWidth, renderHeight);
    };

    render();
    const observer = new ResizeObserver(render);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [height, type, width]);

  return <canvas ref={canvasRef} className={className} width={width ?? 1} height={height} aria-hidden="true" />;
}

function renderAddPanelNodePreview(canvas: HTMLCanvasElement, type: string, width: number, height: number) {
  const definition = nodeDefinitionForType(type);
  const ctx = canvas.getContext('2d');
  if (!ctx || !definition) return;

  const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);

  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);

  const theme = canvasThemeFor(DEFAULT_CANASTER_THEME_ID);
  const node = previewNodeForType(type, definition.defaultSize.w, definition.defaultSize.h);
  const scale = Math.min(
    (width - PREVIEW_NODE_PADDING * 2) / node.w,
    (height - PREVIEW_NODE_PADDING * 2) / node.h,
  );
  const x = Math.round((width - node.w * scale) / 2);
  const y = Math.round((height - node.h * scale) / 2);

  ctx.translate(x, y);
  ctx.scale(scale, scale);
  drawPreviewNodeShell(ctx, node, theme);
  const contentRect = previewContentRect(node, definition.contentPadding ?? theme.nodePadding);
  ctx.save();
  clipPreviewNodeContent(ctx, node, theme, contentRect);
  renderNodeContent({
    definition,
    ctx,
    node,
    data: parseNodeData(node),
    theme,
    contentRect,
    contentViewport: contentViewportForNode(node),
    visibleContentRect: contentRect,
    state: {
      selected: false,
      primary: false,
      hovered: false,
      quality: 'normal',
      portalPreview: 'none',
    },
    nodeAssetService: unavailableCanvasNodeAssetService,
    requestRender: () => renderAddPanelNodePreview(canvas, type, width, height),
  });
  ctx.restore();
  drawPreviewNodeBorder(ctx, node, theme);
  ctx.restore();
}

function previewNodeForType(type: string, w: number, h: number): CanvasNode {
  return {
    id: `add-panel-preview-${type}`,
    type,
    x: 0,
    y: 0,
    w,
    h,
    data: previewDataForType(type),
  };
}

function previewDataForType(type: string): JsonObject {
  switch (type) {
    case BuiltInNodeTypes.text:
      return { text: 'Field notes\nFollow up' };
    case BuiltInNodeTypes.table:
      return { title: 'Parts', columns: ['Item', 'Qty', 'State'], rows: [['Valve', '2', 'Ready'], ['Seal', '4', 'Need']] };
    case BuiltInNodeTypes.canvas:
      return { childCanvasId: 'preview', title: 'View', nodeCount: 3 };
    case BuiltInNodeTypes.check:
      return {
        title: 'Checklist',
        items: [
          { id: 'item-1', text: 'Confirm access', checked: true },
          { id: 'item-2', text: 'Take photos', checked: false },
        ],
      };
    case BuiltInNodeTypes.md:
      return { assetId: '', title: 'Markdown', fileName: '', mime: 'text/markdown', markdownText: '# Notes\n- Item' };
    case BuiltInNodeTypes.embed:
      return { url: 'https://example.com', title: 'Web preview', provider: 'web', aspectRatio: '16:9' };
    case BuiltInNodeTypes.image:
    case BuiltInNodeTypes.pdf:
    default:
      return {};
  }
}

function previewContentRect(node: CanvasNode, padding: number): NodeContentRect {
  return {
    x: node.x + padding,
    y: node.y + padding,
    w: Math.max(0, node.w - padding * 2),
    h: Math.max(0, node.h - padding * 2),
  };
}

function drawPreviewNodeShell(ctx: CanvasRenderingContext2D, node: CanvasNode, theme: CanvasTheme) {
  ctx.save();
  ctx.shadowColor = theme.nodeShadow;
  ctx.shadowBlur = Math.max(4, theme.nodeShadowBlur * 0.5);
  ctx.shadowOffsetY = Math.max(1, theme.nodeShadowOffsetY * 0.5);
  roundRectPath(ctx, node.x, node.y, node.w, node.h, theme.nodeRadius);
  ctx.fillStyle = theme.nodeBg;
  ctx.fill();
  ctx.restore();
}

function drawPreviewNodeBorder(ctx: CanvasRenderingContext2D, node: CanvasNode, theme: CanvasTheme) {
  roundRectPath(ctx, node.x, node.y, node.w, node.h, theme.nodeRadius);
  ctx.strokeStyle = theme.nodeBorder;
  ctx.lineWidth = theme.nodeRestBorderWidth;
  ctx.stroke();
}

function clipPreviewNodeContent(ctx: CanvasRenderingContext2D, node: CanvasNode, theme: CanvasTheme, rect: NodeContentRect) {
  roundRectPath(ctx, node.x, node.y, node.w, node.h, theme.nodeRadius);
  ctx.clip();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
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
