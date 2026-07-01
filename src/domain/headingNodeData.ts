import { asString } from '../core/nodeData';
import type { JsonObject } from './types';

export type HeadingNodeData = {
  title: string;
} & JsonObject;

export function normalizeHeadingNodeData(raw: JsonObject): HeadingNodeData {
  return {
    title: asString(raw.title, 'Heading'),
  };
}
