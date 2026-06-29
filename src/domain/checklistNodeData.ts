import { asString } from '../core/nodeData';
import type { JsonObject } from './types';

export const MAX_CHECKLIST_ITEMS = 100;

export type ChecklistNodeItem = {
  id: string;
  text: string;
  checked: boolean;
} & JsonObject;

export type ChecklistNodeData = {
  title: string;
  items: ChecklistNodeItem[];
} & JsonObject;

export function normalizeChecklistNodeData(raw: JsonObject): ChecklistNodeData {
  return {
    title: asString(raw.title, 'Checklist'),
    items: parseChecklistItems(raw.items),
  };
}

export function addChecklistItem(data: ChecklistNodeData, text: string): ChecklistNodeData {
  const cleanText = text.trim();
  if (!cleanText || data.items.length >= MAX_CHECKLIST_ITEMS) return data;
  return {
    ...data,
    items: [...data.items, { id: nextChecklistItemId(data.items), text: cleanText, checked: false }],
  };
}

export function removeChecklistItem(data: ChecklistNodeData, itemId: string): ChecklistNodeData {
  const items = data.items.filter((item) => item.id !== itemId);
  return items.length === data.items.length ? data : { ...data, items };
}

export function setChecklistItemChecked(data: ChecklistNodeData, itemId: string, checked: boolean): ChecklistNodeData {
  let changed = false;
  const items = data.items.map((item) => {
    if (item.id !== itemId || item.checked === checked) return item;
    changed = true;
    return { ...item, checked };
  });
  return changed ? { ...data, items } : data;
}

export function setChecklistItemText(data: ChecklistNodeData, itemId: string, text: string): ChecklistNodeData {
  let changed = false;
  const items = data.items.map((item) => {
    if (item.id !== itemId || item.text === text) return item;
    changed = true;
    return { ...item, text };
  });
  return changed ? { ...data, items } : data;
}

export function parseChecklistItems(value: unknown): ChecklistNodeItem[] {
  if (!Array.isArray(value)) return [];
  const parsed: ChecklistNodeItem[] = [];
  for (let index = 0; index < value.length && parsed.length < MAX_CHECKLIST_ITEMS; index += 1) {
    const item = parseChecklistItem(value[index], index);
    if (item) parsed.push(item);
  }
  return parsed;
}

function parseChecklistItem(value: unknown, index: number): ChecklistNodeItem | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as JsonObject;
  const text = typeof raw.text === 'string' ? raw.text : null;
  if (text === null) return null;
  const rawId = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : `item-${index + 1}`;
  return {
    id: rawId,
    text,
    checked: typeof raw.checked === 'boolean' ? raw.checked : false,
  };
}

function nextChecklistItemId(items: ChecklistNodeItem[]) {
  const ids = new Set(items.map((item) => item.id));
  let counter = items.length + 1;
  let id = `item-${counter}`;
  while (ids.has(id)) id = `item-${++counter}`;
  return id;
}
