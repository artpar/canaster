import { normalizeTextNodeData, type TextNodeData } from '../../../domain/textNodeData';
import { DEFAULT_TEXT_STYLE } from '../../../domain/textStyle';
import { drawStyledTextBlock } from '../../textStyle/drawStyledTextBlock';
import { resolveTextStyleForTheme } from '../../textStyle/textStyleTheme';
import { defineNodeType } from '../nodeDefinition/defineNodeType';
import { nodeTypeSpecs } from '../nodeDefinition/nodeTypeSpecs';
import type { NodeDefinition } from '../nodeDefinition/nodeDefinitionTypes';

export const textNodeDefinition: NodeDefinition<TextNodeData> = defineNodeType({
  ...nodeTypeSpecs.text,
  createDefaultData() {
    return { text: '', style: DEFAULT_TEXT_STYLE };
  },
  parseData(raw) {
    return normalizeTextNodeData(raw);
  },
  render({ ctx, data, theme, contentRect, state }) {
    if (state.quality === 'compact' && !state.selected && !state.hovered) return;

    const text = data.text.trim() ? data.text : 'Empty note';
    drawStyledTextBlock(ctx, contentRect, text, resolveTextStyleForTheme(theme, data.style));
  },
  describe({ data }) {
    const label = clipPlainText(firstLine(data.text), 60) || 'Empty note';
    return {
      label,
      roleDescription: 'Note',
      details: [`${lineCount(data.text)} line${lineCount(data.text) === 1 ? '' : 's'}`],
      state: [],
      actions: [],
    };
  },
});

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
