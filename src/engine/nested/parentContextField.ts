import { cloneNode } from '../documentModel';
import { BuiltInNodeTypes, type CanvasPortalNodeData } from '../types';
import type {
  CanvasDocumentCollection,
  ParentContextFieldShape,
  ParentContextFieldState,
  ParentContextRegion,
} from '../documentTypes';

export const FIELD_BORDER_BAND = 112;

const REGION_ORDER: ParentContextRegion[] = ['top', 'top-right', 'right', 'bottom-right', 'bottom', 'bottom-left', 'left', 'top-left'];

export function buildParentContextField(collection: CanvasDocumentCollection, stageRect: DOMRect): ParentContextFieldState {
  const active = collection.documents[collection.activeCanvasId];
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
      const region = regionForContextVector(dx, dy);
      const detail = detailForDistance(distance);
      const portalData = node.type === BuiltInNodeTypes.canvas ? (node.data as CanvasPortalNodeData) : null;
      const shape = {
        region,
        parentCanvasId: parent.id,
        node: cloneNode(node),
        distance,
        projectedRect: paneRectForRegion(region, stageRect),
        childCanvasId: portalData?.childCanvasId ?? null,
        opacity: 0.22 + detail * 0.58,
        detail,
        portal: node.type === BuiltInNodeTypes.canvas,
      };
      const previous = nearestByRegion.get(region);
      if (!previous || shape.distance < previous.distance) nearestByRegion.set(region, shape);
    });

  const shapes = [...nearestByRegion.values()]
    .sort((a, b) => REGION_ORDER.indexOf(a.region) - REGION_ORDER.indexOf(b.region) || b.detail - a.detail);

  return { sourceCanvasId: parent.id, sourcePortalNodeId: source.id, shapes };
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

function paneRectForRegion(region: ParentContextRegion, stageRect: DOMRect) {
  const width = Math.max(1, stageRect.width);
  const height = Math.max(1, stageRect.height);
  const band = Math.min(FIELD_BORDER_BAND, Math.max(64, Math.min(width, height) * 0.2), width / 3, height / 3);
  const centerW = Math.max(1, width - band * 2);
  const centerH = Math.max(1, height - band * 2);

  if (region === 'top') return { x: band, y: 0, w: centerW, h: band };
  if (region === 'right') return { x: width - band, y: band, w: band, h: centerH };
  if (region === 'bottom') return { x: band, y: height - band, w: centerW, h: band };
  if (region === 'left') return { x: 0, y: band, w: band, h: centerH };
  if (region === 'top-right') return { x: width - band, y: 0, w: band, h: band };
  if (region === 'bottom-right') return { x: width - band, y: height - band, w: band, h: band };
  if (region === 'bottom-left') return { x: 0, y: height - band, w: band, h: band };
  return { x: 0, y: 0, w: band, h: band };
}

function detailForDistance(distance: number) {
  return clamp(1 / (1 + distance / 520), 0.26, 0.92);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
