import { asEnum, asString } from '../core/nodeData';
import type { JsonObject } from './types';

export type CardAccent = 'task' | 'data' | 'system';

export type CardNodeData = {
  title: string;
  detail: string;
  accent: CardAccent;
} & JsonObject;

export const CARD_ACCENTS: readonly CardAccent[] = ['task', 'data', 'system'];

export function normalizeCardNodeData(raw: JsonObject): CardNodeData {
  return {
    title: asString(raw.title, 'Untitled work item'),
    detail: asString(raw.detail, ''),
    accent: asEnum(raw.accent, CARD_ACCENTS, 'task'),
  };
}

export function cardAccentLabel(accent: CardAccent) {
  switch (accent) {
    case 'task':
      return 'Task';
    case 'data':
      return 'Data';
    case 'system':
      return 'System';
  }
}
