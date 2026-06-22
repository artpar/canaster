import { BuiltInNodeTypes, type ImageNodeData } from '../types';
import { asEnum, asNullableString, asString } from './data';
import { cachedAssetImage } from './imageAssets';
import { clipText, drawPlaceholderIcon, drawTypeBadge, wrapText } from './rendering';
import type { NodeDefinition } from './types';

const IMAGE_FITS = ['contain', 'cover'] as const;

export const imageNodeDefinition: NodeDefinition<ImageNodeData> = {
  type: BuiltInNodeTypes.image,
  displayName: 'Image',
  defaultSize: { w: 280, h: 180 },
  minSize: { w: 140, h: 96 },
  createDefaultData() {
    return { assetId: null, alt: '', fit: 'contain', caption: '' };
  },
  parseData(raw) {
    return {
      assetId: asNullableString(raw.assetId),
      alt: asString(raw.alt, ''),
      fit: asEnum(raw.fit, IMAGE_FITS, 'contain'),
      caption: asString(raw.caption, ''),
    };
  },
  render({ ctx, data, theme, contentRect, state }) {
    ctx.strokeStyle = theme.nodeBorder;
    ctx.fillStyle = theme.mutedText;

    if (state.quality === 'compact') {
      drawPlaceholderIcon(ctx, { x: contentRect.x, y: contentRect.y + 8, w: contentRect.w, h: Math.max(0, contentRect.h - 26) }, 'IMAGE');
      drawTypeBadge(ctx, contentRect, 'IMAGE', theme);
      return;
    }

    const frame = { x: contentRect.x + 4, y: contentRect.y + 4, w: Math.max(0, contentRect.w - 8), h: Math.max(0, contentRect.h - 48) };
    const cached = cachedAssetImage(data.assetId);
    if (cached) {
      drawImage(ctx, cached, frame, data.fit);
    } else {
      drawPlaceholderIcon(ctx, frame, data.assetId ? 'LOADING' : 'IMAGE');
    }

    ctx.fillStyle = theme.bodyText;
    ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const status = cached ? (data.caption || data.alt || 'Image reference') : data.assetId ? 'Loading image' : 'Add an image source';
    const lines = wrapText(ctx, status, Math.max(0, contentRect.w - 8), 2);
    let y = contentRect.y + Math.max(0, contentRect.h - 42);
    for (const line of lines) {
      ctx.fillText(line, contentRect.x + 4, y);
      y += 15;
    }
    if (data.assetId) {
      ctx.fillStyle = theme.mutedText;
      ctx.fillText(clipText(ctx, data.alt || 'Image reference', Math.max(0, contentRect.w - 8)), contentRect.x + 4, y);
    }
    drawTypeBadge(ctx, contentRect, 'IMAGE', theme);
  },
  describe({ data }) {
    return {
      label: data.alt || 'Image',
      roleDescription: 'Image',
      details: [
        data.assetId ? 'Image added' : 'No image source',
        data.fit === 'cover' ? 'Fills the frame' : 'Fits inside the frame',
      ],
      state: [],
      actions: [],
    };
  },
};

function drawImage(ctx: CanvasRenderingContext2D, image: HTMLImageElement, frame: { x: number; y: number; w: number; h: number }, fit: 'contain' | 'cover') {
  if (frame.w <= 0 || frame.h <= 0 || image.naturalWidth <= 0 || image.naturalHeight <= 0) return;
  const scale = fit === 'cover'
    ? Math.max(frame.w / image.naturalWidth, frame.h / image.naturalHeight)
    : Math.min(frame.w / image.naturalWidth, frame.h / image.naturalHeight);
  const w = image.naturalWidth * scale;
  const h = image.naturalHeight * scale;
  const x = frame.x + (frame.w - w) / 2;
  const y = frame.y + (frame.h - h) / 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(frame.x, frame.y, frame.w, frame.h);
  ctx.clip();
  ctx.drawImage(image, x, y, w, h);
  ctx.restore();
}
