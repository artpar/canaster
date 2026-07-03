import type { CanvasTheme } from './theme';
import type { NodeContentRect } from './nodeDefinition/nodeDefinitionTypes';

export type CanvasNodeText = {
  title: string;
  titleSmall: string;
  body: string;
  label: string;
  micro: string;
};

export type CanvasNodeLayout = {
  insetX: number;
  titleY: number;
  titleHeight: number;
  bodyLineHeight: number;
  labelLineHeight: number;
  metaY: number;
  contentY: number;
  footerHeight: number;
  rowHeight: number;
  controlRadius: number;
};

export function nodeText(theme: CanvasTheme): CanvasNodeText {
  return {
    title: `${theme.canvasTitleWeight} ${theme.canvasTitleSize} ${theme.canvasFontFamily}`,
    titleSmall: `${theme.canvasTitleWeight} ${theme.canvasLabelSize} ${theme.canvasFontFamily}`,
    body: `${theme.canvasBodyWeight} ${theme.canvasBodySize} ${theme.canvasFontFamily}`,
    label: `${theme.canvasBodyWeight} ${theme.canvasLabelSize} ${theme.canvasFontFamily}`,
    micro: `${theme.canvasTitleWeight} ${theme.canvasMicroSize} ${theme.canvasFontFamily}`,
  };
}

export function nodeLayout(theme: CanvasTheme): CanvasNodeLayout {
  return {
    insetX: theme.nodeContentInsetX,
    titleY: theme.nodeTitleY,
    titleHeight: theme.canvasTitleLineHeight,
    bodyLineHeight: theme.nodeBodyLineHeight,
    labelLineHeight: theme.nodeLabelLineHeight,
    metaY: theme.nodeMetaY,
    contentY: theme.nodeContentY,
    footerHeight: theme.nodeBodyLineHeight,
    rowHeight: theme.nodeRowHeight,
    controlRadius: theme.nodeControlRadius,
  };
}

export function clipText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (maxWidth <= 0) return '';
  if (ctx.measureText(text).width <= maxWidth) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(`${text.slice(0, mid)}...`).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return `${text.slice(0, lo)}...`;
}

export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) {
  if (maxLines <= 0) return [];
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines - 1) break;
    } else {
      line = next;
    }
  }
  if (line && lines.length < maxLines) lines.push(clipText(ctx, line, maxWidth));
  return lines;
}

export function drawPlaceholderIcon(ctx: CanvasRenderingContext2D, rect: NodeContentRect, label: string, theme: CanvasTheme) {
  const text = nodeText(theme);
  const x = rect.x + Math.max(0, rect.w - 84) / 2;
  const y = rect.y + Math.max(0, rect.h - 64) / 2;
  const w = Math.min(84, rect.w);
  const h = Math.min(64, rect.h);
  ctx.strokeRect(x, y, w, h);
  ctx.beginPath();
  ctx.moveTo(x + 10, y + h - 12);
  ctx.lineTo(x + w * 0.42, y + h * 0.52);
  ctx.lineTo(x + w * 0.62, y + h - 12);
  ctx.lineTo(x + w - 10, y + h * 0.38);
  ctx.stroke();
  ctx.font = text.micro;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(clipText(ctx, label, Math.max(0, w - 16)), x + w / 2, y + h / 2);
}

export function drawTypeBadge(ctx: CanvasRenderingContext2D, rect: NodeContentRect, label: string, theme: CanvasTheme) {
  const text = nodeText(theme);
  const layout = nodeLayout(theme);
  ctx.fillStyle = theme.mutedText;
  ctx.font = text.micro;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(
    clipText(ctx, label, Math.max(0, rect.w - layout.insetX * 2)),
    rect.x + layout.insetX,
    rect.y + Math.max(0, rect.h - layout.labelLineHeight),
  );
}

export function drawNodeTitle(ctx: CanvasRenderingContext2D, rect: NodeContentRect, title: string, theme: CanvasTheme, y = nodeLayout(theme).titleY) {
  const text = nodeText(theme);
  const layout = nodeLayout(theme);
  ctx.fillStyle = theme.headerText;
  ctx.font = text.title;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(clipText(ctx, title, Math.max(0, rect.w - layout.insetX * 2)), rect.x + layout.insetX, rect.y + y);
}

export function drawNodeMeta(ctx: CanvasRenderingContext2D, rect: NodeContentRect, meta: string, theme: CanvasTheme, y = nodeLayout(theme).metaY) {
  const text = nodeText(theme);
  const layout = nodeLayout(theme);
  ctx.fillStyle = theme.mutedText;
  ctx.font = text.label;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(clipText(ctx, meta, Math.max(0, rect.w - layout.insetX * 2)), rect.x + layout.insetX, rect.y + y);
}

export function drawNodeBodyLines(
  ctx: CanvasRenderingContext2D,
  rect: NodeContentRect,
  lines: string[],
  theme: CanvasTheme,
  options: { x?: number; y?: number; color?: string; lineHeight?: number; font?: string } = {},
) {
  const text = nodeText(theme);
  const layout = nodeLayout(theme);
  ctx.fillStyle = options.color ?? theme.bodyText;
  ctx.font = options.font ?? text.body;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const x = options.x ?? rect.x + layout.insetX;
  let y = options.y ?? rect.y + layout.contentY;
  const lineHeight = options.lineHeight ?? layout.bodyLineHeight;
  for (const line of lines) {
    ctx.fillText(line, x, y);
    y += lineHeight;
  }
}

export function drawCompactNode(ctx: CanvasRenderingContext2D, rect: NodeContentRect, badge: string, label: string, theme: CanvasTheme) {
  const text = nodeText(theme);
  const layout = nodeLayout(theme);
  ctx.fillStyle = theme.mutedText;
  ctx.font = text.micro;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(clipText(ctx, badge, Math.max(0, rect.w - layout.insetX * 2)), rect.x + layout.insetX, rect.y);
  ctx.fillStyle = theme.headerText;
  ctx.font = text.label;
  ctx.fillText(
    clipText(ctx, label, Math.max(0, rect.w - layout.insetX * 2)),
    rect.x + layout.insetX,
    rect.y + layout.bodyLineHeight,
  );
}

export function contentLineCapacity(rect: NodeContentRect, lineHeight: number) {
  return Math.max(0, Math.floor(rect.h / lineHeight));
}

export function insetRect(rect: NodeContentRect, dx: number, dy: number): NodeContentRect {
  return {
    x: rect.x + dx,
    y: rect.y + dy,
    w: Math.max(0, rect.w - dx * 2),
    h: Math.max(0, rect.h - dy * 2),
  };
}
