import type { CanvasTheme } from '../theme';
import type { NodeContentRect } from './types';

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
  ctx.font = '600 10px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(clipText(ctx, label, Math.max(0, w - 16)), x + w / 2, y + h / 2);
}

export function drawTypeBadge(ctx: CanvasRenderingContext2D, rect: NodeContentRect, label: string, theme: CanvasTheme) {
  ctx.fillStyle = theme.mutedText;
  ctx.font = '600 10px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(clipText(ctx, label, Math.max(0, rect.w - 4)), rect.x, rect.y + Math.max(0, rect.h - 18));
}

export function contentLineCapacity(rect: NodeContentRect, lineHeight: number) {
  return Math.max(0, Math.floor(rect.h / lineHeight));
}
