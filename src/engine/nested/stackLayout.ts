import type { CSSProperties } from 'react';
import type { CanvasDocumentCollection, CanvasDocumentId, StackFrame } from '../documentTypes';

export const STACK_MAX_VISIBLE_ANCESTORS = 2;
export const STACK_PARENT_SCALE = 0.82;
export const STACK_GRANDPARENT_SCALE = 0.68;
export const STACK_PARENT_OFFSET = { x: -48, y: 36 };
export const STACK_GRANDPARENT_OFFSET = { x: -86, y: 68 };
export const STACK_PARENT_OPACITY = 0.38;
export const STACK_GRANDPARENT_OPACITY = 0.22;

export function visibleStackFrames(collection: CanvasDocumentCollection): StackFrame[] {
  const activeIndex = collection.view.stackPath.findIndex((frame) => frame.canvasId === collection.activeCanvasId);
  if (activeIndex <= 0) return [];
  return collection.view.stackPath.slice(Math.max(0, activeIndex - STACK_MAX_VISIBLE_ANCESTORS), activeIndex).reverse();
}

export function stackPlaneStyle(frame: StackFrame, stageRect: DOMRect): CSSProperties {
  const activeDepth = Math.max(0, frame.depth);
  const isParent = activeDepth > 0;
  const scale = isParent ? STACK_PARENT_SCALE : STACK_GRANDPARENT_SCALE;
  const offset = isParent ? STACK_PARENT_OFFSET : STACK_GRANDPARENT_OFFSET;
  const opacity = isParent ? STACK_PARENT_OPACITY : STACK_GRANDPARENT_OPACITY;
  return {
    position: 'absolute',
    left: 0,
    top: 0,
    width: stageRect.width,
    height: stageRect.height,
    transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
    transformOrigin: 'center center',
    opacity,
    zIndex: isParent ? 1 : 0,
  };
}

export function activePlaneStyle(stageRect: DOMRect): CSSProperties {
  return {
    position: 'absolute',
    left: 0,
    top: 0,
    width: stageRect.width,
    height: stageRect.height,
    transform: 'translate(0, 0) scale(1)',
    transformOrigin: 'center center',
    opacity: 1,
    zIndex: 3,
  };
}

export function portalPathHighlight(collection: CanvasDocumentCollection): { canvasId: CanvasDocumentId; nodeId: string }[] {
  return collection.view.stackPath
    .filter((frame) => frame.parentNodeId)
    .map((frame) => ({ canvasId: frame.parentCanvasId ?? collection.rootCanvasId, nodeId: frame.parentNodeId as string }));
}
