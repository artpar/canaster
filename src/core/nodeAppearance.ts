import type { CanvasNode, CanvasNodeAppearance } from './nodePrimitives';

export const DEFAULT_NODE_CONTENT_SCALE = 1;
export const DEFAULT_NODE_CONTENT_OFFSET = 0;
export const MIN_NODE_CONTENT_SCALE = 0.25;
export const MAX_NODE_CONTENT_SCALE = 4;

export type NodeContentViewport = {
  scale: number;
  offsetX: number;
  offsetY: number;
};

export function contentScaleForNode(node: CanvasNode): number {
  return contentViewportForNode(node).scale;
}

export function contentViewportForNode(node: CanvasNode): NodeContentViewport {
  return normalizeNodeContentViewport(node.appearance);
}

export function normalizeNodeContentScale(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_NODE_CONTENT_SCALE;
  return clampNodeContentScale(value);
}

export function normalizeNodeContentOffset(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_NODE_CONTENT_OFFSET;
  return roundNodeContentOffset(value);
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

export function nodeAppearanceWithContentOffset(appearance: CanvasNodeAppearance | undefined, offsetX: number, offsetY: number): CanvasNodeAppearance | undefined {
  return normalizeNodeAppearance({
    ...cloneNodeAppearance(appearance),
    contentOffsetX: offsetX,
    contentOffsetY: offsetY,
  });
}

export function nodeAppearanceWithContentViewport(appearance: CanvasNodeAppearance | undefined, viewport: NodeContentViewport): CanvasNodeAppearance | undefined {
  return normalizeNodeAppearance({
    ...cloneNodeAppearance(appearance),
    contentScale: viewport.scale,
    contentOffsetX: viewport.offsetX,
    contentOffsetY: viewport.offsetY,
  });
}

export function cloneNodeAppearance(appearance: CanvasNodeAppearance | undefined): CanvasNodeAppearance | undefined {
  return normalizeNodeAppearance(appearance);
}

function normalizeNodeAppearance(appearance: CanvasNodeAppearance | undefined): CanvasNodeAppearance | undefined {
  const themeId = typeof appearance?.themeId === 'string' && appearance.themeId.trim() ? appearance.themeId : null;
  const { scale, offsetX, offsetY } = normalizeNodeContentViewport(appearance);
  if (!themeId && scale === DEFAULT_NODE_CONTENT_SCALE && offsetX === DEFAULT_NODE_CONTENT_OFFSET && offsetY === DEFAULT_NODE_CONTENT_OFFSET) return undefined;
  return {
    ...(themeId ? { themeId } : {}),
    ...(scale !== DEFAULT_NODE_CONTENT_SCALE ? { contentScale: scale } : {}),
    ...(offsetX !== DEFAULT_NODE_CONTENT_OFFSET ? { contentOffsetX: offsetX } : {}),
    ...(offsetY !== DEFAULT_NODE_CONTENT_OFFSET ? { contentOffsetY: offsetY } : {}),
  };
}

function normalizeNodeContentViewport(appearance: CanvasNodeAppearance | undefined): NodeContentViewport {
  return {
    scale: normalizeNodeContentScale(appearance?.contentScale),
    offsetX: normalizeNodeContentOffset(appearance?.contentOffsetX),
    offsetY: normalizeNodeContentOffset(appearance?.contentOffsetY),
  };
}

function clampNodeContentScale(value: number): number {
  return Math.min(MAX_NODE_CONTENT_SCALE, Math.max(MIN_NODE_CONTENT_SCALE, Math.round(value * 100) / 100));
}

function roundNodeContentOffset(value: number): number {
  const rounded = Math.round(value * 100) / 100;
  return Math.abs(rounded) < 0.005 ? DEFAULT_NODE_CONTENT_OFFSET : rounded;
}
