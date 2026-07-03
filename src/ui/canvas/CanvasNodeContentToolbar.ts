import type { CanvasCommand, CanvasNode, ScreenRect } from '../../domain/types';
import {
  createCanvasViewportToolbar,
  setCanvasViewportToolbarVisible,
  type CanvasViewportControl,
} from './nested/createCanvasViewportToolbar';

const NODE_CONTENT_ZOOM_FACTOR = 1.22;
const NODE_CONTENT_TOOLBAR_INSET = 8;

export type CanvasNodeContentToolbarHost = {
  executeCommand(command: CanvasCommand): boolean;
  isBlocked(): boolean;
  targetNode(): CanvasNode | null;
  targetNodeIds(nodeId: string): string[];
  worldToScreenRect(rect: { x: number; y: number; w: number; h: number }): ScreenRect;
};

export class CanvasNodeContentToolbar {
  readonly element: HTMLDivElement;

  private targetNodeId: string | null = null;

  constructor(private readonly host: CanvasNodeContentToolbarHost) {
    this.element = createCanvasViewportToolbar({
      controls: ['fit', 'zoom-out', 'reset-zoom', 'zoom-in'],
      ariaLabel: 'Panel content viewport',
      controlLabels: {
        fit: 'Center panel content',
        'reset-zoom': 'Reset panel content zoom',
        'zoom-in': 'Zoom panel content in',
        'zoom-out': 'Zoom panel content out',
      },
      onControl: (control) => this.handleControl(control),
    });
    this.element.classList.add('node-content-zoom-controls');
    this.hide();
  }

  sync(): void {
    const node = this.host.targetNode();
    this.targetNodeId = node?.id ?? null;
    if (!node || this.host.isBlocked()) {
      this.hide();
      return;
    }

    this.element.style.display = '';
    const panelRect = this.host.worldToScreenRect(node);
    const toolbarRect = this.element.getBoundingClientRect();
    const width = toolbarRect.width || 96;
    const height = toolbarRect.height || 28;
    const left = Math.max(
      panelRect.x + NODE_CONTENT_TOOLBAR_INSET,
      panelRect.x + panelRect.w - width - NODE_CONTENT_TOOLBAR_INSET,
    );
    const top = Math.max(
      panelRect.y + NODE_CONTENT_TOOLBAR_INSET,
      panelRect.y + panelRect.h - height - NODE_CONTENT_TOOLBAR_INSET,
    );
    this.element.style.left = `${left}px`;
    this.element.style.top = `${top}px`;
    setCanvasViewportToolbarVisible(this.element, true);
  }

  private hide(): void {
    setCanvasViewportToolbarVisible(this.element, false);
    this.element.style.display = 'none';
  }

  private handleControl(control: CanvasViewportControl): void {
    if (!this.targetNodeId) return;
    const nodeIds = this.host.targetNodeIds(this.targetNodeId);
    if (!nodeIds.length) return;
    if (control === 'fit') {
      this.host.executeCommand({ type: 'reset-selection-content-pan', nodeIds, source: 'pointer' });
      return;
    }
    if (control === 'zoom-in') {
      this.host.executeCommand({ type: 'scale-selection-content', factor: NODE_CONTENT_ZOOM_FACTOR, nodeIds, source: 'pointer' });
      return;
    }
    if (control === 'zoom-out') {
      this.host.executeCommand({ type: 'scale-selection-content', factor: 1 / NODE_CONTENT_ZOOM_FACTOR, nodeIds, source: 'pointer' });
      return;
    }
    if (control === 'reset-zoom') {
      this.host.executeCommand({ type: 'reset-selection-content-scale', nodeIds, source: 'pointer' });
    }
  }
}
