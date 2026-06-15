import { cloneNode } from '../documentModel';
import { BuiltInNodeTypes, type CanvasPortalNodeData } from '../types';
import type {
  CanvasDocumentCollection,
  ParentContextFieldShape,
  ParentContextFieldState,
  ParentContextRegion,
} from '../documentTypes';

export const FIELD_BORDER_BAND = 112;
export const FIELD_MIN_SHAPE = 64;
export const FIELD_MAX_SHAPE_W = 220;
export const FIELD_MAX_SHAPE_H = 150;

const REGION_ORDER: ParentContextRegion[] = ['top', 'top-right', 'right', 'bottom-right', 'bottom', 'bottom-left', 'left', 'top-left'];

export function buildParentContextField(collection: CanvasDocumentCollection, stageRect: DOMRect): ParentContextFieldState {
  const active = collection.documents[collection.activeCanvasId];
  if (!active?.parentCanvasId || !active.parentNodeId) return { sourceCanvasId: null, sourcePortalNodeId: null, shapes: [] };

  const parent = collection.documents[active.parentCanvasId];
  const source = parent?.model.nodes.find((node) => node.id === active.parentNodeId);
  if (!parent || !source) return { sourceCanvasId: null, sourcePortalNodeId: null, shapes: [] };

  const sourceCenter = { x: source.x + source.w / 2, y: source.y + source.h / 2 };
  const shapes = parent.model.nodes
    .filter((node) => node.id !== source.id)
    .map((node): ParentContextFieldShape => {
      const dx = node.x + node.w / 2 - sourceCenter.x;
      const dy = node.y + node.h / 2 - sourceCenter.y;
      const distance = Math.hypot(dx, dy);
      const region = regionForContextVector(dx, dy);
      const detail = detailForDistance(distance);
      const projectedRect = projectNodeToBorder({ dx, dy, nodeW: node.w, nodeH: node.h, region, detail, stageRect });
      const portalData = node.type === BuiltInNodeTypes.canvas ? (node.data as CanvasPortalNodeData) : null;
      return {
        region,
        parentCanvasId: parent.id,
        node: cloneNode(node),
        distance,
        projectedRect,
        childCanvasId: portalData?.childCanvasId ?? null,
        opacity: 0.22 + detail * 0.58,
        detail,
        portal: node.type === BuiltInNodeTypes.canvas,
      };
    })
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

function projectNodeToBorder({
  dx,
  dy,
  nodeW,
  nodeH,
  region,
  detail,
  stageRect,
}: {
  dx: number;
  dy: number;
  nodeW: number;
  nodeH: number;
  region: ParentContextRegion;
  detail: number;
  stageRect: DOMRect;
}) {
  const band = Math.min(FIELD_BORDER_BAND, Math.max(56, Math.min(stageRect.width, stageRect.height) * 0.18));
  const centerX = stageRect.width / 2;
  const centerY = stageRect.height / 2;
  const compression = 0.18 + detail * 0.22;
  const w = clamp(nodeW * (0.28 + detail * 0.36), FIELD_MIN_SHAPE, FIELD_MAX_SHAPE_W);
  const h = clamp(nodeH * (0.28 + detail * 0.36), FIELD_MIN_SHAPE, FIELD_MAX_SHAPE_H);
  const xAlong = clamp(centerX + dx * compression - w / 2, band * 0.45, stageRect.width - band * 0.45 - w);
  const yAlong = clamp(centerY + dy * compression - h / 2, band * 0.45, stageRect.height - band * 0.45 - h);
  const flatH = Math.max(FIELD_MIN_SHAPE, h * 0.72);
  const flatW = Math.max(FIELD_MIN_SHAPE, w * 0.72);

  if (region === 'top') return { x: xAlong, y: -flatH * 0.18, w, h: flatH };
  if (region === 'bottom') return { x: xAlong, y: stageRect.height - flatH * 0.82, w, h: flatH };
  if (region === 'left') return { x: -flatW * 0.18, y: yAlong, w: flatW, h };
  if (region === 'right') return { x: stageRect.width - flatW * 0.82, y: yAlong, w: flatW, h };

  const cornerX = region.includes('left') ? -w * 0.14 : stageRect.width - w * 0.86;
  const cornerY = region.includes('top') ? -h * 0.14 : stageRect.height - h * 0.86;
  const spreadX = clamp(Math.abs(dx) * compression * 0.22, 0, band * 0.42);
  const spreadY = clamp(Math.abs(dy) * compression * 0.22, 0, band * 0.42);
  return {
    x: region.includes('left') ? cornerX + spreadX : cornerX - spreadX,
    y: region.includes('top') ? cornerY + spreadY : cornerY - spreadY,
    w,
    h,
  };
}

function detailForDistance(distance: number) {
  return clamp(1 / (1 + distance / 520), 0.26, 0.92);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
