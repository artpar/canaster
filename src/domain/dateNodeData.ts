import { asString } from '../core/nodeData';
import type { JsonObject } from './types';

export type DateNodeData = {
  title: string;
  date: string;
  time: string;
  place: string;
  note: string;
} & JsonObject;

export function normalizeDateNodeData(raw: JsonObject): DateNodeData {
  return {
    title: asString(raw.title, 'Date'),
    date: asString(raw.date, ''),
    time: asString(raw.time, ''),
    place: asString(raw.place, ''),
    note: asString(raw.note, ''),
  };
}

export function dateNodeDateLabel(date: string) {
  if (!date.trim()) return 'No date set';
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(parsed);
}
