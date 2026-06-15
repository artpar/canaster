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
const SNAP_STEP = GRID_STEP;
const KEYBOARD_STEP = SNAP_STEP;
const KEYBOARD_FAST_STEP = SNAP_STEP * 4;
const COMPACT_NODE_SCALE = 0.22;
const COMPACT_NODE_COUNT = 350;

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
      group: Array<{ node: CanvasNode; original: NodeGeometry }>;
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

type ScreenPoint = {
  x: number;
  y: number;
};

type NodeGeometry = {
  x: number;
  y: number;
  w: number;
  h: number;
};

type TouchGestureState = {
  pointerIds: [number, number];
  worldCenter: WorldPoint;
  startDistance: number;
  startScale: number;
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
  private selectedNodeIds = new Set<string>();
  private primarySelectedNodeId: string | null = null;
  private hoverNodeId: string | null = null;
  private cursorWorld: WorldPoint | null = null;
  private drag: DragState = null;
  private touchPoints = new Map<number, ScreenPoint>();
  private gesture: TouchGestureState | null = null;
  private dpr = 1;
  private viewW = 1;
  private viewH = 1;
  private dirty = true;
  private frameQueued = false;
  private statusFrame: number | null = null;
  private lastRenderedNodes = 0;
  private interaction = 'Idle';
  private resizeMode = false;
  private clipboard: CanvasNode[] = [];
  private pasteCounter = 1;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement, options: EngineOptions = {}) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context is not available');

    this.canvas = canvas;
    this.ctx = ctx;
    this.onStatus = options.onStatus;
    this.onModelChange = options.onModelChange;
    this.resizeObserver = new ResizeObserver(() => this.resize());

    this.canvas.tabIndex = 0;
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointercancel', this.onPointerCancel);
    this.canvas.addEventListener('lostpointercapture', this.onLostPointerCapture);
    this.canvas.addEventListener('keydown', this.onKeyDown);
    this.canvas.addEventListener('focus', this.onFocus);
    this.canvas.addEventListener('blur', this.onBlur);
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
    this.canvas.removeEventListener('keydown', this.onKeyDown);
    this.canvas.removeEventListener('focus', this.onFocus);
    this.canvas.removeEventListener('blur', this.onBlur);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('blur', this.onWindowBlur);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('dblclick', this.onDoubleClick);
  }

  setModel(model: CanvasModel, options: SetModelOptions = {}) {
    const selectedNodeIds = options.preserveInteraction ? new Set(this.selectedNodeIds) : new Set<string>();
    const primarySelectedNodeId = options.preserveInteraction ? this.primarySelectedNodeId : null;
    const hoverNodeId = options.preserveInteraction ? this.hoverNodeId : null;
    this.model = { nodes: model.nodes.map((node) => ({ ...node })) };
    this.reconcileSelection(selectedNodeIds, primarySelectedNodeId);
    this.hoverNodeId = hoverNodeId && this.model.nodes.some((node) => node.id === hoverNodeId) ? hoverNodeId : null;
    if (!this.primarySelectedNodeId && this.interaction.startsWith('Keyboard')) this.interaction = 'Idle';
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

  selectNode(nodeId: string, source: 'nonvisual' | 'keyboard' = 'nonvisual', mode: 'replace' | 'toggle' | 'add' = 'replace') {
    if (!this.model.nodes.some((node) => node.id === nodeId)) return false;
    this.applySelection(nodeId, mode);
    this.interaction = source === 'nonvisual' ? 'Nonvisual selection' : 'Keyboard selection';
    this.markDirty();
    this.emitStatus();
    return true;
  }

  moveSelection(dx: number, dy: number, source: 'keyboard' | 'nonvisual' = 'nonvisual') {
    const nodes = this.selectedNodes();
    if (!nodes.length) {
      this.interaction = 'Move no selection';
      this.emitStatus();
      return false;
    }
    if (dx === 0 && dy === 0) {
      this.interaction = 'Move unchanged';
      this.emitStatus();
      return false;
    }
    const before = nodes.map((node) => ({ node, geometry: nodeGeometry(node) }));
    for (const node of nodes) {
      node.x = snapCoordinate(node.x + dx);
      node.y = snapCoordinate(node.y + dy);
    }
    if (before.every((entry) => sameNodeGeometry(entry.node, entry.geometry))) {
      this.interaction = 'Move unchanged';
      this.emitStatus();
      return false;
    }
    this.interaction = source === 'keyboard' ? 'Keyboard move' : 'Nonvisual move';
    this.markDirty();
    this.emitModelChange({ kind: 'node-move', nodeId: this.primarySelectedNodeId ?? nodes[0].id, nodeIds: nodes.map((node) => node.id), source });
    this.emitStatus();
    return true;
  }

  resizePrimarySelection(dw: number, dh: number, source: 'keyboard' | 'nonvisual' = 'nonvisual') {
    const node = this.selectedNode();
    if (!node) {
      this.interaction = 'Resize no selection';
      this.emitStatus();
      return false;
    }
    if (dw === 0 && dh === 0) {
      this.interaction = 'Resize unchanged';
      this.emitStatus();
      return false;
    }
    const before = nodeGeometry(node);
    node.w = dw === 0 ? node.w : snapNodeWidth(node.w + dw);
    node.h = dh === 0 ? node.h : snapNodeHeight(node.h + dh);
    if (sameNodeGeometry(node, before)) {
      this.interaction = 'Resize unchanged';
      this.emitStatus();
      return false;
    }
    this.interaction = source === 'keyboard' ? 'Keyboard resize' : 'Nonvisual resize';
    this.markDirty();
    this.emitModelChange({ kind: 'node-resize', nodeId: node.id, nodeIds: [node.id], source });
    this.emitStatus();
    return true;
  }

  deleteSelection(source: 'keyboard' | 'nonvisual' = 'nonvisual') {
    const ids = this.selectionIds();
    if (!ids.length) {
      this.interaction = 'Delete no selection';
      this.emitStatus();
      return false;
    }
    const deleteSet = new Set(ids);
    this.model.nodes = this.model.nodes.filter((node) => !deleteSet.has(node.id));
    this.selectedNodeIds.clear();
    this.primarySelectedNodeId = null;
    if (this.hoverNodeId && deleteSet.has(this.hoverNodeId)) this.hoverNodeId = null;
    this.resizeMode = false;
    this.interaction = ids.length > 1 ? `Deleted ${ids.length} nodes` : 'Deleted node';
    this.markDirty();
    this.emitModelChange({ kind: 'node-delete', nodeId: ids[0] ?? null, nodeIds: ids, source });
    this.emitStatus();
    return true;
  }

  copySelection() {
    const nodes = this.selectedNodes();
    if (!nodes.length) {
      this.interaction = 'Copy no selection';
      this.emitStatus();
      return false;
    }
    this.clipboard = nodes.map((node) => ({ ...node }));
    this.interaction = nodes.length > 1 ? `Copied ${nodes.length} nodes` : 'Copied node';
    this.emitStatus();
    return true;
  }

  pasteClipboard(source: 'keyboard' | 'nonvisual' = 'nonvisual') {
    if (!this.clipboard.length) {
      this.interaction = 'Paste no clipboard';
      this.emitStatus();
      return false;
    }
    const existingIds = new Set(this.model.nodes.map((node) => node.id));
    const offset = SNAP_STEP * this.pasteCounter++;
    const pasted = this.clipboard.map((node) => {
      const id = uniqueNodeId(`${node.id}-copy`, existingIds);
      existingIds.add(id);
      return { ...node, id, x: snapCoordinate(node.x + offset), y: snapCoordinate(node.y + offset) };
    });
    this.model.nodes = [...this.model.nodes, ...pasted];
    this.selectedNodeIds = new Set(pasted.map((node) => node.id));
    this.primarySelectedNodeId = pasted[0]?.id ?? null;
    this.resizeMode = false;
    this.interaction = pasted.length > 1 ? `Pasted ${pasted.length} nodes` : 'Pasted node';
    this.markDirty();
    this.emitModelChange({ kind: 'node-create', nodeId: pasted[0]?.id ?? null, nodeIds: pasted.map((node) => node.id), source });
    this.emitStatus();
    return true;
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
    const visibleNodes: CanvasNode[] = [];
    for (const node of this.model.nodes) {
      if (!intersectsNode(node, cullBounds)) continue;
      visibleNodes.push(node);
    }
    const compact = this.shouldUseCompactNodes(visibleNodes.length);
    for (const node of visibleNodes) this.drawNode(node, compact);
    const renderedNodes = visibleNodes.length;
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

  private drawNode(node: CanvasNode, compact: boolean) {
    const { ctx, theme } = this;
    const selected = this.selectedNodeIds.has(node.id);
    const primary = node.id === this.primarySelectedNodeId;
    const hovered = node.id === this.hoverNodeId;
    const radius = NODE_RADIUS;

    if (!compact || selected || hovered) {
      ctx.save();
      ctx.shadowColor = theme.nodeShadow;
      ctx.shadowBlur = selected ? 18 : 12;
      ctx.shadowOffsetY = 6;
      roundRectPath(ctx, node.x, node.y, node.w, node.h, radius);
      ctx.fillStyle = theme.nodeBg;
      ctx.fill();
      ctx.restore();
    } else {
      roundRectPath(ctx, node.x, node.y, node.w, node.h, radius);
      ctx.fillStyle = theme.nodeBg;
      ctx.fill();
    }

    roundRectPath(ctx, node.x, node.y, node.w, node.h, radius);
    ctx.strokeStyle = selected ? theme.selected : theme.nodeBorder;
    ctx.lineWidth = primary ? 3 : selected ? 2.2 : hovered ? 1.8 : 1.2;
    ctx.stroke();

    const accent = theme.kind[node.kind];
    ctx.fillStyle = accent;
    roundRectPath(ctx, node.x + 12, node.y + 12, 28, 6, 3);
    ctx.fill();

    if (compact && !selected && !hovered) return;

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

    if (primary) {
      const handle = this.resizeHandleRect(node);
      ctx.fillStyle = theme.resizeFill;
      roundRectPath(ctx, handle.x, handle.y, handle.w, handle.h, 3);
      ctx.fill();
    }
  }

  private onPointerDown = (event: PointerEvent) => {
    event.preventDefault();
    this.canvas.focus({ preventScroll: true });
    const point = this.eventPoint(event);
    if (event.pointerType === 'touch') {
      this.touchPoints.set(event.pointerId, point);
      this.capturePointer(event.pointerId);
      if (this.touchPoints.size >= 2) {
        this.startTouchGesture();
        return;
      }
    }

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
      this.interaction = 'Resize node';
      this.capturePointer(event.pointerId);
      return;
    }

    const node = this.nodeAt(world);

    if (node) {
      this.applySelection(node.id, event.shiftKey || event.metaKey || event.ctrlKey ? 'toggle' : 'replace');
      this.drag = {
        mode: 'node',
        pointerId: event.pointerId,
        node,
        dx: world.x - node.x,
        dy: world.y - node.y,
        moved: false,
        original: nodeGeometry(node),
        group: this.selectedNodeIds.has(node.id) ? this.selectedNodes().map((selected) => ({ node: selected, original: nodeGeometry(selected) })) : [],
      };
      this.interaction = 'Drag node';
      this.capturePointer(event.pointerId);
      this.markDirty();
      this.emitStatus();
      return;
    }

    this.clearSelection();
    this.drag = {
      mode: 'pan',
      pointerId: event.pointerId,
      sx: point.x,
      sy: point.y,
      camX: this.camera.x,
      camY: this.camera.y,
      moved: false,
    };
    this.interaction = 'Pan viewport';
    this.capturePointer(event.pointerId);
    this.markDirty();
    this.emitStatus();
  };

  private onPointerMove = (event: PointerEvent) => {
    const point = this.eventPoint(event);
    if (event.pointerType === 'touch' && this.touchPoints.has(event.pointerId)) {
      this.touchPoints.set(event.pointerId, point);
      if (this.gesture) {
        this.updateTouchGesture();
        return;
      }
    }

    const world = this.screenToWorld(point.x, point.y);
    this.cursorWorld = world;

    if (this.drag && event.pointerId !== this.drag.pointerId) return;

    if (this.drag?.mode === 'node') {
      const rawX = world.x - this.drag.dx;
      const rawY = world.y - this.drag.dy;
      const nextX = event.altKey || nearlyEqual(rawX, this.drag.original.x) ? rawX : snapCoordinate(rawX);
      const nextY = event.altKey || nearlyEqual(rawY, this.drag.original.y) ? rawY : snapCoordinate(rawY);
      const deltaX = nextX - this.drag.original.x;
      const deltaY = nextY - this.drag.original.y;
      if (this.drag.group.length > 1) {
        for (const entry of this.drag.group) {
          entry.node.x = entry.original.x + deltaX;
          entry.node.y = entry.original.y + deltaY;
        }
      } else {
        this.drag.node.x = nextX;
        this.drag.node.y = nextY;
      }
      this.drag.moved = this.drag.group.length > 1
        ? this.drag.group.some((entry) => !sameNodeGeometry(entry.node, entry.original))
        : !sameNodeGeometry(this.drag.node, this.drag.original);
      this.markDirty();
    } else if (this.drag?.mode === 'resize') {
      const rawW = Math.max(MIN_NODE_W, world.x - this.drag.ox - this.drag.node.x);
      const rawH = Math.max(MIN_NODE_H, world.y - this.drag.oy - this.drag.node.y);
      this.drag.node.w = event.altKey || nearlyEqual(rawW, this.drag.original.w) ? rawW : snapNodeWidth(rawW);
      this.drag.node.h = event.altKey || nearlyEqual(rawH, this.drag.original.h) ? rawH : snapNodeHeight(rawH);
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
      this.interaction = node ? 'Hover node' : 'Idle';
    }

    this.emitStatus();
  };

  private onPointerUp = (event: PointerEvent) => {
    if (this.gesture && this.finishTouchPointer(event.pointerId)) return;
    if (event.pointerType === 'touch') this.touchPoints.delete(event.pointerId);
    this.finishPointerInteraction(event.pointerId, true);
  };

  private onPointerCancel = (event: PointerEvent) => {
    if (this.gesture && this.finishTouchPointer(event.pointerId)) return;
    if (event.pointerType === 'touch') this.touchPoints.delete(event.pointerId);
    this.finishPointerInteraction(event.pointerId, false);
  };

  private onLostPointerCapture = (event: PointerEvent) => {
    if (this.gesture && this.finishTouchPointer(event.pointerId)) return;
    if (event.pointerType === 'touch') this.touchPoints.delete(event.pointerId);
    this.finishPointerInteraction(event.pointerId, false);
  };

  private onWindowBlur = () => {
    this.finishTouchGesture();
    this.touchPoints.clear();
    this.finishPointerInteraction(null, false);
  };

  private onFocus = () => {
    this.interaction = this.primarySelectedNodeId ? 'Canvas focused' : 'Canvas focused, no selection';
    this.emitStatus();
  };

  private onBlur = () => {
    if (!this.drag && !this.gesture) this.interaction = 'Idle';
    this.emitStatus();
  };

  private onKeyDown = (event: KeyboardEvent) => {
    const step = event.shiftKey ? KEYBOARD_FAST_STEP : KEYBOARD_STEP;
    const movement = keyMovement(event.key, step);

    if (movement) {
      event.preventDefault();
      if (this.resizeMode) this.resizePrimarySelection(movement.x, movement.y, 'keyboard');
      else this.moveSelection(movement.x, movement.y, 'keyboard');
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.finishPointerInteraction(null, false);
      this.finishTouchGesture();
      this.touchPoints.clear();
      if (this.resizeMode) {
        this.resizeMode = false;
        this.interaction = 'Keyboard resize ended';
      } else {
        this.clearSelection();
        this.interaction = 'Selection cleared';
      }
      this.markDirty();
      this.emitStatus();
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!this.primarySelectedNodeId) this.selectNearestNodeToViewportCenter();
      this.interaction = this.primarySelectedNodeId ? 'Keyboard selection' : 'Keyboard no target';
      this.markDirty();
      this.emitStatus();
      return;
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      this.deleteSelection('keyboard');
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c') {
      event.preventDefault();
      this.copySelection();
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'v') {
      event.preventDefault();
      this.pasteClipboard('keyboard');
      return;
    }

    if (event.key.toLowerCase() === 'r') {
      event.preventDefault();
      if (!this.primarySelectedNodeId) {
        this.interaction = 'Resize no selection';
      } else {
        this.resizeMode = !this.resizeMode;
        this.interaction = this.resizeMode ? 'Keyboard resize mode' : 'Keyboard resize ended';
      }
      this.markDirty();
      this.emitStatus();
    }
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

  private shouldUseCompactNodes(visibleCount: number) {
    return this.camera.scale < COMPACT_NODE_SCALE || visibleCount > COMPACT_NODE_COUNT;
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
    if (!this.primarySelectedNodeId) return null;
    return this.model.nodes.find((node) => node.id === this.primarySelectedNodeId) ?? null;
  }

  private selectedNodes() {
    const selected = this.selectedNodeIds;
    return this.model.nodes.filter((node) => selected.has(node.id));
  }

  private selectionIds() {
    return this.selectedNodes().map((node) => node.id);
  }

  private clearSelection() {
    this.selectedNodeIds.clear();
    this.primarySelectedNodeId = null;
    this.resizeMode = false;
  }

  private applySelection(nodeId: string, mode: 'replace' | 'toggle' | 'add') {
    if (mode === 'replace') {
      this.selectedNodeIds = new Set([nodeId]);
      this.primarySelectedNodeId = nodeId;
      this.resizeMode = false;
      return;
    }

    if (mode === 'toggle' && this.selectedNodeIds.has(nodeId)) {
      this.selectedNodeIds.delete(nodeId);
      if (this.primarySelectedNodeId === nodeId) this.primarySelectedNodeId = this.selectedNodeIds.values().next().value ?? null;
      if (!this.primarySelectedNodeId) this.resizeMode = false;
      return;
    }

    this.selectedNodeIds.add(nodeId);
    this.primarySelectedNodeId = nodeId;
    this.resizeMode = false;
  }

  private reconcileSelection(selectedNodeIds: Set<string>, primarySelectedNodeId: string | null) {
    const existing = new Set(this.model.nodes.map((node) => node.id));
    this.selectedNodeIds = new Set([...selectedNodeIds].filter((nodeId) => existing.has(nodeId)));
    this.primarySelectedNodeId =
      primarySelectedNodeId && this.selectedNodeIds.has(primarySelectedNodeId)
        ? primarySelectedNodeId
        : (this.selectedNodeIds.values().next().value ?? null);
    if (!this.primarySelectedNodeId) this.resizeMode = false;
  }

  private selectNearestNodeToViewportCenter() {
    const center = this.screenToWorld(this.viewW / 2, this.viewH / 2);
    let nearest: CanvasNode | null = null;
    let nearestDistance = Infinity;
    for (const node of this.model.nodes) {
      const nodeCenterX = node.x + node.w / 2;
      const nodeCenterY = node.y + node.h / 2;
      const distance = (nodeCenterX - center.x) ** 2 + (nodeCenterY - center.y) ** 2;
      if (distance < nearestDistance) {
        nearest = node;
        nearestDistance = distance;
      }
    }
    if (nearest) this.applySelection(nearest.id, 'replace');
    else this.clearSelection();
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
        this.interaction = 'Pointer move';
        const nodeIds = drag.group.length > 1 ? drag.group.map((entry) => entry.node.id) : [drag.node.id];
        this.emitModelChange({ kind: 'node-move', nodeId: drag.node.id, nodeIds, source: 'pointer' });
      } else if (drag.mode === 'resize' && drag.moved) {
        this.interaction = 'Pointer resize';
        this.emitModelChange({ kind: 'node-resize', nodeId: drag.node.id, nodeIds: [drag.node.id], source: 'pointer' });
      } else if (drag.mode === 'pan' && drag.moved) {
        this.interaction = 'Pointer pan';
      }
    } else {
      this.rollbackInteraction(drag);
      this.interaction = 'Interaction canceled';
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

    if (drag.mode === 'node' && drag.group.length > 1) {
      for (const entry of drag.group) restoreNodeGeometry(entry.node, entry.original);
      return;
    }

    restoreNodeGeometry(drag.node, drag.original);
  }

  private startTouchGesture() {
    const entries = [...this.touchPoints.entries()].slice(0, 2);
    if (entries.length < 2) return;

    if (this.drag) this.finishPointerInteraction(null, false);

    const [first, second] = entries;
    this.capturePointer(first[0]);
    this.capturePointer(second[0]);
    const center = midpoint(first[1], second[1]);
    this.gesture = {
      pointerIds: [first[0], second[0]],
      worldCenter: this.screenToWorld(center.x, center.y),
      startDistance: Math.max(1, distance(first[1], second[1])),
      startScale: this.camera.scale,
    };
    this.cursorWorld = this.gesture.worldCenter;
    this.interaction = 'Touch pan/zoom';
    this.markDirty();
    this.emitStatus();
  }

  private updateTouchGesture() {
    if (!this.gesture) return;
    const first = this.touchPoints.get(this.gesture.pointerIds[0]);
    const second = this.touchPoints.get(this.gesture.pointerIds[1]);
    if (!first || !second) return;

    const center = midpoint(first, second);
    const nextScale = clamp((distance(first, second) / this.gesture.startDistance) * this.gesture.startScale, MIN_SCALE, MAX_SCALE);
    this.camera.scale = nextScale;
    this.camera.x = center.x - this.gesture.worldCenter.x * nextScale;
    this.camera.y = center.y - this.gesture.worldCenter.y * nextScale;
    this.cursorWorld = this.screenToWorld(center.x, center.y);
    this.interaction = Math.abs(nextScale - this.gesture.startScale) > 0.01 ? 'Touch pinch zoom' : 'Touch two-finger pan';
    this.markDirty();
    this.emitStatus();
  }

  private finishTouchPointer(pointerId: number) {
    if (!this.touchPoints.has(pointerId) && !this.gesture?.pointerIds.includes(pointerId)) return false;
    this.touchPoints.delete(pointerId);
    this.releasePointer(pointerId);
    if (this.gesture?.pointerIds.includes(pointerId)) this.finishTouchGesture();
    return true;
  }

  private finishTouchGesture() {
    if (!this.gesture) return;
    const pointerIds = this.gesture.pointerIds;
    this.gesture = null;
    for (const pointerId of pointerIds) this.releasePointer(pointerId);
    this.interaction = 'Touch gesture ended';
    this.markDirty();
    this.emitStatus();
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
        selectedNodeId: this.primarySelectedNodeId,
        selectedNodeIds: this.selectionIds(),
        selectionCount: this.selectedNodeIds.size,
        cursorWorld: this.cursorWorld,
        renderedNodes: this.lastRenderedNodes,
        totalNodes: this.model.nodes.length,
        interaction: this.interaction,
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

function snapCoordinate(value: number) {
  return Math.round(value / SNAP_STEP) * SNAP_STEP;
}

function snapNodeWidth(value: number) {
  return Math.max(MIN_NODE_W, snapCoordinate(value));
}

function snapNodeHeight(value: number) {
  return Math.max(MIN_NODE_H, snapCoordinate(value));
}

function nearlyEqual(a: number, b: number) {
  return Math.abs(a - b) < 0.0001;
}

function keyMovement(key: string, step: number) {
  switch (key) {
    case 'ArrowUp':
      return { x: 0, y: -step };
    case 'ArrowDown':
      return { x: 0, y: step };
    case 'ArrowLeft':
      return { x: -step, y: 0 };
    case 'ArrowRight':
      return { x: step, y: 0 };
    default:
      return null;
  }
}

function midpoint(a: ScreenPoint, b: ScreenPoint) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function distance(a: ScreenPoint, b: ScreenPoint) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function uniqueNodeId(base: string, existingIds: Set<string>) {
  const normalized = base.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase() || 'node-copy';
  let candidate = normalized;
  let suffix = 2;
  while (existingIds.has(candidate)) {
    candidate = `${normalized}-${suffix++}`;
  }
  return candidate;
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
