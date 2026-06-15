import { CanvasEngine } from '../CanvasEngine';
import type { CanvasDocumentCollection, CanvasDocumentId, EngineMode, EngineSlotId } from '../documentTypes';
import type { PortalLayout, ScreenRect } from '../types';

export const MAX_LIVE_PORTAL_PREVIEWS = 8;
export const MAX_CONTEXT_ENGINES = 2;
export const MAX_TOTAL_ENGINES = 11;
export const MIN_PORTAL_PREVIEW_W = 96;
export const MIN_PORTAL_PREVIEW_H = 72;
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

export function livePortalSlotsFor(collection: CanvasDocumentCollection, activeLayouts: PortalLayout[]): PortalLayout[] {
  return activeLayouts
    .filter((layout) => layout.childCanvasId && collection.documents[layout.childCanvasId] && isPortalLiveRenderable(layout))
    .sort((a, b) => b.screenRect.w * b.screenRect.h - a.screenRect.w * a.screenRect.h)
    .slice(0, MAX_LIVE_PORTAL_PREVIEWS);
}

export function isPortalLiveRenderable(layout: PortalLayout): boolean {
  return layout.visible && layout.screenRect.w >= MIN_PORTAL_PREVIEW_W && layout.screenRect.h >= MIN_PORTAL_PREVIEW_H;
}

export function disposeRemovedSlots(previous: Map<EngineSlotId, EngineSlot>, nextIds: Set<EngineSlotId>): void {
  for (const [id, slot] of previous) {
    if (!nextIds.has(id)) {
      slot.engine.dispose();
      previous.delete(id);
    }
  }
}
