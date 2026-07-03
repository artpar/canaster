import { BuiltInNodeTypes } from '../BuiltInNodeTypes';
import { normalizeTextNodeData, type TextNodeData } from '../textNodeData';
import { DEFAULT_TEXT_STYLE } from '../textStyle';
import type { NodeSemanticDefinition } from './NodeSemanticDefinition';

export const textNodeSemanticDefinition: NodeSemanticDefinition<TextNodeData> = {
  type: BuiltInNodeTypes.text,
  createDefaultData() {
    return { text: '', style: DEFAULT_TEXT_STYLE };
  },
  parseData(raw) {
    return normalizeTextNodeData(raw);
  },
  describe({ data }) {
    return {
      label: clipPlainText(firstLine(data.text), 60) || 'Empty note',
      roleDescription: 'Note',
      details: [`${lineCount(data.text)} line${lineCount(data.text) === 1 ? '' : 's'}`],
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
