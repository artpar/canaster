import { CanvasEngine } from '../CanvasEngine';
import type { CanvasDocumentId } from '../../../domain/documentTypes';
import type { EngineInteractionMode, EngineOptions, ScreenRect } from '../../../domain/types';

export type CanvasViewportControl = 'arrange' | 'fit' | 'zoom-in' | 'zoom-out';

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

export type CanvasViewportControlEvent = {
  anchor: ScreenRect;
  recursive: boolean;
};

export type CanvasViewportSlotOptions = {
  key: string;
  canvasId: CanvasDocumentId;
  mode: EngineInteractionMode;
  ariaLabel: string;
  canvasClassName: string;
  wrapperClassName: string;
  viewportClassName: string;
  controls: CanvasViewportControl[];
  engineOptions: EngineOptions;
  includePaneLayers?: boolean;
  onControl?: (slot: CanvasViewportSlot, control: CanvasViewportControl, event: CanvasViewportControlEvent) => void;
};

const controlLabels: Record<CanvasViewportControl, string> = {
  arrange: 'Arrange canvas panels',
  fit: 'Center map',
  'zoom-in': 'Zoom in',
  'zoom-out': 'Zoom out',
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

  const controls = options.controls.length ? createViewportControls(options.controls) : null;
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

  center.append(canvas, childOverlayLayer);
  viewport.append(center);
  if (parentContextField) viewport.append(parentContextField);
  if (resizers) viewport.append(resizers);
  if (controls) {
    wireViewportControls(slot, controls, options.onControl);
    viewport.append(controls);
  }
  wrapper.append(viewport);
  return slot;
}

function createViewportControls(controls: CanvasViewportControl[]): HTMLDivElement {
  const group = document.createElement('div');
  group.className = 'canvas-viewport-controls';
  group.setAttribute('aria-label', 'Canvas controls');
  for (const control of controls) group.append(createViewportControlButton(control));
  return group;
}

function createViewportControlButton(control: CanvasViewportControl): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'icon-button canvas-viewport-control-button';
  button.type = 'button';
  button.dataset.control = control;
  button.setAttribute('aria-label', controlLabels[control]);
  button.title = controlLabels[control];
  button.append(createViewportControlIcon(control));
  return button;
}

function createViewportControlIcon(control: CanvasViewportControl): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '17');
  svg.setAttribute('height', '17');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  for (const d of iconPathsFor(control)) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

function iconPathsFor(control: CanvasViewportControl): string[] {
  if (control === 'arrange') return ['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M14 14h7v7h-7z', 'M3 14h7v7H3z'];
  if (control === 'fit') return ['M15 3h6v6', 'M9 21H3v-6', 'M21 3l-7 7', 'M3 21l7-7'];
  if (control === 'zoom-in') return ['M5 12h14', 'M12 5v14'];
  return ['M5 12h14'];
}

function wireViewportControls(
  slot: CanvasViewportSlot,
  controls: HTMLDivElement,
  onControl: CanvasViewportSlotOptions['onControl'],
): void {
  controls.addEventListener('pointerdown', stopViewportControlEvent);
  controls.addEventListener('dblclick', stopViewportControlEvent);
  controls.addEventListener('contextmenu', stopViewportControlEvent);
  controls.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>('[data-control]');
    const control = parseViewportControl(button?.dataset.control);
    if (!button || !control) return;
    onControl?.(slot, control, {
      anchor: rectToScreenRect(button.getBoundingClientRect()),
      recursive: event.metaKey || event.ctrlKey,
    });
  });
}

function parseViewportControl(value: string | undefined): CanvasViewportControl | null {
  if (value === 'arrange' || value === 'fit' || value === 'zoom-in' || value === 'zoom-out') return value;
  return null;
}

function rectToScreenRect(rect: DOMRect): ScreenRect {
  return { x: rect.x, y: rect.y, w: rect.width, h: rect.height };
}

function stopViewportControlEvent(event: Event): void {
  event.preventDefault();
  event.stopPropagation();
}
