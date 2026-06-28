import type { CanvasTheme } from '../theme';
import type { NodeContentRect } from './types';

const FONT_STACK = 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

export const nodeText = {
  title: `600 15px ${FONT_STACK}`,
  titleSmall: `600 14px ${FONT_STACK}`,
  body: `13px ${FONT_STACK}`,
  label: `12px ${FONT_STACK}`,
  micro: `600 10px ${FONT_STACK}`,
};

export const nodeLayout = {
  insetX: 4,
  titleY: 2,
  titleHeight: 18,
  bodyLineHeight: 18,
  labelLineHeight: 15,
  metaY: 25,
  contentY: 48,
  footerHeight: 18,
  accentWidth: 28,
  accentHeight: 6,
  rowHeight: 19,
  controlRadius: 4,
};

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

export function drawPlaceholderIcon(ctx: CanvasRenderingContext2D, rect: NodeContentRect, label: string) {
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
  ctx.font = nodeText.micro;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(clipText(ctx, label, Math.max(0, w - 16)), x + w / 2, y + h / 2);
}

export function drawTypeBadge(ctx: CanvasRenderingContext2D, rect: NodeContentRect, label: string, theme: CanvasTheme) {
  ctx.fillStyle = theme.mutedText;
  ctx.font = nodeText.micro;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(clipText(ctx, label, Math.max(0, rect.w - 4)), rect.x, rect.y + Math.max(0, rect.h - 18));
}

export function drawAccentMark(ctx: CanvasRenderingContext2D, rect: NodeContentRect, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(rect.x, rect.y, nodeLayout.accentWidth, nodeLayout.accentHeight, 3);
  ctx.fill();
}

export function drawNodeTitle(ctx: CanvasRenderingContext2D, rect: NodeContentRect, title: string, theme: CanvasTheme, y = nodeLayout.titleY) {
  ctx.fillStyle = theme.headerText;
  ctx.font = nodeText.title;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(clipText(ctx, title, Math.max(0, rect.w - nodeLayout.insetX * 2)), rect.x + nodeLayout.insetX, rect.y + y);
}

export function drawNodeMeta(ctx: CanvasRenderingContext2D, rect: NodeContentRect, meta: string, theme: CanvasTheme, y = nodeLayout.metaY) {
  ctx.fillStyle = theme.mutedText;
  ctx.font = nodeText.label;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(clipText(ctx, meta, Math.max(0, rect.w - nodeLayout.insetX * 2)), rect.x + nodeLayout.insetX, rect.y + y);
}

export function drawNodeBodyLines(
  ctx: CanvasRenderingContext2D,
  rect: NodeContentRect,
  lines: string[],
  theme: CanvasTheme,
  options: { x?: number; y?: number; color?: string; lineHeight?: number; font?: string } = {},
) {
  ctx.fillStyle = options.color ?? theme.bodyText;
  ctx.font = options.font ?? nodeText.body;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const x = options.x ?? rect.x + nodeLayout.insetX;
  let y = options.y ?? rect.y + nodeLayout.contentY;
  const lineHeight = options.lineHeight ?? nodeLayout.bodyLineHeight;
  for (const line of lines) {
    ctx.fillText(line, x, y);
    y += lineHeight;
  }
}

export function drawCompactNode(ctx: CanvasRenderingContext2D, rect: NodeContentRect, badge: string, label: string, theme: CanvasTheme) {
  ctx.fillStyle = theme.mutedText;
  ctx.font = nodeText.micro;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(clipText(ctx, badge, Math.max(0, rect.w - 4)), rect.x, rect.y);
  ctx.fillStyle = theme.headerText;
  ctx.font = nodeText.label;
  ctx.fillText(clipText(ctx, label, Math.max(0, rect.w - 4)), rect.x, rect.y + 18);
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
