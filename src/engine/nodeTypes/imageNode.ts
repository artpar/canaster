import { BuiltInNodeTypes, type ImageNodeData } from '../types';
import { asEnum, asNullableString, asString } from './data';
import { clipText, drawPlaceholderIcon, drawTypeBadge, wrapText } from './rendering';
import type { NodeDefinition } from './types';

const IMAGE_FITS = ['contain', 'cover'] as const;

export const imageNodeDefinition: NodeDefinition<ImageNodeData> = {
  type: BuiltInNodeTypes.image,
  displayName: 'Image placeholder',
  defaultSize: { w: 280, h: 180 },
  minSize: { w: 140, h: 96 },
  createDefaultData() {
    return { src: null, alt: '', fit: 'contain' };
  },
  parseData(raw) {
    return {
      src: asNullableString(raw.src),
      alt: asString(raw.alt, ''),
      fit: asEnum(raw.fit, IMAGE_FITS, 'contain'),
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
    drawPlaceholderIcon(ctx, frame, 'IMAGE');

    ctx.fillStyle = theme.bodyText;
    ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const status = data.src ? 'Image source set; preview loading not implemented yet.' : 'No image source';
    const lines = wrapText(ctx, status, Math.max(0, contentRect.w - 8), 2);
    let y = contentRect.y + Math.max(0, contentRect.h - 42);
    for (const line of lines) {
      ctx.fillText(line, contentRect.x + 4, y);
      y += 15;
    }
    if (data.src) {
      ctx.fillStyle = theme.mutedText;
      ctx.fillText(clipText(ctx, data.src, Math.max(0, contentRect.w - 8)), contentRect.x + 4, y);
    }
    drawTypeBadge(ctx, contentRect, 'IMAGE', theme);
  },
  describe({ node, data }) {
    return {
      label: data.alt || 'Image node',
      roleDescription: 'Image',
      details: [
        data.src ? 'source set' : 'no source',
        data.src ? 'preview loading not implemented yet' : 'no preview',
        `fit ${data.fit}`,
        `size ${Math.round(node.w)}x${Math.round(node.h)}`,
      ],
      state: [],
      actions: [],
    };
  },
};
