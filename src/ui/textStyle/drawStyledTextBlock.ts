import { normalizeTextStyle, type TextStyle } from '../../domain/textStyle';
import type { NodeContentRect } from '../canvas/nodeDefinition/nodeDefinitionTypes';

export function drawStyledTextBlock(
  ctx: CanvasRenderingContext2D,
  rect: NodeContentRect,
  text: string,
  style: TextStyle,
): void {
  const resolved = normalizeTextStyle(style);
  ctx.save();
  ctx.globalAlpha *= resolved.opacity;
  drawTextBackground(ctx, rect, resolved);
  drawTextBorder(ctx, rect, resolved);
  const contentRect = insetTextRect(rect, resolved);
  if (contentRect.w <= 0 || contentRect.h <= 0) {
    ctx.restore();
    return;
  }

  ctx.font = fontForStyle(resolved);
  ctx.textBaseline = 'top';
  setFillStyle(ctx, resolved.color);

  const transformed = transformText(text, resolved.textTransform);
  const lines = wrapStyledText(ctx, transformed, contentRect.w, Math.max(1, Math.floor(contentRect.h / resolved.lineHeight)), resolved.letterSpacing);
  const blockHeight = lines.length * resolved.lineHeight;
  let y = verticalStart(contentRect, blockHeight, resolved);
  for (const [index, line] of lines.entries()) {
    drawStyledLine(ctx, line, contentRect, y, resolved, index < lines.length - 1);
    y += resolved.lineHeight;
  }
  ctx.restore();
}

function drawTextBackground(ctx: CanvasRenderingContext2D, rect: NodeContentRect, style: TextStyle) {
  if (style.backgroundColor === 'transparent') return;
  setFillStyle(ctx, style.backgroundColor);
  roundedRectPath(ctx, rect, style.border.radius);
  ctx.fill();
}

function drawTextBorder(ctx: CanvasRenderingContext2D, rect: NodeContentRect, style: TextStyle) {
  if (style.border.style === 'none' || style.border.width <= 0) return;
  setStrokeStyle(ctx, style.border.color);
  ctx.lineWidth = style.border.width;
  if (style.border.style === 'dashed') ctx.setLineDash([Math.max(4, style.border.width * 3), Math.max(3, style.border.width * 2)]);
  if (style.border.style === 'dotted') ctx.setLineDash([Math.max(1, style.border.width), Math.max(3, style.border.width * 2)]);
  const inset = style.border.width / 2;
  roundedRectPath(ctx, {
    x: rect.x + inset,
    y: rect.y + inset,
    w: Math.max(0, rect.w - style.border.width),
    h: Math.max(0, rect.h - style.border.width),
  }, Math.max(0, style.border.radius - inset));
  ctx.stroke();
  ctx.setLineDash([]);
}

function insetTextRect(rect: NodeContentRect, style: TextStyle): NodeContentRect {
  const borderInset = style.border.style === 'none' ? 0 : style.border.width;
  const left = borderInset + style.padding.left;
  const right = borderInset + style.padding.right;
  const top = borderInset + style.padding.top;
  const bottom = borderInset + style.padding.bottom;
  return {
    x: rect.x + left,
    y: rect.y + top,
    w: Math.max(0, rect.w - left - right),
    h: Math.max(0, rect.h - top - bottom),
  };
}

function verticalStart(rect: NodeContentRect, blockHeight: number, style: TextStyle) {
  if (style.verticalAlign === 'middle') return rect.y + Math.max(0, rect.h - blockHeight) / 2;
  if (style.verticalAlign === 'bottom') return rect.y + Math.max(0, rect.h - blockHeight);
  return rect.y;
}

function drawStyledLine(
  ctx: CanvasRenderingContext2D,
  line: string,
  rect: NodeContentRect,
  y: number,
  style: TextStyle,
  allowJustify: boolean,
) {
  if (style.align === 'justify' && allowJustify && line.includes(' ')) {
    drawJustifiedLine(ctx, line, rect, y, style);
    drawDecoration(ctx, rect.x, y, rect.w, style);
    return;
  }
  const width = measureSpacedText(ctx, line, style.letterSpacing);
  const x = horizontalStart(rect, width, style);
  drawSpacedText(ctx, line, x, y, style.letterSpacing);
  drawDecoration(ctx, x, y, width, style);
}

function drawJustifiedLine(
  ctx: CanvasRenderingContext2D,
  line: string,
  rect: NodeContentRect,
  y: number,
  style: TextStyle,
) {
  const words = line.split(/\s+/).filter(Boolean);
  const wordWidth = words.reduce((sum, word) => sum + measureSpacedText(ctx, word, style.letterSpacing), 0);
  const gap = words.length > 1 ? Math.max(0, (rect.w - wordWidth) / (words.length - 1)) : 0;
  let x = rect.x;
  for (const word of words) {
    drawSpacedText(ctx, word, x, y, style.letterSpacing);
    x += measureSpacedText(ctx, word, style.letterSpacing) + gap;
  }
}

function horizontalStart(rect: NodeContentRect, lineWidth: number, style: TextStyle) {
  if (style.align === 'center') return rect.x + Math.max(0, rect.w - lineWidth) / 2;
  if (style.align === 'right') return rect.x + Math.max(0, rect.w - lineWidth);
  return rect.x;
}

function drawDecoration(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, style: TextStyle) {
  if (style.textDecoration === 'none' || width <= 0) return;
  setStrokeStyle(ctx, style.color);
  ctx.lineWidth = Math.max(1, style.fontSize / 14);
  const lineY = style.textDecoration === 'underline' ? y + style.fontSize + 2 : y + style.fontSize * 0.58;
  ctx.beginPath();
  ctx.moveTo(x, lineY);
  ctx.lineTo(x + width, lineY);
  ctx.stroke();
}

function wrapStyledText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number, letterSpacing: number) {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    if (lines.length >= maxLines) break;
    if (!paragraph.trim()) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (measureSpacedText(ctx, next, letterSpacing) > maxWidth && line) {
        lines.push(line);
        line = word;
        if (lines.length >= maxLines) break;
      } else {
        line = next;
      }
    }
    if (line && lines.length < maxLines) lines.push(clipLine(ctx, line, maxWidth, letterSpacing));
  }
  return lines.length ? lines.slice(0, maxLines) : [''];
}

function clipLine(ctx: CanvasRenderingContext2D, line: string, maxWidth: number, letterSpacing: number) {
  if (measureSpacedText(ctx, line, letterSpacing) <= maxWidth) return line;
  let clipped = line;
  while (clipped && measureSpacedText(ctx, `${clipped}...`, letterSpacing) > maxWidth) clipped = clipped.slice(0, -1);
  return clipped ? `${clipped}...` : '';
}

function drawSpacedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, letterSpacing: number) {
  if (letterSpacing === 0) {
    ctx.fillText(text, x, y);
    return;
  }
  let cursor = x;
  for (const character of text) {
    ctx.fillText(character, cursor, y);
    cursor += ctx.measureText(character).width + letterSpacing;
  }
}

function measureSpacedText(ctx: CanvasRenderingContext2D, text: string, letterSpacing: number) {
  if (!text) return 0;
  const base = ctx.measureText(text).width;
  return Math.max(0, base + Math.max(0, text.length - 1) * letterSpacing);
}

function transformText(text: string, transform: TextStyle['textTransform']) {
  if (transform === 'uppercase') return text.toUpperCase();
  if (transform === 'lowercase') return text.toLowerCase();
  if (transform === 'capitalize') return text.replace(/\b\w/g, (letter) => letter.toUpperCase());
  return text;
}

function fontForStyle(style: TextStyle) {
  return `${style.fontStyle} ${style.fontWeight} ${style.fontSize}px ${style.fontFamily}`;
}

function roundedRectPath(ctx: CanvasRenderingContext2D, rect: NodeContentRect, radius: number) {
  ctx.beginPath();
  ctx.roundRect(rect.x, rect.y, rect.w, rect.h, Math.min(radius, rect.w / 2, rect.h / 2));
}

function setFillStyle(ctx: CanvasRenderingContext2D, color: string) {
  try {
    ctx.fillStyle = color;
  } catch {
    ctx.fillStyle = '#34404d';
  }
}

function setStrokeStyle(ctx: CanvasRenderingContext2D, color: string) {
  try {
    ctx.strokeStyle = color;
  } catch {
    ctx.strokeStyle = '#c4ccd6';
  }
}
