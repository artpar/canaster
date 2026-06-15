import { BuiltInNodeTypes, type TextNodeData } from '../types';
import { asString } from './data';
import { clipText, drawTypeBadge, wrapText } from './rendering';
import type { NodeDefinition } from './types';

export const textNodeDefinition: NodeDefinition<TextNodeData> = {
  type: BuiltInNodeTypes.text,
  displayName: 'Text',
  defaultSize: { w: 240, h: 140 },
  minSize: { w: 140, h: 76 },
  createDefaultData() {
    return { text: '' };
  },
  parseData(raw) {
    return { text: asString(raw.text, '') };
  },
  render({ ctx, data, theme, contentRect, state }) {
    ctx.fillStyle = theme.headerText;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    if (state.quality === 'compact') {
      ctx.font = '600 10px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText('TEXT', contentRect.x, contentRect.y);
      ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText(clipText(ctx, firstLine(data.text) || 'Empty text', Math.max(0, contentRect.w - 4)), contentRect.x, contentRect.y + 18);
      return;
    }

    ctx.font = '14px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    const text = data.text.trim() ? data.text : 'Empty text';
    const lines = wrapText(ctx, text, Math.max(0, contentRect.w - 8), Math.max(1, Math.floor((contentRect.h - 26) / 18)));
    let y = contentRect.y + 2;
    for (const line of lines) {
      ctx.fillText(line, contentRect.x + 4, y);
      y += 18;
    }
    drawTypeBadge(ctx, contentRect, 'TEXT', theme);
  },
  describe({ node, data }) {
    const label = clipPlainText(firstLine(data.text), 60) || 'Empty text node';
    return {
      label,
      roleDescription: 'Text',
      details: [`${lineCount(data.text)} line${lineCount(data.text) === 1 ? '' : 's'}`, `size ${Math.round(node.w)}x${Math.round(node.h)}`],
      state: [],
      actions: [],
    };
  },
};

function firstLine(text: string) {
  return text.split(/\r?\n/).find((line) => line.trim())?.trim() ?? '';
}

function lineCount(text: string) {
  if (!text) return 0;
  return text.split(/\r?\n/).length;
}

function clipPlainText(text: string, maxLength: number) {
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}
