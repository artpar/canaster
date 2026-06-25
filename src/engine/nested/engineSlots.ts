import { CanvasEngine } from '../CanvasEngine';
import type { CanvasDocumentCollection, CanvasDocumentId, EngineMode, EngineSlotId } from '../documentTypes';
import type { PortalLayout, ScreenRect } from '../types';

export const MAX_LIVE_PORTAL_PREVIEWS = 8;
export const MAX_CONTEXT_ENGINES = 2;
export const MAX_TOTAL_ENGINES = 11;
export const MIN_PORTAL_PREVIEW_W = 4;
export const MIN_PORTAL_PREVIEW_H = 4;
export const PORTAL_PREVIEW_MAX_FPS = 20;
export const CONTEXT_ENGINE_MAX_FPS = 10;
export const ACTIVE_ENGINE_FRAME_BUDGET_MS = 16;
export const PREVIEW_TOTAL_FRAME_BUDGET_MS = 10;

export type EngineSlot = {
  id: EngineSlotId;
  canvasId: CanvasDocumentId;
  mode: EngineMode;
  canvas: HTMLCanvasElement;
  engine: CanvasEngine;
  rect: ScreenRect;
  zIndex: number;
};

export function engineSlotId(canvasId: CanvasDocumentId, mode: EngineMode, ownerId = 'stage'): EngineSlotId {
  return `${mode}:${ownerId}:${canvasId}`;
}

export function livePortalSlotsFor(
  collection: CanvasDocumentCollection,
  activeLayouts: PortalLayout[],
  limit = MAX_LIVE_PORTAL_PREVIEWS,
  viewport: ScreenRect | null = null,
): PortalLayout[] {
  return activeLayouts
    .filter((layout) => layout.childCanvasId && collection.documents[layout.childCanvasId] && isPortalLiveRenderable(layout, viewport))
    .sort((a, b) => {
      const visibleAreaDelta = visibleScreenArea(b.screenRect, viewport) - visibleScreenArea(a.screenRect, viewport);
      if (visibleAreaDelta !== 0) return visibleAreaDelta;
      return screenArea(b.screenRect) - screenArea(a.screenRect);
    })
    .slice(0, limit);
}

export function isPortalLiveRenderable(layout: PortalLayout, viewport: ScreenRect | null = null): boolean {
  return layout.visible && visibleScreenWidth(layout.screenRect, viewport) >= MIN_PORTAL_PREVIEW_W && visibleScreenHeight(layout.screenRect, viewport) >= MIN_PORTAL_PREVIEW_H;
}

function visibleScreenArea(rect: ScreenRect, viewport: ScreenRect | null): number {
  return visibleScreenWidth(rect, viewport) * visibleScreenHeight(rect, viewport);
}

function visibleScreenWidth(rect: ScreenRect, viewport: ScreenRect | null): number {
  if (!viewport) return Math.max(0, rect.w);
  const left = Math.max(rect.x, viewport.x);
  const right = Math.min(rect.x + rect.w, viewport.x + viewport.w);
  return Math.max(0, right - left);
}

function visibleScreenHeight(rect: ScreenRect, viewport: ScreenRect | null): number {
  if (!viewport) return Math.max(0, rect.h);
  const top = Math.max(rect.y, viewport.y);
  const bottom = Math.min(rect.y + rect.h, viewport.y + viewport.h);
  return Math.max(0, bottom - top);
}

function screenArea(rect: ScreenRect): number {
  return Math.max(0, rect.w) * Math.max(0, rect.h);
}

export function disposeRemovedSlots(previous: Map<EngineSlotId, EngineSlot>, nextIds: Set<EngineSlotId>): void {
  for (const [id, slot] of previous) {
    if (!nextIds.has(id)) {
      slot.engine.dispose();
      previous.delete(id);
    }
  }
}
