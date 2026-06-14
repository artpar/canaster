import { THEMES, type CanvasTheme } from './theme';
import type {
  Camera,
  CanvasModel,
  CanvasModelChange,
  CanvasNode,
  EngineOptions,
  ThemeName,
  ViewportStatus,
  WorldPoint,
} from './types';

const MIN_SCALE = 0.08;
const MAX_SCALE = 4;
const MAX_DPR = 2;
const GRID_STEP = 32;
const NODE_RADIUS = 8;
const RESIZE_HANDLE = 12;
const MIN_NODE_W = 140;
const MIN_NODE_H = 76;
const CULL_MARGIN_SCREEN = 96;

type DragState =
  | { mode: 'pan'; pointerId: number; sx: number; sy: number; camX: number; camY: number; moved: boolean }
  | {
      mode: 'node';
      pointerId: number;
      node: CanvasNode;
      dx: number;
      dy: number;
      moved: boolean;
      original: NodeGeometry;
    }
  | { mode: 'resize'; pointerId: number; node: CanvasNode; ox: number; oy: number; moved: boolean; original: NodeGeometry }
  | null;

type SetModelOptions = {
  preserveInteraction?: boolean;
};

type VisibleWorldBounds = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

type NodeGeometry = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export class CanvasEngine {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly onStatus?: (status: ViewportStatus) => void;
  private readonly onModelChange?: (model: CanvasModel, change: CanvasModelChange) => void;
  private readonly resizeObserver: ResizeObserver;

  private model: CanvasModel = { nodes: [] };
  private theme: CanvasTheme = THEMES.dark;
  private camera: Camera = { x: 0, y: 0, scale: 1 };
  private selectedNodeId: string | null = null;
  private hoverNodeId: string | null = null;
  private cursorWorld: WorldPoint | null = null;
  private drag: DragState = null;
  private dpr = 1;
  private viewW = 1;
  private viewH = 1;
  private dirty = true;
  private frameQueued = false;
  private statusFrame: number | null = null;
  private lastRenderedNodes = 0;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement, options: EngineOptions = {}) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context is not available');

    this.canvas = canvas;
    this.ctx = ctx;
    this.onStatus = options.onStatus;
    this.onModelChange = options.onModelChange;
    this.resizeObserver = new ResizeObserver(() => this.resize());

    this.canvas.tabIndex = -1;
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointercancel', this.onPointerCancel);
    this.canvas.addEventListener('lostpointercapture', this.onLostPointerCapture);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('blur', this.onWindowBlur);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.canvas.addEventListener('dblclick', this.onDoubleClick);
    this.resizeObserver.observe(this.canvas);
    this.resize();
    this.emitStatus();
  }

  dispose() {
    this.disposed = true;
    if (this.statusFrame !== null) cancelAnimationFrame(this.statusFrame);
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointercancel', this.onPointerCancel);
    this.canvas.removeEventListener('lostpointercapture', this.onLostPointerCapture);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('blur', this.onWindowBlur);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('dblclick', this.onDoubleClick);
  }

  setModel(model: CanvasModel, options: SetModelOptions = {}) {
    const selectedNodeId = options.preserveInteraction ? this.selectedNodeId : null;
    const hoverNodeId = options.preserveInteraction ? this.hoverNodeId : null;
    this.model = { nodes: model.nodes.map((node) => ({ ...node })) };
    this.selectedNodeId = selectedNodeId && this.model.nodes.some((node) => node.id === selectedNodeId) ? selectedNodeId : null;
    this.hoverNodeId = hoverNodeId && this.model.nodes.some((node) => node.id === hoverNodeId) ? hoverNodeId : null;
    this.markDirty();
    this.emitStatus();
  }

  setTheme(name: ThemeName) {
    this.theme = THEMES[name];
    this.markDirty();
  }

  fit(padding = 72) {
    const bounds = this.modelBounds();
    if (!bounds) return;

    const scale = clamp(
      Math.min((this.viewW - padding * 2) / bounds.w, (this.viewH - padding * 2) / bounds.h),
      MIN_SCALE,
      1.5,
    );
    this.camera.scale = scale;
    this.camera.x = (this.viewW - bounds.w * scale) / 2 - bounds.x * scale;
    this.camera.y = (this.viewH - bounds.h * scale) / 2 - bounds.y * scale;
    this.markDirty();
    this.emitStatus();
  }

  resetZoom() {
    this.zoomAt(this.viewW / 2, this.viewH / 2, 1 / this.camera.scale);
  }

  zoomBy(factor: number) {
    this.zoomAt(this.viewW / 2, this.viewH / 2, factor);
  }

  private resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.viewW = Math.max(1, rect.width);
    this.viewH = Math.max(1, rect.height);
    this.dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    this.canvas.width = Math.round(this.viewW * this.dpr);
    this.canvas.height = Math.round(this.viewH * this.dpr);
    this.canvas.dataset.dpr = String(this.dpr);
    this.markDirty();
  }

  private markDirty() {
    this.dirty = true;
    if (this.frameQueued || this.disposed) return;
    this.frameQueued = true;
    requestAnimationFrame(() => this.renderLoop());
  }

  private renderLoop() {
    this.frameQueued = false;
    if (this.disposed || !this.dirty) return;
    this.dirty = false;
    this.render();
  }

  private render() {
    const { ctx, canvas, theme, dpr, camera } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    this.drawGrid();

    ctx.setTransform(dpr * camera.scale, 0, 0, dpr * camera.scale, camera.x * dpr, camera.y * dpr);
    const cullBounds = this.visibleWorldBounds();
    let renderedNodes = 0;
    for (const node of this.model.nodes) {
      if (!intersectsNode(node, cullBounds)) continue;
      this.drawNode(node);
      renderedNodes++;
    }
    this.lastRenderedNodes = renderedNodes;
    this.canvas.dataset.renderedNodes = String(renderedNodes);
    this.canvas.dataset.totalNodes = String(this.model.nodes.length);
    this.emitStatus();
  }

  private drawGrid() {
    const { ctx, canvas, camera, dpr, theme } = this;
    const step = GRID_STEP * camera.scale * dpr;
    if (step < 7) return;

    const ox = positiveModulo(camera.x * dpr, step);
    const oy = positiveModulo(camera.y * dpr, step);
    const majorEvery = 4;
    ctx.lineWidth = 1;

    for (let pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      const major = pass === 1;
      ctx.strokeStyle = major ? theme.gridMajor : theme.grid;
      for (let x = ox, i = 0; x < canvas.width; x += step, i++) {
        if ((i % majorEvery === 0) !== major) continue;
        ctx.moveTo(Math.round(x) + 0.5, 0);
        ctx.lineTo(Math.round(x) + 0.5, canvas.height);
      }
      for (let y = oy, i = 0; y < canvas.height; y += step, i++) {
        if ((i % majorEvery === 0) !== major) continue;
        ctx.moveTo(0, Math.round(y) + 0.5);
        ctx.lineTo(canvas.width, Math.round(y) + 0.5);
      }
      ctx.stroke();
    }
  }

  private drawNode(node: CanvasNode) {
    const { ctx, theme } = this;
    const selected = node.id === this.selectedNodeId;
    const hovered = node.id === this.hoverNodeId;
    const radius = NODE_RADIUS;

    ctx.save();
    ctx.shadowColor = theme.nodeShadow;
    ctx.shadowBlur = selected ? 18 : 12;
    ctx.shadowOffsetY = 6;
    roundRectPath(ctx, node.x, node.y, node.w, node.h, radius);
    ctx.fillStyle = theme.nodeBg;
    ctx.fill();
    ctx.restore();

    roundRectPath(ctx, node.x, node.y, node.w, node.h, radius);
    ctx.strokeStyle = selected ? theme.selected : theme.nodeBorder;
    ctx.lineWidth = selected ? 2.5 : hovered ? 1.8 : 1.2;
    ctx.stroke();

    const accent = theme.kind[node.kind];
    ctx.fillStyle = accent;
    roundRectPath(ctx, node.x + 12, node.y + 12, 28, 6, 3);
    ctx.fill();

    ctx.fillStyle = theme.headerText;
    ctx.font = '600 15px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText(clipText(ctx, node.label, node.w - 56), node.x + 16, node.y + 28);

    ctx.fillStyle = theme.bodyText;
    ctx.font = '13px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    const detailY = node.y + 56;
    const lines = wrapText(ctx, node.detail, node.w - 32, detailLineCapacity(node.h));
    let y = detailY;
    for (const line of lines) {
      ctx.fillText(line, node.x + 16, y);
      y += 18;
    }

    ctx.fillStyle = theme.mutedText;
    ctx.font = '600 10px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(node.kind.toUpperCase(), node.x + 16, node.y + node.h - 24);

    if (selected) {
      const handle = this.resizeHandleRect(node);
      ctx.fillStyle = theme.resizeFill;
      roundRectPath(ctx, handle.x, handle.y, handle.w, handle.h, 3);
      ctx.fill();
    }
  }

  private onPointerDown = (event: PointerEvent) => {
    this.canvas.focus({ preventScroll: true });
    const point = this.eventPoint(event);
    const world = this.screenToWorld(point.x, point.y);
    const selectedNode = this.selectedNode();

    if (selectedNode && this.isInsideResizeHandle(world, selectedNode)) {
      this.drag = {
        mode: 'resize',
        pointerId: event.pointerId,
        node: selectedNode,
        ox: world.x - (selectedNode.x + selectedNode.w),
        oy: world.y - (selectedNode.y + selectedNode.h),
        moved: false,
        original: nodeGeometry(selectedNode),
      };
      this.capturePointer(event.pointerId);
      return;
    }

    const node = this.nodeAt(world);

    if (node) {
      this.selectedNodeId = node.id;
      this.drag = {
        mode: 'node',
        pointerId: event.pointerId,
        node,
        dx: world.x - node.x,
        dy: world.y - node.y,
        moved: false,
        original: nodeGeometry(node),
      };
      this.capturePointer(event.pointerId);
      this.markDirty();
      this.emitStatus();
      return;
    }

    this.selectedNodeId = null;
    this.drag = {
      mode: 'pan',
      pointerId: event.pointerId,
      sx: point.x,
      sy: point.y,
      camX: this.camera.x,
      camY: this.camera.y,
      moved: false,
    };
    this.capturePointer(event.pointerId);
    this.markDirty();
    this.emitStatus();
  };

  private onPointerMove = (event: PointerEvent) => {
    const point = this.eventPoint(event);
    const world = this.screenToWorld(point.x, point.y);
    this.cursorWorld = world;

    if (this.drag && event.pointerId !== this.drag.pointerId) return;

    if (this.drag?.mode === 'node') {
      this.drag.node.x = world.x - this.drag.dx;
      this.drag.node.y = world.y - this.drag.dy;
      this.drag.moved = !sameNodeGeometry(this.drag.node, this.drag.original);
      this.markDirty();
    } else if (this.drag?.mode === 'resize') {
      this.drag.node.w = Math.max(MIN_NODE_W, world.x - this.drag.ox - this.drag.node.x);
      this.drag.node.h = Math.max(MIN_NODE_H, world.y - this.drag.oy - this.drag.node.y);
      this.drag.moved = !sameNodeGeometry(this.drag.node, this.drag.original);
      this.markDirty();
    } else if (this.drag?.mode === 'pan') {
      this.camera.x = this.drag.camX + point.x - this.drag.sx;
      this.camera.y = this.drag.camY + point.y - this.drag.sy;
      this.drag.moved = true;
      this.markDirty();
    } else {
      const node = this.nodeAt(world);
      const hoverId = node?.id ?? null;
      if (hoverId !== this.hoverNodeId) {
        this.hoverNodeId = hoverId;
        this.markDirty();
      }
      this.canvas.style.cursor = this.cursorFor(world, node);
    }

    this.emitStatus();
  };

  private onPointerUp = (event: PointerEvent) => {
    this.finishPointerInteraction(event.pointerId, true);
  };

  private onPointerCancel = (event: PointerEvent) => {
    this.finishPointerInteraction(event.pointerId, false);
  };

  private onLostPointerCapture = (event: PointerEvent) => {
    this.finishPointerInteraction(event.pointerId, false);
  };

  private onWindowBlur = () => {
    this.finishPointerInteraction(null, false);
  };

  private onWheel = (event: WheelEvent) => {
    event.preventDefault();
    const point = this.eventPoint(event);
    const factor = Math.exp(-event.deltaY * 0.0015);
    this.zoomAt(point.x, point.y, factor);
  };

  private onDoubleClick = (event: MouseEvent) => {
    const point = this.eventPoint(event);
    this.zoomAt(point.x, point.y, 1.55);
  };

  private zoomAt(screenX: number, screenY: number, factor: number) {
    const next = clamp(this.camera.scale * factor, MIN_SCALE, MAX_SCALE);
    const k = next / this.camera.scale;
    this.camera.x = screenX - (screenX - this.camera.x) * k;
    this.camera.y = screenY - (screenY - this.camera.y) * k;
    this.camera.scale = next;
    this.markDirty();
    this.emitStatus();
  }

  private screenToWorld(screenX: number, screenY: number): WorldPoint {
    return {
      x: (screenX - this.camera.x) / this.camera.scale,
      y: (screenY - this.camera.y) / this.camera.scale,
    };
  }

  private eventPoint(event: MouseEvent | PointerEvent | WheelEvent): WorldPoint {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  private nodeAt(point: WorldPoint) {
    for (let i = this.model.nodes.length - 1; i >= 0; i--) {
      const node = this.model.nodes[i];
      if (point.x >= node.x && point.x <= node.x + node.w && point.y >= node.y && point.y <= node.y + node.h) {
        return node;
      }
    }
    return null;
  }

  private cursorFor(point: WorldPoint, node: CanvasNode | null) {
    const selectedNode = this.selectedNode();
    if (selectedNode && this.isInsideResizeHandle(point, selectedNode)) return 'nwse-resize';
    return node ? 'grab' : 'default';
  }

  private selectedNode() {
    if (!this.selectedNodeId) return null;
    return this.model.nodes.find((node) => node.id === this.selectedNodeId) ?? null;
  }

  private resizeHandleRect(node: CanvasNode) {
    return {
      x: node.x + node.w - RESIZE_HANDLE - 6,
      y: node.y + node.h - RESIZE_HANDLE - 6,
      w: RESIZE_HANDLE,
      h: RESIZE_HANDLE,
    };
  }

  private isInsideResizeHandle(point: WorldPoint, node: CanvasNode) {
    const rect = this.resizeHandleRect(node);
    return point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h;
  }

  private modelBounds() {
    if (this.model.nodes.length === 0) return null;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const node of this.model.nodes) {
      x0 = Math.min(x0, node.x);
      y0 = Math.min(y0, node.y);
      x1 = Math.max(x1, node.x + node.w);
      y1 = Math.max(y1, node.y + node.h);
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  private visibleWorldBounds(): VisibleWorldBounds {
    const topLeft = this.screenToWorld(0, 0);
    const bottomRight = this.screenToWorld(this.viewW, this.viewH);
    const margin = CULL_MARGIN_SCREEN / this.camera.scale;
    return {
      x0: Math.min(topLeft.x, bottomRight.x) - margin,
      y0: Math.min(topLeft.y, bottomRight.y) - margin,
      x1: Math.max(topLeft.x, bottomRight.x) + margin,
      y1: Math.max(topLeft.y, bottomRight.y) + margin,
    };
  }

  private finishPointerInteraction(pointerId: number | null, commit: boolean) {
    const drag = this.drag;
    if (!drag) return;
    if (pointerId !== null && pointerId !== drag.pointerId) return;

    this.drag = null;
    if (pointerId !== null) this.releasePointer(pointerId);

    if (commit) {
      if (drag.mode === 'node' && drag.moved) {
        this.emitModelChange({ kind: 'node-move', nodeId: drag.node.id });
      } else if (drag.mode === 'resize' && drag.moved) {
        this.emitModelChange({ kind: 'node-resize', nodeId: drag.node.id });
      }
    } else {
      this.rollbackInteraction(drag);
    }

    this.canvas.style.cursor = this.hoverNodeId ? 'grab' : 'default';
    this.markDirty();
    this.emitStatus();
  }

  private rollbackInteraction(drag: NonNullable<DragState>) {
    if (drag.mode === 'pan') {
      this.camera.x = drag.camX;
      this.camera.y = drag.camY;
      return;
    }

    restoreNodeGeometry(drag.node, drag.original);
  }

  private capturePointer(pointerId: number) {
    try {
      this.canvas.setPointerCapture(pointerId);
    } catch {
      // Synthetic or interrupted events may not have an active pointer.
    }
  }

  private releasePointer(pointerId: number) {
    try {
      if (this.canvas.hasPointerCapture(pointerId)) this.canvas.releasePointerCapture(pointerId);
    } catch {
      // Ignore stale pointer ids; drag state is already cleared.
    }
  }

  private emitModelChange(change: CanvasModelChange) {
    this.onModelChange?.(cloneModel(this.model), change);
  }

  private emitStatus() {
    if (!this.onStatus || this.statusFrame !== null || this.disposed) return;
    this.statusFrame = requestAnimationFrame(() => {
      this.statusFrame = null;
      if (this.disposed) return;
      this.onStatus?.({
        zoom: this.camera.scale,
        selectedNodeId: this.selectedNodeId,
        cursorWorld: this.cursorWorld,
        renderedNodes: this.lastRenderedNodes,
        totalNodes: this.model.nodes.length,
      });
    });
  }
}

function cloneModel(model: CanvasModel): CanvasModel {
  return { nodes: model.nodes.map((node) => ({ ...node })) };
}

function nodeGeometry(node: CanvasNode): NodeGeometry {
  return { x: node.x, y: node.y, w: node.w, h: node.h };
}

function restoreNodeGeometry(node: CanvasNode, geometry: NodeGeometry) {
  node.x = geometry.x;
  node.y = geometry.y;
  node.w = geometry.w;
  node.h = geometry.h;
}

function sameNodeGeometry(node: CanvasNode, geometry: NodeGeometry) {
  return node.x === geometry.x && node.y === geometry.y && node.w === geometry.w && node.h === geometry.h;
}

function intersectsNode(node: CanvasNode, bounds: VisibleWorldBounds) {
  return !(node.x > bounds.x1 || node.x + node.w < bounds.x0 || node.y > bounds.y1 || node.y + node.h < bounds.y0);
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines - 1) break;
    } else {
      line = next;
    }
  }
  if (line && lines.length < maxLines) lines.push(clipText(ctx, line, maxWidth));
  return lines;
}

function clipText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(`${text.slice(0, mid)}...`).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return `${text.slice(0, lo)}...`;
}

function detailLineCapacity(nodeHeight: number) {
  const detailTop = 56;
  const kindTop = nodeHeight - 24;
  const lineHeight = 18;
  const textHeight = 13;
  const gapBeforeKind = 6;
  const available = kindTop - gapBeforeKind - detailTop - textHeight;
  return Math.max(0, Math.min(2, Math.floor(available / lineHeight) + 1));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function positiveModulo(value: number, modulus: number) {
  return ((value % modulus) + modulus) % modulus;
}
