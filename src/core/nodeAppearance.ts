import type { CanvasNode, CanvasNodeAppearance } from './nodePrimitives';

export const DEFAULT_NODE_CONTENT_SCALE = 1;
export const MIN_NODE_CONTENT_SCALE = 0.25;
export const MAX_NODE_CONTENT_SCALE = 4;

export function contentScaleForNode(node: CanvasNode): number {
  return normalizeNodeContentScale(node.appearance?.contentScale);
}

export function normalizeNodeContentScale(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_NODE_CONTENT_SCALE;
  return clampNodeContentScale(value);
}

export function nodeAppearanceWithTheme(appearance: CanvasNodeAppearance | undefined, themeId: string | null): CanvasNodeAppearance | undefined {
  return normalizeNodeAppearance({
    ...cloneNodeAppearance(appearance),
    themeId,
  });
}

export function nodeAppearanceWithContentScale(appearance: CanvasNodeAppearance | undefined, contentScale: number): CanvasNodeAppearance | undefined {
  return normalizeNodeAppearance({
    ...cloneNodeAppearance(appearance),
    contentScale,
  });
}

export function cloneNodeAppearance(appearance: CanvasNodeAppearance | undefined): CanvasNodeAppearance | undefined {
  return normalizeNodeAppearance(appearance);
}

function normalizeNodeAppearance(appearance: CanvasNodeAppearance | undefined): CanvasNodeAppearance | undefined {
  const themeId = typeof appearance?.themeId === 'string' && appearance.themeId.trim() ? appearance.themeId : null;
  const contentScale = normalizeNodeContentScale(appearance?.contentScale);
  if (!themeId && contentScale === DEFAULT_NODE_CONTENT_SCALE) return undefined;
  return {
    ...(themeId ? { themeId } : {}),
    ...(contentScale !== DEFAULT_NODE_CONTENT_SCALE ? { contentScale } : {}),
  };
}

function clampNodeContentScale(value: number): number {
  return Math.min(MAX_NODE_CONTENT_SCALE, Math.max(MIN_NODE_CONTENT_SCALE, Math.round(value * 100) / 100));
}
