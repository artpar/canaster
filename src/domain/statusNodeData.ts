import { asEnum, asString } from '../core/nodeData';
import type { JsonObject } from './types';

export const STATUS_NODE_VALUES = ['not-started', 'in-progress', 'blocked', 'done'] as const;

export type StatusNodeValue = (typeof STATUS_NODE_VALUES)[number];

export type StatusNodeData = {
  title: string;
  status: StatusNodeValue;
  owner: string;
  dueDate: string;
  detail: string;
} & JsonObject;

export function normalizeStatusNodeData(raw: JsonObject): StatusNodeData {
  return {
    title: asString(raw.title, 'Status'),
    status: asEnum(raw.status, STATUS_NODE_VALUES, 'not-started'),
    owner: asString(raw.owner, ''),
    dueDate: asString(raw.dueDate, ''),
    detail: asString(raw.detail, ''),
  };
}

export function statusNodeLabel(status: StatusNodeValue) {
  switch (status) {
    case 'not-started':
      return 'Not started';
    case 'in-progress':
      return 'In progress';
    case 'blocked':
      return 'Blocked';
    case 'done':
      return 'Done';
  }
}
