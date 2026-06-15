import type { CSSProperties } from 'react';
import type { PortalLayout } from '../types';

export function normalizePortalLayout(layout: PortalLayout, stageRect: DOMRect): PortalLayout {
  const x = Math.round(layout.screenRect.x);
  const y = Math.round(layout.screenRect.y);
  const w = Math.round(layout.screenRect.w);
  const h = Math.round(layout.screenRect.h);
  return {
    ...layout,
    screenRect: { x, y, w, h },
    visible: layout.visible && x + w >= 0 && y + h >= 0 && x <= stageRect.width && y <= stageRect.height,
  };
}

export function portalOverlayStyle(layout: PortalLayout): CSSProperties {
  return {
    position: 'absolute',
    left: layout.screenRect.x,
    top: layout.screenRect.y,
    width: layout.screenRect.w,
    height: layout.screenRect.h,
    overflow: 'hidden',
    borderRadius: 6,
    pointerEvents: 'none',
  };
}

export function portalActivationOverlayStyle(layout: PortalLayout): CSSProperties {
  return {
    position: 'absolute',
    left: layout.screenRect.x,
    top: layout.screenRect.y,
    width: layout.screenRect.w,
    height: layout.screenRect.h,
    borderRadius: 6,
    pointerEvents: 'auto',
  };
}

export function visiblePortalLayoutsForCanvas(layouts: PortalLayout[]): PortalLayout[] {
  return layouts.filter((layout) => layout.visible);
}
