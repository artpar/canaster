import type { JsonObject, JsonValue, NodeData } from './nodePrimitives';

export function asString(value: unknown, fallback: string) {
  return typeof value === 'string' ? value : fallback;
}

export function asNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function asNullableString(value: unknown) {
  return typeof value === 'string' ? value : null;
}

export function asEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T) {
  return typeof value === 'string' && allowed.includes(value as T) ? (value as T) : fallback;
}

export function asJsonObject(value: unknown): JsonObject {
  return isPlainJsonObject(value) ? value : {};
}

export function cloneNodeData<T extends NodeData>(data: T): T {
  assertJsonValue(data);
  return JSON.parse(JSON.stringify(data)) as T;
}

export function assertJsonValue(value: unknown): asserts value is JsonValue {
  const seen = new Set<unknown>();
  assertJsonValueInner(value, '$', seen);
}

function assertJsonValueInner(value: unknown, path: string, seen: Set<unknown>) {
  if (value === null) return;
  if (typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${path} is not a finite JSON number`);
    return;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new Error(`${path} is a circular JSON value`);
    seen.add(value);
    for (let i = 0; i < value.length; i++) assertJsonValueInner(value[i], `${path}[${i}]`, seen);
    seen.delete(value);
    return;
  }
  if (isPlainJsonObject(value)) {
    if (seen.has(value)) throw new Error(`${path} is a circular JSON value`);
    seen.add(value);
    for (const [key, child] of Object.entries(value)) {
      if (child === undefined) throw new Error(`${path}.${key} is undefined and not JSON-serializable`);
      assertJsonValueInner(child, `${path}.${key}`, seen);
    }
    seen.delete(value);
    return;
  }
  throw new Error(`${path} is not JSON-serializable`);
}

function isPlainJsonObject(value: unknown): value is JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
