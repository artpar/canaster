import { asString } from '../../../core/nodeData';
import { defineNodeType } from '../nodeDefinition/defineNodeType';
import { createInlineTextarea } from '../inlineEditorDom';
import type { JsonObject } from '../../../core/nodePrimitives';
import { drawNodeBodyLines, nodeLayout, wrapText } from '../nodeRendering';
import { nodeTypeSpecs } from '../nodeDefinition/nodeTypeSpecs';
import type { NodeDefinition } from '../nodeDefinition/nodeDefinitionTypes';

type TextNodeData = {
  text: string;
} & JsonObject;

export const textNodeDefinition: NodeDefinition<TextNodeData> = defineNodeType({
  ...nodeTypeSpecs.text,
  createDefaultData() {
    return { text: '' };
  },
  parseData(raw) {
    return { text: asString(raw.text, '') };
  },
  render({ ctx, data, theme, contentRect, state }) {
    const layout = nodeLayout(theme);
    if (state.quality === 'compact' && !state.selected && !state.hovered) return;

    const text = data.text.trim() ? data.text : 'Empty note';
    const lines = wrapText(ctx, text, Math.max(0, contentRect.w - layout.insetX * 2), Math.max(1, Math.floor(contentRect.h / layout.bodyLineHeight)));
    drawNodeBodyLines(ctx, contentRect, lines, theme, { y: contentRect.y + layout.titleY });
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
  getInteractionRegions({ contentRect }) {
    return [{
      id: 'body',
      rect: { ...contentRect },
      cursor: 'text',
      label: 'note',
    }];
  },
  createInteraction(ctx) {
    if (ctx.region.id !== 'body') return null;
    return createInlineTextarea({
      mount: ctx.mount,
      className: 'node-inline-text-editor',
      value: ctx.data.text,
      placeholder: 'Write note',
      ariaLabel: 'Edit note',
      commit: (value) => ctx.requestCommit({ ...ctx.data, text: value }, 'pointer'),
      close: ctx.requestClose,
    });
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
