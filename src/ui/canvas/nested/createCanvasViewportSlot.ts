import { CanvasEngine } from '../CanvasEngine';
import type { CanvasDocumentId } from '../../../domain/documentTypes';
import type { EngineInteractionMode } from '../../../domain/types';
import type { CanvasEngineOptions } from '../CanvasEngineOptions';
import { createCanvasViewportToolbar, type CanvasViewportControl, type CanvasViewportToolbarControlEvent } from './createCanvasViewportToolbar';

export type { CanvasViewportControl };

export type CanvasViewportSlot = {
  key: string;
  canvasId: CanvasDocumentId;
  mode: EngineInteractionMode;
  wrapper: HTMLDivElement;
  viewport: HTMLDivElement;
  center: HTMLDivElement;
  canvas: HTMLCanvasElement;
  childOverlayLayer: HTMLDivElement;
  parentContextField: HTMLDivElement | null;
  resizers: HTMLDivElement | null;
  controls: HTMLDivElement | null;
  engine: CanvasEngine;
};

export type CanvasViewportControlEvent = CanvasViewportToolbarControlEvent;

export type CanvasViewportSlotOptions = {
  key: string;
  canvasId: CanvasDocumentId;
  mode: EngineInteractionMode;
  ariaLabel: string;
  canvasClassName: string;
  wrapperClassName: string;
  viewportClassName: string;
  controls: CanvasViewportControl[];
  engineOptions: CanvasEngineOptions;
  includePaneLayers?: boolean;
  onControl?: (slot: CanvasViewportSlot, control: CanvasViewportControl, event: CanvasViewportControlEvent) => void;
};

export function createCanvasViewportSlot(options: CanvasViewportSlotOptions): CanvasViewportSlot {
  const wrapper = document.createElement('div');
  wrapper.className = options.wrapperClassName;
  wrapper.dataset.canvasId = options.canvasId;
  wrapper.dataset.canvasViewportMode = options.mode;

  const viewport = document.createElement('div');
  viewport.className = options.viewportClassName;
  viewport.dataset.canvasId = options.canvasId;
  viewport.dataset.canvasViewportMode = options.mode;

  const center = document.createElement('div');
  center.className = 'nested-center-cell canvas-viewport-center';

  const canvas = document.createElement('canvas');
  canvas.className = options.canvasClassName;
  canvas.dataset.engineMode = options.mode;
  canvas.setAttribute('aria-label', options.ariaLabel);

  const childOverlayLayer = document.createElement('div');
  childOverlayLayer.className = 'portal-overlays';

  const parentContextField = options.includePaneLayers ? document.createElement('div') : null;
  if (parentContextField) {
    parentContextField.className = 'parent-context-field native-parent-context-field';
    parentContextField.setAttribute('aria-label', 'Nested parent canvas context');
  }

  const resizers = options.includePaneLayers ? document.createElement('div') : null;
  if (resizers) {
    resizers.className = 'parent-context-resizers native-resizers';
    resizers.setAttribute('aria-label', 'Resize nested panes');
  }

  const controls = options.controls.length
    ? createCanvasViewportToolbar({
      controls: options.controls,
      onControl: (control, event) => options.onControl?.(slot, control, event),
      recursiveLongPress: true,
    })
    : null;
  center.append(canvas);
  const engine = new CanvasEngine(canvas, {
    ...options.engineOptions,
    canvasId: options.canvasId,
    interactionMode: options.mode,
  });
  const slot: CanvasViewportSlot = {
    key: options.key,
    canvasId: options.canvasId,
    mode: options.mode,
    wrapper,
    viewport,
    center,
    canvas,
    childOverlayLayer,
    parentContextField,
    resizers,
    controls,
    engine,
  };

  center.append(childOverlayLayer);
  viewport.append(center);
  if (parentContextField) viewport.append(parentContextField);
  if (resizers) viewport.append(resizers);
  if (controls) viewport.append(controls);
  wrapper.append(viewport);
  return slot;
}
