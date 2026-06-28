import { cloneNode } from '../../../domain/documentModel';
import { portalInfoForNode } from '../nodeRegistry';
import type { CanvasNode } from '../../../domain/types';
import type {
  CanvasDocumentCollection,
  ParentContextPaneLayout,
  ParentContextFieldShape,
  ParentContextFieldState,
  ParentContextRegion,
} from '../../../domain/documentTypes';

export const FIELD_BORDER_BAND = 112;
export const FIELD_MIN_BORDER_BAND = 24;
export const FIELD_MIN_CENTER_BAND = 72;
export const EMBEDDED_FIELD_CENTER_RATIO = 0.8;
export const EMBEDDED_FIELD_MIN_BORDER_BAND = 8;
export const EMBEDDED_FIELD_MIN_CENTER_BAND = 32;

export const PARENT_CONTEXT_REGIONS: ParentContextRegion[] = ['top', 'top-right', 'right', 'bottom-right', 'bottom', 'bottom-left', 'left', 'top-left'];

export type { ParentContextPaneLayout } from '../../../domain/documentTypes';

export type ParentContextPaneLayoutConstraints = {
  minPaneBand?: number;
  minCenterBand?: number;
};

export const DEFAULT_PARENT_CONTEXT_PANE_LAYOUT: ParentContextPaneLayout = {
  left: FIELD_BORDER_BAND,
  right: FIELD_BORDER_BAND,
  top: FIELD_BORDER_BAND,
  bottom: FIELD_BORDER_BAND,
};

type ContextNodeGeometry = Pick<CanvasNode, 'x' | 'y' | 'w' | 'h'>;

export function buildParentContextField(
  collection: CanvasDocumentCollection,
  stageRect: DOMRect,
  canvasId = collection.activeCanvasId,
  paneLayout: ParentContextPaneLayout = DEFAULT_PARENT_CONTEXT_PANE_LAYOUT,
  paneLayoutConstraints: ParentContextPaneLayoutConstraints = {},
): ParentContextFieldState {
  const active = collection.documents[canvasId];
  if (!active?.parentCanvasId || !active.parentNodeId) return { sourceCanvasId: null, sourcePortalNodeId: null, shapes: [] };

  const parent = collection.documents[active.parentCanvasId];
  const source = parent?.model.nodes.find((node) => node.id === active.parentNodeId);
  if (!parent || !source) return { sourceCanvasId: null, sourcePortalNodeId: null, shapes: [] };

  const sourceCenter = { x: source.x + source.w / 2, y: source.y + source.h / 2 };
  const nearestByRegion = new Map<ParentContextRegion, ParentContextFieldShape>();

  parent.model.nodes
    .filter((node) => node.id !== source.id)
    .forEach((node) => {
      const dx = node.x + node.w / 2 - sourceCenter.x;
      const dy = node.y + node.h / 2 - sourceCenter.y;
      const distance = Math.hypot(dx, dy);
      const region = parentContextRegionForNode(source, node);
      const detail = detailForDistance(distance);
      const portal = portalInfoForNode(node);
      const shape = {
        region,
        parentCanvasId: parent.id,
        node: cloneNode(node),
        distance,
        projectedRect: paneRectForRegion(region, stageRect, paneLayout, paneLayoutConstraints),
        childCanvasId: portal?.childCanvasId ?? null,
        opacity: 0.22 + detail * 0.58,
        detail,
        portal: Boolean(portal),
      };
      const previous = nearestByRegion.get(region);
      if (!previous || shape.distance < previous.distance) nearestByRegion.set(region, shape);
    });

  const shapes = [...nearestByRegion.values()]
    .sort((a, b) => PARENT_CONTEXT_REGIONS.indexOf(a.region) - PARENT_CONTEXT_REGIONS.indexOf(b.region) || b.detail - a.detail);

  return { sourceCanvasId: parent.id, sourcePortalNodeId: source.id, shapes };
}

export function parentContextRegionForNode(source: ContextNodeGeometry, node: ContextNodeGeometry): ParentContextRegion {
  return regionForContextVector(node.x + node.w / 2 - (source.x + source.w / 2), node.y + node.h / 2 - (source.y + source.h / 2));
}

export function normalizeParentContextPaneLayout(
  stageRect: DOMRect,
  layout: ParentContextPaneLayout,
  constraints: ParentContextPaneLayoutConstraints = {},
): ParentContextPaneLayout {
  const width = Math.max(1, stageRect.width);
  const height = Math.max(1, stageRect.height);
  const minPaneBand = constraints.minPaneBand ?? FIELD_MIN_BORDER_BAND;
  const minCenterBand = constraints.minCenterBand ?? FIELD_MIN_CENTER_BAND;
  const minPaneX = Math.min(minPaneBand, Math.max(1, width / 4));
  const minPaneY = Math.min(minPaneBand, Math.max(1, height / 4));
  const minCenterX = Math.min(minCenterBand, Math.max(1, width - minPaneX * 2));
  const minCenterY = Math.min(minCenterBand, Math.max(1, height - minPaneY * 2));
  const left = clamp(layout.left, minPaneX, Math.max(minPaneX, width - minPaneX - minCenterX));
  const right = clamp(layout.right, minPaneX, Math.max(minPaneX, width - left - minCenterX));
  const top = clamp(layout.top, minPaneY, Math.max(minPaneY, height - minPaneY - minCenterY));
  const bottom = clamp(layout.bottom, minPaneY, Math.max(minPaneY, height - top - minCenterY));
  return { left, right, top, bottom };
}

export function paneLayoutForCenterRatio(
  stageRect: DOMRect,
  centerRatio: number,
  constraints: ParentContextPaneLayoutConstraints = {},
): ParentContextPaneLayout {
  const width = Math.max(1, stageRect.width);
  const height = Math.max(1, stageRect.height);
  const outerRatio = (1 - clamp(centerRatio, 0.1, 0.98)) / 2;
  return normalizeParentContextPaneLayout(
    stageRect,
    {
      left: width * outerRatio,
      right: width * outerRatio,
      top: height * outerRatio,
      bottom: height * outerRatio,
    },
    constraints,
  );
}

export function regionForContextVector(dx: number, dy: number): ParentContextRegion {
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  if (angle >= -22.5 && angle < 22.5) return 'right';
  if (angle >= 22.5 && angle < 67.5) return 'bottom-right';
  if (angle >= 67.5 && angle < 112.5) return 'bottom';
  if (angle >= 112.5 && angle < 157.5) return 'bottom-left';
  if ((angle >= 157.5 && angle <= 180) || (angle >= -180 && angle < -157.5)) return 'left';
  if (angle >= -157.5 && angle < -112.5) return 'top-left';
  if (angle >= -112.5 && angle < -67.5) return 'top';
  return 'top-right';
}

export function parentContextRegionLabel(region: ParentContextRegion): string {
  return region.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

export function paneRectForRegion(
  region: ParentContextRegion,
  stageRect: DOMRect,
  paneLayout: ParentContextPaneLayout,
  paneLayoutConstraints: ParentContextPaneLayoutConstraints,
) {
  const width = Math.max(1, stageRect.width);
  const height = Math.max(1, stageRect.height);
  const layout = normalizeParentContextPaneLayout(stageRect, paneLayout, paneLayoutConstraints);
  const centerW = Math.max(1, width - layout.left - layout.right);
  const centerH = Math.max(1, height - layout.top - layout.bottom);
  const rightX = width - layout.right;
  const bottomY = height - layout.bottom;

  if (region === 'top') return { x: layout.left, y: 0, w: centerW, h: layout.top };
  if (region === 'right') return { x: rightX, y: layout.top, w: layout.right, h: centerH };
  if (region === 'bottom') return { x: layout.left, y: bottomY, w: centerW, h: layout.bottom };
  if (region === 'left') return { x: 0, y: layout.top, w: layout.left, h: centerH };
  if (region === 'top-right') return { x: rightX, y: 0, w: layout.right, h: layout.top };
  if (region === 'bottom-right') return { x: rightX, y: bottomY, w: layout.right, h: layout.bottom };
  if (region === 'bottom-left') return { x: 0, y: bottomY, w: layout.left, h: layout.bottom };
  return { x: 0, y: 0, w: layout.left, h: layout.top };
}

function detailForDistance(distance: number) {
  return clamp(1 / (1 + distance / 520), 0.26, 0.92);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
