import { asString } from '../core/nodeData';
import { DEFAULT_TEXT_STYLE, normalizeTextStyle, type TextStyle } from './textStyle';
import type { JsonObject } from './types';

export type TextNodeData = {
  text: string;
  style: TextStyle;
} & JsonObject;

export function normalizeTextNodeData(raw: JsonObject): TextNodeData {
  return {
    text: asString(raw.text, ''),
    style: normalizeTextStyle(raw.style, DEFAULT_TEXT_STYLE),
  };
}
