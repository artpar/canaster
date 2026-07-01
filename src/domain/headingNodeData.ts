import { asEnum, asString } from '../core/nodeData';
import type { JsonObject } from './types';

export const HEADING_NODE_LEVELS = ['section', 'subsection'] as const;

export type HeadingNodeLevel = (typeof HEADING_NODE_LEVELS)[number];

export type HeadingNodeData = {
  title: string;
  subtitle: string;
  level: HeadingNodeLevel;
} & JsonObject;

export function normalizeHeadingNodeData(raw: JsonObject): HeadingNodeData {
  return {
    title: asString(raw.title, 'Heading'),
    subtitle: asString(raw.subtitle, ''),
    level: asEnum(raw.level, HEADING_NODE_LEVELS, 'section'),
  };
}

export function headingNodeLevelLabel(level: HeadingNodeLevel) {
  switch (level) {
    case 'section':
      return 'Section';
    case 'subsection':
      return 'Subsection';
  }
}
