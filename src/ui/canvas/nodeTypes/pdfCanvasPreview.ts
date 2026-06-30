import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { NodeContentViewport } from '../../../core/nodeAppearance';
import { drawNodeBodyLines, nodeLayout, nodeText, wrapText } from '../nodeRendering';
import type { NodeContentRect } from '../nodeDefinition/nodeDefinitionTypes';
import type { CanvasTheme } from '../theme';
import { loadFileAssetFile } from './fileAssetPreview';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString();

const DEFAULT_PAGE_WIDTH = 612;
const DEFAULT_PAGE_HEIGHT = 792;
const PDF_PAGE_GAP = 18;
const MIN_PAGE_RENDER_WIDTH = 360;
const MAX_PAGE_RENDER_WIDTH = 1800;

type PdfDocumentCacheEntry =
  | { status: 'loading' }
  | { status: 'ready'; document: PDFDocumentProxy; pages: Map<number, PdfPageCacheEntry> }
  | { status: 'error'; message: string };

type PdfPageCacheEntry = {
  widthPt: number;
  heightPt: number;
  canvas: HTMLCanvasElement | null;
  renderKey: string;
  rendering: boolean;
  error: boolean;
};

const pdfDocumentCache = new Map<string, PdfDocumentCacheEntry>();

export function drawPdfCanvasPreview(
  ctx: CanvasRenderingContext2D,
  rect: NodeContentRect,
  assetId: string,
  fileName: string,
  theme: CanvasTheme,
  visibleRect: NodeContentRect,
  contentViewport: NodeContentViewport,
  requestRender: () => void,
) {
  const layout = nodeLayout(theme);
  const documentRect = {
    x: rect.x + layout.insetX,
    y: rect.y + layout.contentY + layout.labelLineHeight,
    w: Math.max(0, rect.w - layout.insetX * 2),
    h: Math.max(0, rect.h - layout.contentY - layout.labelLineHeight),
  };

  if (!assetId) {
    drawPdfMessage(ctx, documentRect, 'No PDF file attached', theme);
    return;
  }

  const document = pdfDocumentForAsset(assetId, requestRender);
  if (document.status === 'loading') {
    drawPdfMessage(ctx, documentRect, 'Loading PDF', theme);
    return;
  }
  if (document.status === 'error') {
    drawPdfMessage(ctx, documentRect, document.message, theme);
    return;
  }

  drawPdfPages(ctx, documentRect, document, fileName, theme, visibleRect, contentViewport, requestRender);
}

function pdfDocumentForAsset(assetId: string, requestRender: () => void): PdfDocumentCacheEntry {
  const cached = pdfDocumentCache.get(assetId);
  if (cached) return cached;

  const entry: PdfDocumentCacheEntry = { status: 'loading' };
  pdfDocumentCache.set(assetId, entry);
  void loadFileAssetFile(assetId)
    .then((file) => file.arrayBuffer())
    .then((buffer) => pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise)
    .then((document) => {
      pdfDocumentCache.set(assetId, { status: 'ready', document, pages: new Map() });
      requestRender();
    })
    .catch((error) => {
      pdfDocumentCache.set(assetId, {
        status: 'error',
        message: error instanceof Error ? error.message : 'Could not load PDF',
      });
      requestRender();
    });
  return entry;
}

function drawPdfPages(
  ctx: CanvasRenderingContext2D,
  documentRect: NodeContentRect,
  entry: Extract<PdfDocumentCacheEntry, { status: 'ready' }>,
  fileName: string,
  theme: CanvasTheme,
  visibleRect: NodeContentRect,
  contentViewport: NodeContentViewport,
  requestRender: () => void,
) {
  const visibleBottom = visibleRect.y + visibleRect.h;
  let y = documentRect.y;
  for (let pageNumber = 1; pageNumber <= entry.document.numPages; pageNumber += 1) {
    const page = entry.pages.get(pageNumber);
    const widthPt = page?.widthPt ?? firstKnownPage(entry)?.widthPt ?? DEFAULT_PAGE_WIDTH;
    const heightPt = page?.heightPt ?? firstKnownPage(entry)?.heightPt ?? DEFAULT_PAGE_HEIGHT;
    const pageHeight = documentRect.w * (heightPt / Math.max(1, widthPt));
    const pageRect = { x: documentRect.x, y, w: documentRect.w, h: pageHeight };

    if (rectsIntersect(pageRect, visibleRect)) {
      ensurePdfPageRendered(entry, pageNumber, pageRect.w, contentViewport.scale, requestRender);
      drawPdfPage(ctx, pageRect, pageNumber, entry.pages.get(pageNumber), fileName, theme);
    }
    y += pageHeight + PDF_PAGE_GAP;
    if (y > visibleBottom) break;
  }
}

function ensurePdfPageRendered(
  entry: Extract<PdfDocumentCacheEntry, { status: 'ready' }>,
  pageNumber: number,
  displayWidth: number,
  contentScale: number,
  requestRender: () => void,
) {
  const targetWidth = clampPageRenderWidth(displayWidth * Math.max(1, contentScale) * (window.devicePixelRatio || 1));
  const renderKey = String(targetWidth);
  const cached = entry.pages.get(pageNumber);
  if (cached?.rendering || (cached?.canvas && cached.renderKey === renderKey)) return;
  const pageEntry: PdfPageCacheEntry = cached ?? {
    widthPt: firstKnownPage(entry)?.widthPt ?? DEFAULT_PAGE_WIDTH,
    heightPt: firstKnownPage(entry)?.heightPt ?? DEFAULT_PAGE_HEIGHT,
    canvas: null,
    renderKey: '',
    rendering: false,
    error: false,
  };
  pageEntry.rendering = true;
  pageEntry.error = false;
  entry.pages.set(pageNumber, pageEntry);

  void entry.document.getPage(pageNumber)
    .then((page) => {
      const baseViewport = page.getViewport({ scale: 1 });
      const renderScale = targetWidth / Math.max(1, baseViewport.width);
      const viewport = page.getViewport({ scale: renderScale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.ceil(viewport.width));
      canvas.height = Math.max(1, Math.ceil(viewport.height));
      const pageCtx = canvas.getContext('2d');
      if (!pageCtx) throw new Error('PDF page canvas is unavailable');
      pageCtx.fillStyle = '#fff';
      pageCtx.fillRect(0, 0, canvas.width, canvas.height);
      return page.render({ canvas, viewport }).promise.then(() => {
        pageEntry.widthPt = baseViewport.width;
        pageEntry.heightPt = baseViewport.height;
        pageEntry.canvas = canvas;
        pageEntry.renderKey = renderKey;
      });
    })
    .then(() => {
      pageEntry.rendering = false;
      requestRender();
    })
    .catch(() => {
      pageEntry.rendering = false;
      pageEntry.error = true;
      requestRender();
    });
}

function drawPdfPage(
  ctx: CanvasRenderingContext2D,
  rect: NodeContentRect,
  pageNumber: number,
  page: PdfPageCacheEntry | undefined,
  fileName: string,
  theme: CanvasTheme,
) {
  ctx.save();
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = theme.nodeBorder;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(rect.x, rect.y, rect.w, rect.h, theme.nodeControlRadius);
  ctx.fill();
  if (page?.canvas) {
    ctx.drawImage(page.canvas, rect.x, rect.y, rect.w, rect.h);
  } else {
    drawPdfPagePlaceholder(ctx, rect, pageNumber, page?.error ? 'Could not render page' : 'Rendering page', fileName, theme);
  }
  ctx.stroke();
  ctx.restore();
}

function drawPdfMessage(ctx: CanvasRenderingContext2D, rect: NodeContentRect, message: string, theme: CanvasTheme) {
  const text = nodeText(theme);
  const lines = wrapText(ctx, message, Math.max(0, rect.w), 3);
  drawNodeBodyLines(ctx, rect, lines, theme, {
    y: rect.y,
    color: theme.mutedText,
    font: text.label,
  });
}

function drawPdfPagePlaceholder(
  ctx: CanvasRenderingContext2D,
  rect: NodeContentRect,
  pageNumber: number,
  message: string,
  fileName: string,
  theme: CanvasTheme,
) {
  const text = nodeText(theme);
  const label = `Page ${pageNumber}`;
  ctx.fillStyle = theme.headerText;
  ctx.font = text.titleSmall;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(label, rect.x + 14, rect.y + 14);
  ctx.fillStyle = theme.mutedText;
  ctx.font = text.label;
  ctx.fillText(message, rect.x + 14, rect.y + 14 + theme.nodeBodyLineHeight);
  if (fileName) ctx.fillText(fileName, rect.x + 14, rect.y + 14 + theme.nodeBodyLineHeight * 2);
}

function firstKnownPage(entry: Extract<PdfDocumentCacheEntry, { status: 'ready' }>): PdfPageCacheEntry | null {
  for (const page of entry.pages.values()) {
    if (page.widthPt > 0 && page.heightPt > 0) return page;
  }
  return null;
}

function rectsIntersect(a: NodeContentRect, b: NodeContentRect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function clampPageRenderWidth(value: number): number {
  return Math.min(MAX_PAGE_RENDER_WIDTH, Math.max(MIN_PAGE_RENDER_WIDTH, Math.ceil(value)));
}
