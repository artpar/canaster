import MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';
import { clipText, nodeLayout, nodeText, wrapText } from '../nodeRendering';
import type { NodeContentRect } from '../nodeDefinition/nodeDefinitionTypes';
import type { CanvasTheme } from '../theme';

const MAX_CANVAS_MARKDOWN_CHARS = 20000;
const MAX_MARKDOWN_BLOCK_CACHE_ENTRIES = 128;
const MAX_MARKDOWN_LINE_CACHE_ENTRIES = 512;

const markdown = new MarkdownIt({
  breaks: false,
  html: true,
  linkify: true,
  typographer: false,
});
const htmlImageTagPattern = new RegExp('<' + 'img\\b[^>]*>', 'gi');
const htmlInlineImagePattern = new RegExp('^<' + 'img\\b', 'i');

type MarkdownCanvasBlock =
  | { type: 'heading'; level: number; text: string; quoteDepth: number }
  | { type: 'paragraph'; text: string; quoteDepth: number }
  | { type: 'listItem'; marker: string; text: string; depth: number; quoteDepth: number }
  | { type: 'code'; text: string; quoteDepth: number }
  | { type: 'rule'; quoteDepth: number };

type ListState = {
  type: 'bullet' | 'ordered';
  next: number;
};

const markdownBlockCache = new Map<string, MarkdownCanvasBlock[]>();
const markdownLineCache = new Map<string, string[]>();

export function markdownTextForCanvasPreview(markdownText: string): string {
  return markdownText.trim().slice(0, MAX_CANVAS_MARKDOWN_CHARS);
}

export function drawMarkdownCanvasPreview(
  ctx: CanvasRenderingContext2D,
  rect: NodeContentRect,
  markdownText: string,
  theme: CanvasTheme,
) {
  const layout = nodeLayout(theme);
  const text = nodeText(theme);
  const bodyRect = {
    x: rect.x + layout.insetX,
    y: rect.y + layout.contentY + layout.labelLineHeight,
    w: Math.max(0, rect.w - layout.insetX * 2),
    h: Math.max(0, rect.h - layout.contentY - layout.labelLineHeight),
  };
  const blocks = markdownText.trim() ? cachedMarkdownBlocks(markdownText) : [{ type: 'paragraph', text: 'No Markdown content', quoteDepth: 0 } satisfies MarkdownCanvasBlock];
  let y = bodyRect.y;
  const bottom = bodyRect.y + bodyRect.h;

  ctx.save();
  ctx.beginPath();
  ctx.rect(bodyRect.x, bodyRect.y, bodyRect.w, bodyRect.h);
  ctx.clip();

  for (const block of blocks) {
    if (y >= bottom) break;
    y = drawMarkdownBlock(ctx, bodyRect, y, bottom, block, theme, text);
  }
  ctx.restore();
}

function cachedMarkdownBlocks(markdownText: string): MarkdownCanvasBlock[] {
  const cached = markdownBlockCache.get(markdownText);
  if (cached) {
    markdownBlockCache.delete(markdownText);
    markdownBlockCache.set(markdownText, cached);
    return cached;
  }
  const blocks = markdownBlocks(markdownText);
  markdownBlockCache.set(markdownText, blocks);
  trimCache(markdownBlockCache, MAX_MARKDOWN_BLOCK_CACHE_ENTRIES);
  return blocks;
}

function markdownBlocks(markdownText: string): MarkdownCanvasBlock[] {
  const tokens = markdown.parse(markdownText, {});
  const blocks: MarkdownCanvasBlock[] = [];
  const listStack: ListState[] = [];
  let quoteDepth = 0;
  let currentHeadingLevel = 0;
  let currentListMarker = '';

  for (const token of tokens) {
    switch (token.type) {
      case 'blockquote_open':
        quoteDepth += 1;
        break;
      case 'blockquote_close':
        quoteDepth = Math.max(0, quoteDepth - 1);
        break;
      case 'bullet_list_open':
        listStack.push({ type: 'bullet', next: 0 });
        break;
      case 'bullet_list_close':
        listStack.pop();
        break;
      case 'ordered_list_open':
        listStack.push({ type: 'ordered', next: orderedListStart(token) });
        break;
      case 'ordered_list_close':
        listStack.pop();
        break;
      case 'list_item_open':
        currentListMarker = nextListMarker(listStack);
        break;
      case 'list_item_close':
        currentListMarker = '';
        break;
      case 'heading_open':
        currentHeadingLevel = headingLevel(token);
        break;
      case 'heading_close':
        currentHeadingLevel = 0;
        break;
      case 'inline': {
        const content = inlineText(token);
        if (!content) break;
        if (currentHeadingLevel) {
          blocks.push({ type: 'heading', level: currentHeadingLevel, text: content, quoteDepth });
        } else if (currentListMarker) {
          blocks.push({ type: 'listItem', marker: currentListMarker, text: content, depth: listStack.length, quoteDepth });
        } else {
          blocks.push({ type: 'paragraph', text: content, quoteDepth });
        }
        break;
      }
      case 'fence':
      case 'code_block':
        if (token.content.trim()) blocks.push({ type: 'code', text: token.content.trimEnd(), quoteDepth });
        break;
      case 'hr':
        blocks.push({ type: 'rule', quoteDepth });
        break;
      case 'html_block':
        blocks.push(...htmlBlocks(token.content, quoteDepth));
        break;
    }
  }
  return blocks;
}

function htmlBlocks(html: string, quoteDepth: number): MarkdownCanvasBlock[] {
  const blocks: MarkdownCanvasBlock[] = [];
  const headingPattern = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = headingPattern.exec(html)) !== null) {
    pushHtmlParagraphBlock(blocks, html.slice(lastIndex, match.index), quoteDepth);
    const headingText = readableHtmlText(match[2] ?? '');
    if (headingText) blocks.push({ type: 'heading', level: Number.parseInt(match[1] ?? '2', 10), text: headingText, quoteDepth });
    lastIndex = match.index + match[0].length;
  }

  pushHtmlParagraphBlock(blocks, html.slice(lastIndex), quoteDepth);
  return blocks;
}

function pushHtmlParagraphBlock(blocks: MarkdownCanvasBlock[], html: string, quoteDepth: number): void {
  const text = readableHtmlText(html);
  if (text) blocks.push({ type: 'paragraph', text, quoteDepth });
}

function readableHtmlText(html: string): string {
  return decodeHtmlEntities(html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|section|article|header|footer|center|li)>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '• ')
    .replace(htmlImageTagPattern, (tag) => imageText(tag))
    .replace(/<[^>]+>/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim());
}

function drawMarkdownBlock(
  ctx: CanvasRenderingContext2D,
  bodyRect: NodeContentRect,
  y: number,
  bottom: number,
  block: MarkdownCanvasBlock,
  theme: CanvasTheme,
  text: ReturnType<typeof nodeText>,
) {
  if (block.type === 'rule') return drawRule(ctx, bodyRect, y, bottom, block.quoteDepth, theme);
  if (block.type === 'code') return drawCodeBlock(ctx, bodyRect, y, bottom, block.text, block.quoteDepth, theme, text);

  const quoteInset = block.quoteDepth * 10;
  const listInset = block.type === 'listItem' ? Math.max(1, block.depth) * 16 : 0;
  const markerWidth = block.type === 'listItem' ? 18 : 0;
  const x = bodyRect.x + quoteInset + listInset + markerWidth;
  const availableWidth = Math.max(0, bodyRect.w - quoteInset - listInset - markerWidth);
  const font = block.type === 'heading' ? headingFont(block.level, theme) : text.body;
  const lineHeight = block.type === 'heading' ? headingLineHeight(block.level, theme) : theme.nodeBodyLineHeight;
  const color = block.quoteDepth ? theme.mutedText : block.type === 'heading' ? theme.headerText : theme.bodyText;
  const topGap = block.type === 'heading' ? Math.max(4, Math.round(theme.nodeBodyLineHeight * 0.35)) : 0;
  const bottomGap = block.type === 'heading' ? 4 : 3;
  const lines = wrappedMarkdownLines(ctx, block.text, availableWidth, font);
  let nextY = y + topGap;

  ctx.fillStyle = color;
  ctx.font = font;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  if (block.type === 'listItem') {
    ctx.fillStyle = theme.mutedText;
    ctx.fillText(block.marker, bodyRect.x + quoteInset + listInset, nextY);
    ctx.fillStyle = color;
  }
  if (block.quoteDepth) drawQuoteBars(ctx, bodyRect.x, y, Math.min(bottom, nextY + lines.length * lineHeight), block.quoteDepth, theme);

  for (const line of lines) {
    if (nextY + lineHeight > bottom) return bottom;
    ctx.fillText(clipText(ctx, line, availableWidth), x, nextY);
    nextY += lineHeight;
  }
  return nextY + bottomGap;
}

function drawRule(
  ctx: CanvasRenderingContext2D,
  bodyRect: NodeContentRect,
  y: number,
  bottom: number,
  quoteDepth: number,
  theme: CanvasTheme,
) {
  const x = bodyRect.x + quoteDepth * 10;
  const lineY = y + Math.max(5, Math.round(theme.nodeBodyLineHeight * 0.45));
  if (lineY > bottom) return bottom;
  ctx.save();
  ctx.strokeStyle = theme.nodeBorder;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, lineY);
  ctx.lineTo(bodyRect.x + bodyRect.w, lineY);
  ctx.stroke();
  ctx.restore();
  return lineY + 8;
}

function drawCodeBlock(
  ctx: CanvasRenderingContext2D,
  bodyRect: NodeContentRect,
  y: number,
  bottom: number,
  code: string,
  quoteDepth: number,
  theme: CanvasTheme,
  text: ReturnType<typeof nodeText>,
) {
  const x = bodyRect.x + quoteDepth * 10;
  const lineHeight = Math.max(14, Math.round(theme.nodeBodyLineHeight * 0.9));
  const padding = 6;
  const lines = code.split(/\r?\n/).slice(0, 8);
  const blockHeight = lines.length * lineHeight + padding * 2;
  if (y + Math.min(blockHeight, lineHeight + padding * 2) > bottom) return bottom;

  ctx.save();
  ctx.fillStyle = codeBlockFill(theme);
  ctx.beginPath();
  ctx.roundRect(x, y + 2, Math.max(0, bodyRect.w - quoteDepth * 10), Math.min(blockHeight, bottom - y - 2), theme.nodeControlRadius);
  ctx.fill();
  ctx.fillStyle = theme.bodyText;
  ctx.font = text.micro;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  let lineY = y + padding + 2;
  for (const line of lines) {
    if (lineY + lineHeight > bottom) break;
    ctx.fillText(clipText(ctx, line, Math.max(0, bodyRect.w - quoteDepth * 10 - padding * 2)), x + padding, lineY);
    lineY += lineHeight;
  }
  ctx.restore();
  return Math.min(bottom, y + blockHeight + 6);
}

function drawQuoteBars(ctx: CanvasRenderingContext2D, x: number, y1: number, y2: number, depth: number, theme: CanvasTheme) {
  ctx.save();
  ctx.strokeStyle = theme.nodeBorder;
  ctx.lineWidth = 2;
  for (let index = 0; index < depth; index++) {
    const barX = x + index * 10 + 2;
    ctx.beginPath();
    ctx.moveTo(barX, y1);
    ctx.lineTo(barX, y2);
    ctx.stroke();
  }
  ctx.restore();
}

function headingFont(level: number, theme: CanvasTheme) {
  if (level <= 2) return `${theme.canvasTitleWeight} ${theme.canvasTitleSize} ${theme.canvasFontFamily}`;
  return `${theme.canvasTitleWeight} ${theme.canvasBodySize} ${theme.canvasFontFamily}`;
}

function headingLineHeight(level: number, theme: CanvasTheme) {
  if (level <= 2) return theme.canvasTitleLineHeight;
  return theme.nodeBodyLineHeight;
}

function inlineText(token: Token) {
  const children = token.children ?? [];
  const parts: string[] = [];
  for (const child of children) {
    if (child.type === 'text' || child.type === 'code_inline') parts.push(child.content);
    if (child.type === 'softbreak' || child.type === 'hardbreak') parts.push('\n');
    if (child.type === 'image') parts.push(child.content || child.attrGet('alt') || 'Image');
    if (child.type === 'html_inline') parts.push(htmlInlineText(child.content));
  }
  return (parts.length ? parts.join('') : token.content).replace(/[ \t]+\n/g, '\n').trim();
}

function htmlInlineText(html: string): string {
  if (/^<br\s*\/?>$/i.test(html.trim())) return '\n';
  if (htmlInlineImagePattern.test(html.trim())) return imageText(html);
  return '';
}

function imageText(tag: string): string {
  return htmlAttribute(tag, 'alt') || htmlAttribute(tag, 'title') || '';
}

function htmlAttribute(tag: string, name: string): string {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const match = pattern.exec(tag);
  return decodeHtmlEntities(match?.[1] ?? match?.[2] ?? match?.[3] ?? '').trim();
}

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, body: string) => {
    if (body[0] === '#') {
      const base = body[1]?.toLowerCase() === 'x' ? 16 : 10;
      const raw = body[1]?.toLowerCase() === 'x' ? body.slice(2) : body.slice(1);
      const codePoint = Number.parseInt(raw, base);
      return Number.isFinite(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : entity;
    }
    switch (body.toLowerCase()) {
      case 'amp':
        return '&';
      case 'apos':
        return "'";
      case 'gt':
        return '>';
      case 'lt':
        return '<';
      case 'nbsp':
        return ' ';
      case 'quot':
        return '"';
      default:
        return entity;
    }
  });
}

function wrappedMarkdownLines(ctx: CanvasRenderingContext2D, value: string, maxWidth: number, font: string) {
  const cacheKey = `${font}\n${Math.round(maxWidth)}\n${value}`;
  const cached = markdownLineCache.get(cacheKey);
  if (cached) {
    markdownLineCache.delete(cacheKey);
    markdownLineCache.set(cacheKey, cached);
    return cached;
  }
  const previousFont = ctx.font;
  ctx.font = font;
  const lines = value
    .split(/\n+/)
    .flatMap((line) => wrapText(ctx, line, maxWidth, Number.POSITIVE_INFINITY));
  ctx.font = previousFont;
  const wrapped = lines.length ? lines : [''];
  markdownLineCache.set(cacheKey, wrapped);
  trimCache(markdownLineCache, MAX_MARKDOWN_LINE_CACHE_ENTRIES);
  return wrapped;
}

function trimCache<TKey, TValue>(cache: Map<TKey, TValue>, maxEntries: number): void {
  while (cache.size > maxEntries) {
    const oldest = cache.keys().next();
    if (oldest.done) return;
    cache.delete(oldest.value);
  }
}

function nextListMarker(stack: ListState[]) {
  const list = stack[stack.length - 1];
  if (!list || list.type === 'bullet') return '•';
  const marker = `${list.next}.`;
  list.next += 1;
  return marker;
}

function orderedListStart(token: Token) {
  const start = Number.parseInt(token.attrGet('start') ?? '1', 10);
  return Number.isFinite(start) ? start : 1;
}

function headingLevel(token: Token) {
  const level = Number.parseInt(token.tag.replace(/^h/, ''), 10);
  return Number.isFinite(level) ? Math.min(6, Math.max(1, level)) : 2;
}

function codeBlockFill(theme: CanvasTheme) {
  return theme.name.includes('dark') ? 'rgba(255,255,255,0.06)' : 'rgba(20, 38, 52, 0.055)';
}
