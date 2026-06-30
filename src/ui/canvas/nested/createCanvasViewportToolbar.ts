import type { ScreenRect } from '../../../domain/types';

export type CanvasViewportControl = 'arrange' | 'fit' | 'reset-zoom' | 'theme' | 'zoom-in' | 'zoom-out';

export type CanvasViewportToolbarControlEvent = {
  anchor: ScreenRect;
  sourceEvent: MouseEvent;
};

export type CanvasViewportToolbarOptions = {
  controls: CanvasViewportControl[];
  onControl?: (control: CanvasViewportControl, event: CanvasViewportToolbarControlEvent) => void;
};

const controlLabels: Record<CanvasViewportControl, string> = {
  arrange: 'Arrange panels',
  fit: 'Center view',
  'reset-zoom': 'Reset view zoom',
  theme: 'Change view theme',
  'zoom-in': 'Zoom in',
  'zoom-out': 'Zoom out',
};

const controlGroups: { label: string; controls: CanvasViewportControl[] }[] = [
  { label: 'View recovery', controls: ['fit', 'reset-zoom'] },
  { label: 'View zoom', controls: ['zoom-out', 'zoom-in'] },
  { label: 'View setup', controls: ['arrange', 'theme'] },
];

const menuControls = new Set<CanvasViewportControl>(['arrange', 'theme']);

export function createCanvasViewportToolbar(options: CanvasViewportToolbarOptions): HTMLDivElement {
  const group = document.createElement('div');
  group.className = 'canvas-viewport-controls';
  group.setAttribute('role', 'toolbar');
  group.setAttribute('aria-label', 'View controls');
  for (const { label, controls } of viewportControlGroups(options.controls)) {
    const rowControls = controls.filter((control) => options.controls.includes(control));
    if (!rowControls.length) continue;
    const row = document.createElement('div');
    row.className = 'canvas-viewport-control-row';
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', label);
    for (const control of rowControls) row.append(createViewportControlButton(control, !options.onControl));
    group.append(row);
  }
  wireViewportControls(group, options.onControl);
  return group;
}

export function setCanvasViewportToolbarControlExpanded(
  toolbar: HTMLDivElement,
  control: CanvasViewportControl,
  expanded: boolean,
): void {
  const button = toolbar.querySelector<HTMLButtonElement>(`[data-control="${control}"]`);
  if (button?.getAttribute('aria-haspopup') === 'menu') button.setAttribute('aria-expanded', String(expanded));
}

export function setCanvasViewportToolbarVisible(toolbar: HTMLDivElement, visible: boolean): void {
  toolbar.toggleAttribute('inert', !visible);
  toolbar.setAttribute('aria-hidden', String(!visible));
  for (const button of toolbar.querySelectorAll<HTMLButtonElement>('button')) {
    button.tabIndex = visible ? 0 : -1;
  }
}

function createViewportControlButton(control: CanvasViewportControl, disabled: boolean): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'icon-button canvas-viewport-control-button';
  button.type = 'button';
  button.dataset.control = control;
  button.disabled = disabled;
  button.setAttribute('aria-label', controlLabels[control]);
  button.title = controlLabels[control];
  if (menuControls.has(control)) {
    button.setAttribute('aria-haspopup', 'menu');
    button.setAttribute('aria-expanded', 'false');
  }
  button.append(createViewportControlIcon(control));
  return button;
}

function viewportControlGroups(controls: CanvasViewportControl[]): { label: string; controls: CanvasViewportControl[] }[] {
  const knownControls = new Set(controlGroups.flatMap((group) => group.controls));
  const unknownControls = controls.filter((control) => !knownControls.has(control));
  if (!unknownControls.length) return controlGroups;
  return [...controlGroups, { label: 'Other view controls', controls: unknownControls }];
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
  if (control === 'reset-zoom') return ['M3 3v5h5', 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8'];
  if (control === 'theme') return ['M12 22a10 10 0 1 1 10-10c0 1.7-1.3 3-3 3h-1.4c-.9 0-1.6.7-1.6 1.6 0 .5.2.9.5 1.2.3.3.5.7.5 1.2 0 1.7-2.2 3-5 3z', 'M7.5 10.5h.01', 'M10.5 7.5h.01', 'M14.5 7.5h.01', 'M16.5 10.5h.01'];
  if (control === 'zoom-in') return ['M5 12h14', 'M12 5v14'];
  return ['M5 12h14'];
}

function wireViewportControls(
  controls: HTMLDivElement,
  onControl: CanvasViewportToolbarOptions['onControl'],
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
    onControl?.(control, {
      anchor: rectToScreenRect(button.getBoundingClientRect()),
      sourceEvent: event,
    });
  });
}

function parseViewportControl(value: string | undefined): CanvasViewportControl | null {
  if (value === 'arrange' || value === 'fit' || value === 'reset-zoom' || value === 'theme' || value === 'zoom-in' || value === 'zoom-out') return value;
  return null;
}

function rectToScreenRect(rect: DOMRect): ScreenRect {
  return { x: rect.x, y: rect.y, w: rect.width, h: rect.height };
}

function stopViewportControlEvent(event: Event): void {
  event.preventDefault();
  event.stopPropagation();
}
