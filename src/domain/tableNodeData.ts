import { asString } from '../core/nodeData';
import type { JsonObject } from './types';

export const MAX_TABLE_COLUMNS = 6;
export const MAX_TABLE_ROWS = 50;

export type TableNodeData = {
  title: string;
  columns: string[];
  rows: string[][];
} & JsonObject;

export function normalizeTableNodeData(raw: JsonObject): TableNodeData {
  const columns = parseTableColumns(raw.columns);
  return {
    title: asString(raw.title, 'Table'),
    columns,
    rows: parseTableRows(raw.rows, columns.length),
  };
}

export function tableRowsFromText(text: string, columnCount: number): string[][] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, MAX_TABLE_ROWS)
    .map((line) => parseTableTextRow(line, columnCount));
}

function parseTableColumns(value: unknown): string[] {
  if (!Array.isArray(value)) return ['Item', 'Owner', 'Status'];
  const columns = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, MAX_TABLE_COLUMNS);
  return columns.length ? columns : ['Item'];
}

function parseTableRows(value: unknown, columnCount: number): string[][] {
  if (!Array.isArray(value)) return [];
  const rows: string[][] = [];
  for (const rawRow of value) {
    if (!Array.isArray(rawRow)) continue;
    rows.push(rawRow.slice(0, columnCount).map((cell) => (typeof cell === 'string' ? cell : '')));
    if (rows.length >= MAX_TABLE_ROWS) break;
  }
  return rows;
}

function parseTableTextRow(line: string, columnCount: number): string[] {
  const cells = line.includes('\t') ? line.split('\t') : line.split(',');
  return Array.from({ length: columnCount }, (_, index) => cells[index]?.trim() ?? '');
}
