import { textNodeSemanticDefinition } from '../../../domain/nodeDefinitions/textNodeSemanticDefinition';
import type { TextNodeData } from '../../../domain/textNodeData';
import { drawStyledTextBlock } from '../../textStyle/drawStyledTextBlock';
import { resolveTextStyleForTheme } from '../../textStyle/textStyleTheme';
import { defineNodeType } from '../nodeDefinition/defineNodeType';
import { nodeTypeSpecs } from '../nodeDefinition/nodeTypeSpecs';
import type { NodeDefinition } from '../nodeDefinition/nodeDefinitionTypes';

export const textNodeDefinition: NodeDefinition<TextNodeData> = defineNodeType({
  ...nodeTypeSpecs.text,
  createDefaultData: textNodeSemanticDefinition.createDefaultData,
  parseData: textNodeSemanticDefinition.parseData,
  render({ ctx, data, theme, contentRect, state }) {
    if (state.quality === 'compact' && !state.selected && !state.hovered) return;

    const text = data.text.trim() ? data.text : 'Empty note';
    drawStyledTextBlock(ctx, contentRect, text, resolveTextStyleForTheme(theme, data.style));
  },
  describe: textNodeSemanticDefinition.describe,
});
