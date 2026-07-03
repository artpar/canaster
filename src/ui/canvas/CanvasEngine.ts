import { canvasThemeFor, type CanvasTheme } from './theme';
import { planCanvasCommand, sameSelectionState, type CanvasCommandPlan } from './CanvasCommandPlanner';
import { CanvasInputController } from './CanvasInputController';
import { CanvasNodeContentToolbar } from './CanvasNodeContentToolbar';
import { CanvasOverlayLayer } from './CanvasOverlayLayer';
import type { CanvasEngineOptions } from './CanvasEngineOptions';
import { unavailableCanvasNodeAssetService, type CanvasNodeAssetService } from './nodeAssetService';
import { unavailableCanvasNodeMailService, type CanvasNodeMailService } from './nodeMailService';
import { hasSelectionShortcutModifier } from '../KeyboardShortcuts';
import { asString, cloneNodeData } from '../../core/nodeData';
import { embedFrameUrlForUrl, embedTitleForUrl, normalizeEmbedUrl } from '../../core/embedUrl';
import {
  cloneNodeAppearance,
  contentViewportForNode,
  DEFAULT_NODE_CONTENT_SCALE,
  nodeAppearanceWithContentOffset,
  nodeAppearanceWithContentScale,
  type NodeContentViewport,
} from '../../core/nodeAppearance';
import { canvasPortalViewportRect } from './nodeTypes/canvasNode';
import { cachedAssetImage } from './imageAssets';
import { createLiveNodeContentOverlay, hasLiveNodeContentOverlay, type LiveNodeContentOverlay } from './nodeTypes/liveNodeContentOverlay';
import { describeNode, hitTestNodeContent, nodeDefinitionFor, nodeInteractionRegions, parseNodeData, portalInfoForNode, renderNodeContent } from './nodeRegistry';
import { clipText, nodeText } from './nodeRendering';
import type { NodeContentRect, NodeInteractionRegion } from './nodeDefinition/nodeDefinitionTypes';
import type {
  Camera,
  CanvasCommand,
  CanvasEditSource,
  CanvasFrameMetrics,
  CanvasModel,
  CanvasModelChange,
  CanvasNode,
  CanvasNodeContentPan,
  CanvasNodeVisibilityFilter,
  CanvasOperation,
  CanvasSelectionState,
  EngineInteractionMode,
  PortalLayout,
  ScreenRect,
  ViewportStatus,
  WorldPoint,
  NodeData,
} from '../../domain/types';
import type { CanvasBackgroundImage } from '../../core/canvasAppearance';
import { BuiltInNodeTypes } from '../../domain/types';
import type {CanasterThemeId} from '../theme/CanasterTheme';

const MIN_SCALE = 0.08;
const MAX_SCALE = 4;
const MAX_DPR = 2;
const GRID_STEP = 32;
const RESIZE_HANDLE = 12;
const FIXED_HANDLE_DRAW_SIZE = 16;
const FIXED_HANDLE_HIT_SIZE = 28;
const CULL_MARGIN_SCREEN = 96;
const SNAP_STEP = GRID_STEP;
const KEYBOARD_STEP = SNAP_STEP;
const KEYBOARD_FAST_STEP = SNAP_STEP * 4;
const WHEEL_LINE_PX = 16;
const WHEEL_PAGE_PX = 640;
const PREVIEW_FRAME_INTERVAL_MS = 50;
const CONTEXT_FRAME_INTERVAL_MS = 100;
const NODE_HEADER_MIN_WIDTH = 72;
const NODE_HEADER_PAD_X = 8;
const NODE_HEADER_HEIGHT = 22;
const PRIMARY_NODE_EDIT_REGION_ID = 'edit';
const MARQUEE_DRAG_THRESHOLD = 3;

type DragState =
  | { mode: 'pan'; pointerId: number; sx: number; sy: number; camX: number; camY: number; moved: boolean }
  | {
      mode: 'marquee';
      pointerId: number;
      sx: number;
      sy: number;
      start: WorldPoint;
      current: WorldPoint;
      moved: boolean;
      initialSelection: CanvasSelectionState;
    }
  | { mode: 'content-pan'; pointerId: number; sx: number; sy: number; nodeIds: string[]; moved: boolean; command: CanvasCommand | null }
  | {
      mode: 'node';
      pointerId: number;
      node: CanvasNode;
      dx: number;
      dy: number;
      moved: boolean;
      original: NodeGeometry;
      command: CanvasCommand | null;
    }
  | { mode: 'resize'; pointerId: number; node: CanvasNode; ox: number; oy: number; moved: boolean; original: NodeGeometry; command: CanvasCommand | null }
  | null;

type SetModelOptions = {
  preserveInteraction?: boolean;
};

type FlushRenderOptions = {
  forCapture?: boolean;
};

type RenderOptions = {
  drawLiveNodeContentOnCanvas?: boolean;
  syncDomOverlays?: boolean;
};

type InteractionHandleSizing = 'world' | 'screen-fixed';

type VisibleWorldBounds = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

type GridPatternAxisPoint = {
  screen: number;
  major: boolean;
};

type GridPatternAxes = {
  step: number;
  x: GridPatternAxisPoint[];
  y: GridPatternAxisPoint[];
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

type NodeChromeState = {
  selected: boolean;
  primary: boolean;
  hovered: boolean;
  compact: boolean;
};

type EmbedOverlaySlot = {
  frame: HTMLIFrameElement;
  root: HTMLDivElement;
  src: string;
};

type LiveNodeContentOverlaySlot = {
  overlay: LiveNodeContentOverlay;
  nodeType: string;
};

export type CanvasPngCapture = {
  blob: Blob;
  width: number;
  height: number;
};

export class CanvasEngine {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private canvasId: string;
  private readonly beforeCommand?: (command: CanvasCommand) => CanvasCommand | false;
  private readonly onNodeAction?: (nodeId: string, actionId: string, source: CanvasEditSource) => boolean;
  private readonly onNodeDataChange?: (nodeId: string, from: NodeData, to: NodeData, source: CanvasEditSource) => boolean;
  private readonly onCanvasDoubleClick?: (canvasId: string, event: MouseEvent) => boolean;
  private readonly onCanvasAddMenuRequest?: (canvasId: string, event: MouseEvent, at: WorldPoint) => boolean;
  private readonly onStatus?: (status: ViewportStatus) => void;
  private readonly onModelChange?: (model: CanvasModel, change: CanvasModelChange) => void;
  private readonly onPortalLayout?: (layouts: PortalLayout[]) => void;
  private readonly onFrameMetrics?: (metrics: CanvasFrameMetrics) => void;
  private readonly transformPastedNode?: (node: CanvasNode) => CanvasNode;
  private readonly pasteInteractionForNodes?: (nodes: CanvasNode[]) => string | null;
  private readonly shouldUseSystemClipboardPaste?: (data: DataTransfer | null) => boolean;
  private readonly nodeAssetService: CanvasNodeAssetService;
  private readonly nodeMailService: CanvasNodeMailService;
  private readonly overlayLayer: CanvasOverlayLayer | null;
  private readonly nodeContentToolbar: CanvasNodeContentToolbar | null;
  private readonly inputController: CanvasInputController;
  private readonly resizeObserver: ResizeObserver;

  private model: CanvasModel = { schemaVersion: 2, nodes: [] };
  private theme: CanvasTheme = canvasThemeFor('graphiteDesk');
  private backgroundImage: CanvasBackgroundImage | null = null;
  private camera: Camera = { x: 0, y: 0, scale: 1 };
  private interactionMode: EngineInteractionMode = 'active';
  private selectedNodeIds = new Set<string>();
  private primarySelectedNodeId: string | null = null;
  private hoverNodeId: string | null = null;
  private cursorWorld: WorldPoint | null = null;
  private drag: DragState = null;
  private previewGeometries = new Map<string, NodeGeometry>();
  private previewContentPans = new Map<string, CanvasNodeContentPan>();
  private touchPoints = new Map<number, ScreenPoint>();
  private gesture: TouchGestureState | null = null;
  private dpr = 1;
  private viewW = 1;
  private viewH = 1;
  private dirty = true;
  private frameQueued = false;
  private statusFrame: number | null = null;
  private throttleTimer: number | null = null;
  private lastRenderedNodes = 0;
  private lastRenderTime = 0;
  private interaction = 'Idle';
  private interactionHandleSizing: InteractionHandleSizing = 'world';
  private resizeMode = false;
  private clipboard: CanvasNode[] = [];
  private pasteCounter = 1;
  private disposed = false;
  private nodeVisibilityFilter: CanvasNodeVisibilityFilter | null = null;
  private nodeVisibilitySignature = '';
  private livePortalNodeIds = new Set<string>();
  private highlightNodeIds = new Set<string>();
  private lastRenderedNodeIds: string[] = [];
  private liveNodeContentInteractionNodeId: string | null = null;
  private embedOverlaySlots = new Map<string, EmbedOverlaySlot>();
  private liveNodeContentOverlaySlots = new Map<string, LiveNodeContentOverlaySlot>();

  constructor(canvas: HTMLCanvasElement, options: CanvasEngineOptions = {}) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context is not available');

    this.canvas = canvas;
    this.ctx = ctx;
    this.canvasId = options.canvasId ?? 'canvas';
    this.interactionMode = options.interactionMode ?? 'active';
    this.beforeCommand = options.beforeCommand;
    this.onNodeAction = options.onNodeAction;
    this.onNodeDataChange = options.onNodeDataChange;
    this.onCanvasDoubleClick = options.onCanvasDoubleClick;
    this.onCanvasAddMenuRequest = options.onCanvasAddMenuRequest;
    this.onStatus = options.onStatus;
    this.onModelChange = options.onModelChange;
    this.onPortalLayout = options.onPortalLayout;
    this.onFrameMetrics = options.onFrameMetrics;
    this.transformPastedNode = options.transformPastedNode;
    this.pasteInteractionForNodes = options.pasteInteractionForNodes;
    this.shouldUseSystemClipboardPaste = options.shouldUseSystemClipboardPaste;
    this.nodeAssetService = options.nodeAssetService ?? unavailableCanvasNodeAssetService;
    this.nodeMailService = options.nodeMailService ?? unavailableCanvasNodeMailService;
    this.nodeVisibilityFilter = options.nodeVisibilityFilter ?? null;
    this.nodeVisibilitySignature = options.nodeVisibilitySignature ?? '';
    this.livePortalNodeIds = new Set(options.livePortalNodeIds ?? []);
    this.highlightNodeIds = new Set(options.highlightNodeIds ?? []);
    this.backgroundImage = cloneBackgroundImage(options.backgroundImage ?? null);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.inputController = new CanvasInputController(this.canvas, {
      onPointerDown: this.onPointerDown,
      onPointerMove: this.onPointerMove,
      onPointerUp: this.onPointerUp,
      onPointerCancel: this.onPointerCancel,
      onLostPointerCapture: this.onLostPointerCapture,
      onKeyDown: this.onKeyDown,
      onPaste: this.onPaste,
      onFocus: this.onFocus,
      onBlur: this.onBlur,
      onWindowBlur: this.onWindowBlur,
      onWheel: this.onWheel,
      onDoubleClick: this.onDoubleClick,
      onContextMenu: this.onContextMenu,
    });

    if (this.onNodeDataChange) {
      this.overlayLayer = new CanvasOverlayLayer(this.canvas, {
        nodeAssetService: this.nodeAssetService,
        nodeMailService: this.nodeMailService,
        currentNode: (nodeId) => this.model.nodes.find((node) => node.id === nodeId) ?? null,
        isNodeVisible: (node) => this.isNodeVisible(node),
        primarySelectedNodeId: () => this.primarySelectedNodeId,
        themeForNode: (node) => this.themeForNode(node),
        nodeContentRect: (node, theme) => this.nodeContentRect(node, theme),
        interactionRegionsFor: (node) => this.interactionRegionsFor(node),
        worldToScreenRect: (rect) => this.worldToScreenRect(rect),
        commitNodeData: (nodeId, from, to, source) => this.onNodeDataChange?.(nodeId, from, to, source) ?? false,
        setInteraction: (interaction) => {
          this.interaction = interaction;
        },
        markDirty: () => this.markDirty(),
        emitStatus: () => this.emitStatus(),
        syncNodeContentToolbar: () => this.syncNodeContentToolbar(),
      });
      this.nodeContentToolbar = new CanvasNodeContentToolbar({
        executeCommand: (command) => this.executeCommand(command),
        isBlocked: () => Boolean(this.overlayLayer?.hasActiveNodeInteraction() || this.liveNodeContentInteractionNodeId),
        targetNode: () => this.nodeContentToolbarNode(),
        targetNodeIds: (nodeId) => this.nodeContentTargetIdsFor(nodeId),
        worldToScreenRect: (rect) => this.worldToScreenRect(rect),
      });
      this.overlayLayer.root.append(this.nodeContentToolbar.element);
    } else {
      this.overlayLayer = null;
      this.nodeContentToolbar = null;
    }

    this.canvas.tabIndex = this.acceptsInput() ? 0 : -1;
    this.attachInputListenersForMode();
    this.resizeObserver.observe(this.canvas);
    this.resize();
    this.emitStatus();
  }

  dispose() {
    this.disposed = true;
    if (this.statusFrame !== null) cancelAnimationFrame(this.statusFrame);
    if (this.throttleTimer !== null) window.clearTimeout(this.throttleTimer);
    this.closeNodeInteraction();
    this.disposeLiveNodeContentOverlays();
    this.disposeEmbedOverlays();
    this.overlayLayer?.dispose();
    this.resizeObserver.disconnect();
    this.detachInputListeners();
  }

  setModel(model: CanvasModel, options: SetModelOptions = {}) {
    if (model.schemaVersion !== 2) throw new Error('CanvasEngine only accepts schemaVersion 2 models');
    const selectedNodeIds = options.preserveInteraction ? new Set(this.selectedNodeIds) : new Set<string>();
    const primarySelectedNodeId = options.preserveInteraction ? this.primarySelectedNodeId : null;
    const hoverNodeId = options.preserveInteraction ? this.hoverNodeId : null;
    this.model = cloneModel(model);
    this.reconcileSelection(selectedNodeIds, primarySelectedNodeId);
    this.hoverNodeId = hoverNodeId && this.model.nodes.some((node) => node.id === hoverNodeId) ? hoverNodeId : null;
    this.reconcileNodeInteraction();
    if (!this.primarySelectedNodeId && this.interaction.startsWith('Keyboard')) this.interaction = 'Idle';
    this.markDirty();
    this.emitStatus();
  }

  setNodeVisibilityFilter(filter: CanvasNodeVisibilityFilter | null, signature = '') {
    const nextSignature = filter ? signature : '';
    const changed = this.nodeVisibilitySignature !== nextSignature || Boolean(this.nodeVisibilityFilter) !== Boolean(filter);
    this.nodeVisibilityFilter = filter;
    this.nodeVisibilitySignature = nextSignature;
    if (!changed) return;
    this.reconcileSelection(new Set(this.selectedNodeIds), this.primarySelectedNodeId);
    if (this.hoverNodeId && !this.model.nodes.some((node) => node.id === this.hoverNodeId && this.isNodeVisible(node))) {
      this.hoverNodeId = null;
    }
    this.markDirty();
    this.emitStatus();
  }

  getProjectedNodeIds() {
    return this.projectedNodes().map((node) => node.id);
  }

  getRenderedNodeIds() {
    return [...this.lastRenderedNodeIds];
  }

  setCanvasId(canvasId: string) {
    if (this.canvasId === canvasId) return;
    this.canvasId = canvasId;
    this.markDirty();
    this.emitStatus();
  }

  setInteractionHandleSizing(mode: InteractionHandleSizing) {
    if (this.interactionHandleSizing === mode) return;
    this.interactionHandleSizing = mode;
    this.markDirty();
  }

  setTheme(name: CanasterThemeId) {
    this.theme = canvasThemeFor(name);
    this.markDirty();
  }

  setBackgroundImage(backgroundImage: CanvasBackgroundImage | null) {
    const next = cloneBackgroundImage(backgroundImage);
    if (sameBackgroundImage(this.backgroundImage, next)) return;
    this.backgroundImage = next;
    this.markDirty();
  }

  setInteractionMode(mode: EngineInteractionMode) {
    if (this.interactionMode === mode) return;
    this.interactionMode = mode;
    this.canvas.tabIndex = this.acceptsInput() ? 0 : -1;
    this.finishPointerInteraction(null, false);
    this.finishTouchGesture();
    if (!this.acceptsInput()) this.closeNodeInteraction();
    this.touchPoints.clear();
    this.attachInputListenersForMode();
    this.markDirty();
    this.emitStatus();
  }

  setLivePortalNodeIds(ids: Set<string>) {
    if (sameStringSet(this.livePortalNodeIds, ids)) return;
    this.livePortalNodeIds = new Set(ids);
    this.markDirty();
  }

  setHighlightNodeIds(ids: string[]) {
    this.highlightNodeIds = new Set(ids);
    this.markDirty();
  }

  getCamera(): Camera {
    return { ...this.camera };
  }

  setCamera(camera: Camera) {
    if (this.camera.x === camera.x && this.camera.y === camera.y && this.camera.scale === camera.scale) return;
    this.camera = { ...camera };
    this.positionNodeInteraction();
    this.markDirty();
    this.emitStatus();
  }

  flushRender(options: FlushRenderOptions = {}) {
    if (this.disposed) return;
    this.resize();
    this.frameQueued = false;
    this.render({
      drawLiveNodeContentOnCanvas: options.forCapture === true,
      syncDomOverlays: options.forCapture !== true,
    });
    this.dirty = false;
  }

  capturePngBlob(): Promise<CanvasPngCapture> {
    this.flushRender({ forCapture: true });
    const { canvas } = this;
    return new Promise((resolve, reject) => {
      try {
        canvas.toBlob((blob) => {
          this.flushRender();
          if (!blob) {
            reject(new Error('Could not capture workspace preview'));
            return;
          }
          resolve({ blob, width: canvas.width, height: canvas.height });
        }, 'image/png');
      } catch (error) {
        this.flushRender();
        reject(error);
      }
    });
  }

  getSelectionState(): CanvasSelectionState {
    return this.selectionState();
  }

  setSelectionState(selection: CanvasSelectionState) {
    const current = this.selectionState();
    if (sameSelectionState(current, selection)) return;
    this.reconcileSelection(new Set(selection.selectedNodeIds), selection.primarySelectedNodeId);
    this.resizeMode = Boolean(selection.resizeMode && this.primarySelectedNodeId);
    this.markDirty();
    this.emitStatus();
  }

  focusCanvas() {
    if (this.acceptsInput()) this.canvas.focus({ preventScroll: true });
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

  hasClipboard() {
    return this.clipboard.length > 0;
  }

  executeCommand(command: CanvasCommand) {
    if (!this.acceptsInput()) {
      this.interaction = 'Inactive canvas';
      this.emitStatus();
      return false;
    }
    if (command.type !== 'select-node' && command.type !== 'select-nodes') this.closeNodeInteraction();
    const guarded = this.beforeCommand?.(command) ?? command;
    if (guarded === false) {
      this.emitStatus();
      return false;
    }
    this.clearPreview();
    return this.applyCommandPlan(this.planCommand(guarded), true).operations.length > 0;
  }

  private applyCommandPlan(plan: CanvasCommandPlan, emitChange: boolean) {
    this.interaction = plan.interaction;
    if (!plan.operations.length) {
      this.emitStatus();
      return plan;
    }
    this.applyOperations(plan.operations);
    if (plan.operations.some(operationAffectsRender)) this.markDirty();
    if (emitChange && plan.change) this.emitModelChange(plan.change);
    this.emitStatus();
    return plan;
  }

  private applyPreviewPlan(plan: CanvasCommandPlan) {
    this.interaction = plan.interaction;
    this.previewGeometries = previewGeometriesFrom(plan.operations);
    this.previewContentPans = previewContentPansFrom(plan.operations);
    this.markDirty();
    this.emitStatus();
    return plan;
  }

  private clearPreview() {
    if (!this.previewGeometries.size && !this.previewContentPans.size) return;
    this.previewGeometries.clear();
    this.previewContentPans.clear();
    this.markDirty();
  }

  private planCommand(command: CanvasCommand): CanvasCommandPlan {
    return planCanvasCommand({
      model: this.model,
      selectionState: this.selectionState(),
      selectedNodes: this.selectedNodes(),
      selectionIds: this.selectionIds(),
      clipboard: this.clipboard,
      pasteCounter: this.pasteCounter,
      primarySelectedNodeId: this.primarySelectedNodeId,
      cursorWorld: this.cursorWorld,
      fallbackCreatePoint: this.screenToWorld(this.viewW / 2, this.viewH / 2),
      isNodeVisible: (node) => this.isNodeVisible(node),
      contentZoomTargetNodes: (nodeIds) => this.contentZoomTargetNodes(nodeIds),
      transformPastedNode: this.transformPastedNode,
      pasteInteractionForNodes: this.pasteInteractionForNodes,
    }, command);
  }

  private applyOperations(operations: CanvasOperation[]) {
    for (const operation of operations) {
      if (operation.type === 'set-selection') {
        this.applySelectionState(operation.to);
      } else if (operation.type === 'set-node-geometry') {
        const node = this.model.nodes.find((candidate) => candidate.id === operation.nodeId);
        if (node) restoreNodeGeometry(node, operation.to);
      } else if (operation.type === 'set-node-content-scale') {
        const node = this.model.nodes.find((candidate) => candidate.id === operation.nodeId);
        if (node) node.appearance = nodeAppearanceWithContentScale(node.appearance, operation.to);
      } else if (operation.type === 'set-node-content-pan') {
        const node = this.model.nodes.find((candidate) => candidate.id === operation.nodeId);
        if (node) node.appearance = nodeAppearanceWithContentOffset(node.appearance, operation.to.x, operation.to.y);
      } else if (operation.type === 'delete-nodes') {
        const deleteSet = new Set(operation.nodes.map((node) => node.id));
        this.model.nodes = this.model.nodes.filter((node) => !deleteSet.has(node.id));
        if (this.hoverNodeId && deleteSet.has(this.hoverNodeId)) this.hoverNodeId = null;
      } else if (operation.type === 'create-nodes') {
        this.model.nodes = [...this.model.nodes, ...operation.nodes.map(cloneNode)];
      } else if (operation.type === 'set-paste-counter') {
        this.pasteCounter = operation.to;
      } else if (operation.type === 'set-clipboard') {
        this.clipboard = operation.to.map(cloneNode);
      }
    }
  }

  private resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.viewW = Math.max(1, rect.width);
    this.viewH = Math.max(1, rect.height);
    this.dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    this.canvas.width = Math.round(this.viewW * this.dpr);
    this.canvas.height = Math.round(this.viewH * this.dpr);
    this.canvas.dataset.dpr = String(this.dpr);
    this.positionNodeInteraction();
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
    const interval = this.frameIntervalMs();
    const elapsed = performance.now() - this.lastRenderTime;
    if (interval > 0 && elapsed < interval) {
      this.frameQueued = true;
      this.throttleTimer = window.setTimeout(() => {
        this.throttleTimer = null;
        requestAnimationFrame(() => this.renderLoop());
      }, interval - elapsed);
      return;
    }
    this.dirty = false;
    this.render();
  }

  private render(options: RenderOptions = {}) {
    const started = performance.now();
    const { ctx, canvas, theme, dpr, camera } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    this.drawCanvasBackgroundImage();
    this.drawCanvasWash();
    this.drawCanvasPattern();

    ctx.setTransform(dpr * camera.scale, 0, 0, dpr * camera.scale, camera.x * dpr, camera.y * dpr);
    const cullBounds = this.visibleWorldBounds();
    const visibleNodes: CanvasNode[] = [];
    let projectedNodeCount = 0;
    for (const node of this.model.nodes) {
      if (!this.isNodeVisible(node)) continue;
      projectedNodeCount += 1;
      const renderNode = this.renderNode(node);
      if (!intersectsNode(renderNode, cullBounds)) continue;
      visibleNodes.push(renderNode);
    }
    const liveNodeContentOverlayNodeIds = options.drawLiveNodeContentOnCanvas === true ?
      new Set<string>() :
      this.liveNodeContentOverlayNodeIdsFor(visibleNodes, false);
    for (const node of visibleNodes) this.drawNode(node, liveNodeContentOverlayNodeIds);
    for (const node of visibleNodes) this.drawNodeHeader(node);
    this.drawMarqueeSelection();
    if (options.syncDomOverlays !== false) {
      this.syncLiveNodeContentOverlays(visibleNodes, false, liveNodeContentOverlayNodeIds);
      this.syncEmbedOverlays(visibleNodes, false);
    }
    const renderedNodes = visibleNodes.length;
    this.lastRenderedNodeIds = visibleNodes.map((node) => node.id);
    this.lastRenderedNodes = renderedNodes;
    this.lastRenderTime = performance.now();
    this.canvas.dataset.renderedNodes = String(renderedNodes);
    this.canvas.dataset.totalNodes = String(projectedNodeCount);
    this.canvas.dataset.modelNodes = String(this.model.nodes.length);
    this.onPortalLayout?.(this.portalLayoutsFor(visibleNodes));
    this.syncNodeContentToolbar();
    this.onFrameMetrics?.({
      canvasId: this.canvasId,
      mode: this.interactionMode,
      renderedNodes,
      totalNodes: projectedNodeCount,
      frameMs: performance.now() - started,
    });
    this.emitStatus();
  }

  private drawCanvasPattern() {
    const { ctx, theme } = this;
    const axes = this.gridPatternAxes();
    if (!axes) return;
    const opacity = this.canvasPatternOpacity();
    if (opacity <= 0) return;

    ctx.save();
    ctx.globalAlpha = opacity;
    switch (theme.patternKind) {
      case 'dot-grid':
        this.drawDotGrid(axes);
        break;
      case 'hatch-grid':
        this.drawHatchGrid(axes);
        break;
      case 'dashed-grid':
        this.drawLineGrid(axes, theme.gridDash);
        break;
      case 'line-grid':
        this.drawLineGrid(axes, []);
        break;
    }
    ctx.restore();
    ctx.setLineDash([]);
  }

  private drawMarqueeSelection() {
    if (this.drag?.mode !== 'marquee' || !this.drag.moved) return;
    const rect = marqueeRect(this.drag.start, this.drag.current);
    const { ctx, theme } = this;
    ctx.save();
    ctx.fillStyle = theme.selected;
    ctx.globalAlpha = 0.12;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = theme.selected;
    ctx.lineWidth = 1.5 / Math.max(this.camera.scale, MIN_SCALE);
    ctx.setLineDash([6 / Math.max(this.camera.scale, MIN_SCALE), 4 / Math.max(this.camera.scale, MIN_SCALE)]);
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    ctx.restore();
    ctx.setLineDash([]);
  }

  private drawCanvasBackgroundImage() {
    const backgroundImage = this.backgroundImage;
    const opacity = backgroundImage?.opacity ?? 1;
    if (!backgroundImage || opacity <= 0) return;
    const image = cachedAssetImage(backgroundImage.assetId);
    if (!image || image.naturalWidth <= 0 || image.naturalHeight <= 0) return;
    const { ctx, dpr, camera } = this;
    const rect = backgroundImageWorldRect(backgroundImage, image);
    const drawRect = fittedImageRect(image, rect, backgroundImage.fit ?? 'cover');
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.setTransform(dpr * camera.scale, 0, 0, dpr * camera.scale, camera.x * dpr, camera.y * dpr);
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.w, rect.h);
    ctx.clip();
    ctx.drawImage(image, drawRect.x, drawRect.y, drawRect.w, drawRect.h);
    ctx.restore();
  }

  private drawLineGrid(axes: GridPatternAxes, dash: number[]) {
    const { ctx, canvas, theme } = this;
    ctx.lineWidth = theme.gridLineWidth;
    ctx.setLineDash(dash);

    for (let pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      const major = pass === 1;
      ctx.strokeStyle = major ? theme.gridMajor : theme.grid;
      for (const x of axes.x) {
        if (x.major !== major) continue;
        ctx.moveTo(Math.round(x.screen) + 0.5, 0);
        ctx.lineTo(Math.round(x.screen) + 0.5, canvas.height);
      }
      for (const y of axes.y) {
        if (y.major !== major) continue;
        ctx.moveTo(0, Math.round(y.screen) + 0.5);
        ctx.lineTo(canvas.width, Math.round(y.screen) + 0.5);
      }
      ctx.stroke();
    }
  }

  private drawDotGrid(axes: GridPatternAxes) {
    const { ctx, theme, dpr } = this;
    if (axes.step < 10) return;
    for (let pass = 0; pass < 2; pass++) {
      const major = pass === 1;
      const radius = Math.max(0.7, theme.patternDotRadius * (major ? 1.55 : 1) * dpr);
      ctx.beginPath();
      ctx.fillStyle = major ? theme.gridMajor : theme.grid;
      for (const x of axes.x) {
        for (const y of axes.y) {
          if ((x.major || y.major) !== major) continue;
          ctx.moveTo(x.screen + radius, y.screen);
          ctx.arc(x.screen, y.screen, radius, 0, Math.PI * 2);
        }
      }
      ctx.fill();
    }
  }

  private drawHatchGrid(axes: GridPatternAxes) {
    const { ctx, theme, dpr } = this;
    if (axes.step < 12) return;
    const angle = theme.patternHatchAngle * Math.PI / 180;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    ctx.lineWidth = theme.gridLineWidth;
    for (let pass = 0; pass < 2; pass++) {
      const major = pass === 1;
      const length = theme.patternHatchLength * (major ? 1.45 : 1) * dpr;
      const half = length / 2;
      ctx.beginPath();
      ctx.strokeStyle = major ? theme.gridMajor : theme.grid;
      for (const x of axes.x) {
        for (const y of axes.y) {
          if ((x.major || y.major) !== major) continue;
          ctx.moveTo(x.screen - dx * half, y.screen - dy * half);
          ctx.lineTo(x.screen + dx * half, y.screen + dy * half);
        }
      }
      ctx.stroke();
    }
  }

  private gridPatternAxes(): GridPatternAxes | null {
    const { canvas, camera, dpr, theme } = this;
    const worldStep = theme.gridStep;
    const step = worldStep * camera.scale * dpr;
    if (step < 7) return null;

    const x: GridPatternAxisPoint[] = [];
    const y: GridPatternAxisPoint[] = [];
    const majorEvery = theme.gridMajorEvery;
    const leftWorld = -camera.x / camera.scale;
    const rightWorld = (canvas.width / dpr - camera.x) / camera.scale;
    const topWorld = -camera.y / camera.scale;
    const bottomWorld = (canvas.height / dpr - camera.y) / camera.scale;

    for (let index = Math.floor(leftWorld / worldStep) - 1; index <= Math.ceil(rightWorld / worldStep) + 1; index++) {
      x.push({
        screen: (index * worldStep * camera.scale + camera.x) * dpr,
        major: positiveModulo(index, majorEvery) === 0,
      });
    }
    for (let index = Math.floor(topWorld / worldStep) - 1; index <= Math.ceil(bottomWorld / worldStep) + 1; index++) {
      y.push({
        screen: (index * worldStep * camera.scale + camera.y) * dpr,
        major: positiveModulo(index, majorEvery) === 0,
      });
    }
    return { step, x, y };
  }

  private canvasPatternOpacity() {
    if (this.interactionMode === 'active') return this.theme.patternOpacity;
    return this.theme.patternEmbeddedOpacity;
  }

  private drawCanvasWash() {
    const { ctx, canvas, theme } = this;
    if (!theme.washOpacity || theme.wash === 'transparent') return;
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, theme.wash);
    gradient.addColorStop(0.55, 'rgba(0, 0, 0, 0)');
    ctx.save();
    ctx.globalAlpha = theme.washOpacity;
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  private drawNode(node: CanvasNode, liveNodeContentOverlayNodeIds: ReadonlySet<string>) {
    const { ctx } = this;
    const renderNode = this.renderNode(node);
    const theme = this.themeForNode(renderNode);
    const definition = nodeDefinitionFor(renderNode);
    const data = parseNodeData(renderNode);
    const chrome = this.nodeChromeState(renderNode);
    const state = {
      selected: chrome.selected,
      primary: chrome.primary,
      hovered: chrome.hovered,
      quality: 'normal' as const,
      portalPreview: this.portalPreviewState(renderNode),
    };

    this.drawNodeShell(renderNode, chrome, theme);
    const contentRect = this.nodeContentRect(renderNode, theme);
    if (!liveNodeContentOverlayNodeIds.has(renderNode.id)) {
      ctx.save();
      this.clipToNodeContent(renderNode, contentRect, theme);
      this.applyNodeContentTransform(renderNode, contentRect);
      const contentViewport = contentViewportForNode(renderNode);
      renderNodeContent({
        definition,
        ctx,
        node: renderNode,
        data,
        theme,
        contentRect,
        contentViewport,
        visibleContentRect: this.visibleNodeContentRect(renderNode, contentRect, contentViewport),
        state,
        nodeAssetService: this.nodeAssetService,
        nodeMailService: this.nodeMailService,
        requestRender: () => this.markDirty(),
      });
      ctx.restore();
    }
    this.drawNodeBorder(renderNode, chrome, theme);
    if (state.selected) {
      this.drawResizeHandle(renderNode, theme);
    }
  }

  private drawNodeHeader(node: CanvasNode) {
    const renderNode = this.renderNode(node);
    const theme = this.themeForNode(renderNode);
    const state = this.nodeChromeState(renderNode);
    const definition = nodeDefinitionFor(renderNode);
    const label = describeNode(renderNode).label || definition.displayName;
    const rect = this.nodeHeaderRect(renderNode, theme, label);
    const text = nodeText(theme);
    const padX = this.nodeHeaderPadX();
    const labelWidth = Math.max(0, rect.w - padX * 2);

    this.ctx.save();
    this.ctx.shadowColor = theme.nodeShadow;
    this.ctx.shadowBlur = state.selected || state.hovered ? Math.max(5, theme.nodeShadowBlur * 0.65) : Math.max(3, theme.nodeShadowBlur * 0.4);
    this.ctx.shadowOffsetY = Math.max(1, theme.nodeShadowOffsetY * 0.45);
    roundRectPath(this.ctx, rect.x, rect.y, rect.w, rect.h, Math.min(theme.nodeRadius, rect.h / 2));
    this.ctx.fillStyle = theme.nodeBg;
    this.ctx.fill();
    this.ctx.restore();

    this.ctx.save();
    this.ctx.font = this.nodeHeaderFont(text.micro);
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillStyle = theme.headerText;
    this.ctx.fillText(clipText(this.ctx, label, labelWidth), rect.x + padX, rect.y + rect.h / 2);
    this.ctx.restore();
  }

  private drawNodeShell(node: CanvasNode, state: NodeChromeState, theme: CanvasTheme) {
    const { ctx } = this;
    const selected = this.selectedNodeIds.has(node.id);
    const primary = node.id === this.primarySelectedNodeId;
    const hovered = node.id === this.hoverNodeId;
    const radius = theme.nodeRadius;

    if (!state.compact || selected || hovered) {
      ctx.save();
      ctx.shadowColor = theme.nodeShadow;
      ctx.shadowBlur = selected ? theme.nodeSelectedShadowBlur : theme.nodeShadowBlur;
      ctx.shadowOffsetY = theme.nodeShadowOffsetY;
      roundRectPath(ctx, node.x, node.y, node.w, node.h, radius);
      ctx.fillStyle = theme.nodeBg;
      ctx.fill();
      ctx.restore();
    } else {
      ctx.save();
      ctx.shadowColor = theme.nodeShadow;
      ctx.shadowBlur = Math.max(4, theme.nodeShadowBlur * 0.45);
      ctx.shadowOffsetY = Math.max(2, theme.nodeShadowOffsetY * 0.55);
      roundRectPath(ctx, node.x, node.y, node.w, node.h, radius);
      ctx.fillStyle = theme.nodeBg;
      ctx.fill();
      ctx.restore();
    }

    this.drawNodeBorder(node, state, theme);
  }

  private drawNodeBorder(node: CanvasNode, state: NodeChromeState, theme: CanvasTheme) {
    const { ctx } = this;
    const selected = this.selectedNodeIds.has(node.id);
    const primary = node.id === this.primarySelectedNodeId;
    const hovered = node.id === this.hoverNodeId;

    roundRectPath(ctx, node.x, node.y, node.w, node.h, theme.nodeRadius);
    ctx.strokeStyle = selected ? theme.selected : theme.nodeBorder;
    const restBorderWidth = state.compact ? Math.max(1.6, theme.nodeRestBorderWidth) : theme.nodeRestBorderWidth;
    ctx.lineWidth = primary ?
      theme.nodePrimaryBorderWidth :
      selected ?
        theme.nodeSelectedBorderWidth :
        hovered ?
          theme.nodeHoverBorderWidth :
          restBorderWidth;
    ctx.stroke();
  }

  private drawResizeHandle(node: CanvasNode, theme: CanvasTheme) {
    const handle = this.resizeHandleDrawRect(node);
    const radius = this.interactionHandleLength(3);
    this.ctx.fillStyle = theme.resizeFill;
    roundRectPath(this.ctx, handle.x, handle.y, handle.w, handle.h, radius);
    this.ctx.fill();
  }

  private nodeContentRect(node: CanvasNode, theme = this.themeForNode(node)): NodeContentRect {
    const padding = nodeDefinitionFor(node).contentPadding ?? theme.nodePadding;
    return {
      x: node.x + padding,
      y: node.y + padding,
      w: Math.max(0, node.w - padding * 2),
      h: Math.max(0, node.h - padding * 2),
    };
  }

  private nodeChromeState(node: CanvasNode): NodeChromeState {
    const selected = this.selectedNodeIds.has(node.id) || this.highlightNodeIds.has(node.id);
    return {
      selected,
      primary: node.id === this.primarySelectedNodeId,
      hovered: node.id === this.hoverNodeId,
      compact: false,
    };
  }

  private nodeHeaderRect(node: CanvasNode, theme: CanvasTheme, label = describeNode(node).label): NodeContentRect {
    const text = nodeText(theme);
    const height = this.interactionHandleSizing === 'screen-fixed' ?
      this.interactionHandleLength(NODE_HEADER_HEIGHT) :
      Math.max(NODE_HEADER_HEIGHT, theme.nodeLabelLineHeight + 8);
    const minWidth = this.interactionHandleLength(NODE_HEADER_MIN_WIDTH);
    const padX = this.nodeHeaderPadX();
    const maxWidth = Math.max(minWidth, node.w);
    this.ctx.save();
    this.ctx.font = this.nodeHeaderFont(text.micro);
    const labelWidth = this.ctx.measureText(label).width;
    this.ctx.restore();
    const preferredWidth = padX * 2 + Math.ceil(labelWidth);
    const width = Math.min(maxWidth, Math.max(minWidth, preferredWidth));
    return {
      x: node.x,
      y: node.y - height,
      w: width,
      h: height,
    };
  }

  private nodeHeaderPadX(): number {
    return this.interactionHandleLength(NODE_HEADER_PAD_X);
  }

  private nodeHeaderFont(font: string): string {
    if (this.interactionHandleSizing !== 'screen-fixed') return font;
    const scale = Math.max(this.camera.scale, MIN_SCALE);
    return scaleCanvasFont(font, scale);
  }

  worldToScreenRect(rect: { x: number; y: number; w: number; h: number }): ScreenRect {
    return {
      x: Math.round(this.camera.x + rect.x * this.camera.scale),
      y: Math.round(this.camera.y + rect.y * this.camera.scale),
      w: Math.round(rect.w * this.camera.scale),
      h: Math.round(rect.h * this.camera.scale),
    };
  }

  private clipToNodeContent(node: CanvasNode, rect: NodeContentRect, theme: CanvasTheme) {
    this.ctx.beginPath();
    if (nodeDefinitionFor(node).contentPadding === 0) {
      roundRectPath(this.ctx, node.x, node.y, node.w, node.h, theme.nodeRadius);
    } else {
      this.ctx.rect(rect.x, rect.y, rect.w, rect.h);
    }
    this.ctx.clip();
  }

  private onPointerDown = (event: PointerEvent) => {
    if (!this.acceptsInput()) return;
    if (event.pointerType !== 'touch' && event.button !== 0) return;
    event.preventDefault();
    this.closeLiveNodeContentOverlayInteraction();
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
    const selectedResizeNode = this.selectedResizeNodeAt(world);

    if (selectedResizeNode) {
      this.closeNodeInteraction();
      if (selectedResizeNode.id !== this.primarySelectedNodeId) {
        this.applyCommandPlan(this.planCommand({ type: 'select-node', nodeId: selectedResizeNode.id, source: 'pointer', mode: 'add' }), false);
      }
      this.drag = {
        mode: 'resize',
        pointerId: event.pointerId,
        node: selectedResizeNode,
        ox: world.x - (selectedResizeNode.x + selectedResizeNode.w),
        oy: world.y - (selectedResizeNode.y + selectedResizeNode.h),
        moved: false,
        original: nodeGeometry(selectedResizeNode),
        command: null,
      };
      this.interaction = 'Resize node';
      this.capturePointer(event.pointerId);
      return;
    }

    const selectedDragNode = this.selectedDragNodeAt(world);

    if (selectedDragNode) {
      this.closeNodeInteraction();
      if (selectedDragNode.id !== this.primarySelectedNodeId) {
        const mode = this.selectedNodeIds.has(selectedDragNode.id) || hasSelectionShortcutModifier(event) ? 'add' : 'replace';
        this.applyCommandPlan(this.planCommand({ type: 'select-node', nodeId: selectedDragNode.id, source: 'pointer', mode }), false);
      }
      this.drag = {
        mode: 'node',
        pointerId: event.pointerId,
        node: selectedDragNode,
        dx: world.x - selectedDragNode.x,
        dy: world.y - selectedDragNode.y,
        moved: false,
        original: nodeGeometry(selectedDragNode),
        command: null,
      };
      this.interaction = 'Drag node';
      this.capturePointer(event.pointerId);
      this.markDirty();
      this.emitStatus();
      return;
    }

    const node = this.nodeAt(world);

    if (node) {
      const selectionModifier = hasSelectionShortcutModifier(event);
      const immediateRegion = selectionModifier ? null : this.interactionRegionAt(node, world);
      if (immediateRegion?.activation === 'single') {
        if (!this.selectedNodeIds.has(node.id) || node.id !== this.primarySelectedNodeId) {
          this.executeCommand({ type: 'select-node', nodeId: node.id, mode: 'replace', source: 'pointer' });
        }
        if (this.startNodeInteraction(node, immediateRegion, 'pointer')) {
          this.markDirty();
          this.emitStatus();
          return;
        }
      }
      if (!selectionModifier && this.selectedNodeIds.has(node.id) && this.isInsideContentPanArea(node, world)) {
        const nodeIds = this.nodeContentTargetIdsFor(node.id);
        if (nodeIds.length) {
          this.closeNodeInteraction();
          this.drag = {
            mode: 'content-pan',
            pointerId: event.pointerId,
            sx: world.x,
            sy: world.y,
            nodeIds,
            moved: false,
            command: null,
          };
          this.interaction = 'Pan panel content';
          this.capturePointer(event.pointerId);
          this.canvas.style.cursor = 'grabbing';
          this.markDirty();
          this.emitStatus();
          return;
        }
      }
      const mode = selectionModifier ? 'toggle' : this.selectedNodeIds.has(node.id) ? 'add' : 'replace';
      this.executeCommand({ type: 'select-node', nodeId: node.id, mode, source: 'pointer' });
      if (!this.selectedNodeIds.has(node.id)) {
        this.interaction = 'Pointer selection';
        this.markDirty();
        this.emitStatus();
        return;
      }
      this.interaction = 'Pointer selection';
      this.markDirty();
      this.emitStatus();
      return;
    }

    if (event.shiftKey) {
      this.drag = {
        mode: 'marquee',
        pointerId: event.pointerId,
        sx: point.x,
        sy: point.y,
        start: world,
        current: world,
        moved: false,
        initialSelection: this.selectionState(),
      };
      this.interaction = 'Select panes';
      this.closeNodeInteraction();
      this.capturePointer(event.pointerId);
      this.canvas.style.cursor = 'crosshair';
      this.markDirty();
      this.emitStatus();
      return;
    }

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
    this.closeNodeInteraction();
    this.capturePointer(event.pointerId);
    this.markDirty();
    this.emitStatus();
  };

  private onPointerMove = (event: PointerEvent) => {
    if (!this.acceptsInput()) return;
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
      const command: CanvasCommand = { type: 'move-selection', dx: rawX - this.drag.original.x, dy: rawY - this.drag.original.y, source: 'pointer' };
      const plan = this.applyPreviewPlan(this.planCommand(command));
      this.drag.command = plan.operations.length ? command : null;
      this.drag.moved = plan.operations.length > 0;
    } else if (this.drag?.mode === 'content-pan') {
      const command: CanvasCommand = { type: 'pan-selection-content', dx: world.x - this.drag.sx, dy: world.y - this.drag.sy, nodeIds: this.drag.nodeIds, source: 'pointer' };
      const plan = this.applyPreviewPlan(this.planCommand(command));
      this.drag.command = plan.operations.length ? command : null;
      this.drag.moved = plan.operations.length > 0;
      this.canvas.style.cursor = 'grabbing';
    } else if (this.drag?.mode === 'resize') {
      const minSize = nodeDefinitionFor(this.drag.node).minSize;
      const rawW = Math.max(minSize.w, world.x - this.drag.ox - this.drag.node.x);
      const rawH = Math.max(minSize.h, world.y - this.drag.oy - this.drag.node.y);
      const command: CanvasCommand = { type: 'resize-selection', dw: rawW - this.drag.original.w, dh: rawH - this.drag.original.h, source: 'pointer' };
      const plan = this.applyPreviewPlan(this.planCommand(command));
      this.drag.command = plan.operations.length ? command : null;
      this.drag.moved = plan.operations.length > 0;
    } else if (this.drag?.mode === 'marquee') {
      this.drag.current = world;
      if (!this.drag.moved && Math.hypot(point.x - this.drag.sx, point.y - this.drag.sy) >= MARQUEE_DRAG_THRESHOLD) this.drag.moved = true;
      if (this.drag.moved) {
        this.applyCommandPlan(this.planCommand({ type: 'select-nodes', nodeIds: this.nodeIdsInsideMarquee(this.drag.start, this.drag.current), source: 'pointer' }), false);
        this.canvas.style.cursor = 'crosshair';
        this.markDirty();
      }
    } else if (this.drag?.mode === 'pan') {
      this.camera.x = this.drag.camX + point.x - this.drag.sx;
      this.camera.y = this.drag.camY + point.y - this.drag.sy;
      this.positionNodeInteraction();
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
      this.canvas.title = this.tooltipFor(world, node);
      this.interaction = node ? 'Hover node' : 'Idle';
    }

    this.emitStatus();
  };

  private onPointerUp = (event: PointerEvent) => {
    if (!this.acceptsInput()) return;
    if (this.gesture && this.finishTouchPointer(event.pointerId)) return;
    if (event.pointerType === 'touch') this.touchPoints.delete(event.pointerId);
    this.finishPointerInteraction(event.pointerId, true);
  };

  private onPointerCancel = (event: PointerEvent) => {
    if (!this.acceptsInput()) return;
    if (this.gesture && this.finishTouchPointer(event.pointerId)) return;
    if (event.pointerType === 'touch') this.touchPoints.delete(event.pointerId);
    this.finishPointerInteraction(event.pointerId, false);
  };

  private onLostPointerCapture = (event: PointerEvent) => {
    if (!this.acceptsInput()) return;
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
    if (!this.acceptsInput()) return;
    const step = event.shiftKey ? KEYBOARD_FAST_STEP : KEYBOARD_STEP;
    const movement = keyMovement(event.key, step);

    if (movement) {
      event.preventDefault();
      this.closeNodeInteraction();
      if (this.resizeMode) this.executeCommand({ type: 'resize-selection', dw: movement.x, dh: movement.y, source: 'keyboard' });
      else this.executeCommand({ type: 'move-selection', dx: movement.x, dy: movement.y, source: 'keyboard' });
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.finishPointerInteraction(null, false);
      this.finishTouchGesture();
      this.touchPoints.clear();
      this.executeCommand({ type: 'clear-selection', source: 'keyboard' });
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const selected = this.selectedNode();
      if (selected) {
        const region = primaryInteractionRegion(this.interactionRegionsFor(selected));
        if (region && this.startNodeInteraction(selected, region, 'keyboard')) return;
      }
      const action = selected ? describeNode(selected).actions.find((candidate) => candidate.available && candidate.id === 'enter-child-canvas') : null;
      if (selected && action && this.routeNodeAction(selected.id, action.id, 'keyboard')) {
        this.interaction = 'Keyboard node action';
      } else {
        if (!this.primarySelectedNodeId) this.selectNearestNodeToViewportCenter();
        this.interaction = this.primarySelectedNodeId ? 'Keyboard selection' : 'Keyboard no target';
      }
      this.markDirty();
      this.emitStatus();
      return;
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      this.executeCommand({ type: 'delete-selection', source: 'keyboard' });
      return;
    }

    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      this.executeCommand({ type: 'select-all-nodes', source: 'keyboard' });
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c') {
      event.preventDefault();
      this.executeCommand({ type: 'copy-selection', source: 'keyboard' });
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'v') return;

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

  private onPaste = (event: ClipboardEvent) => {
    if (!this.acceptsInput()) return;
    if (this.clipboard.length) {
      event.preventDefault();
      this.executeCommand({ type: 'paste-clipboard', source: 'keyboard' });
      return;
    }
    if (this.shouldUseSystemClipboardPaste?.(event.clipboardData ?? null)) return;
    event.preventDefault();
    this.executeCommand({ type: 'paste-clipboard', source: 'keyboard' });
  };

  private onWheel = (event: WheelEvent) => {
    if (!this.acceptsInput()) return;
    event.preventDefault();
    const point = this.eventPoint(event);
    if (event.ctrlKey || event.metaKey) {
      this.positionNodeInteraction();
      const factor = Math.exp(-event.deltaY * 0.0015);
      this.zoomAt(point.x, point.y, factor);
      this.interaction = 'Wheel zoom';
      this.emitStatus();
      return;
    }

    const delta = normalizedWheelDelta(event);
    const panX = event.shiftKey && delta.x === 0 ? delta.y : delta.x;
    const panY = event.shiftKey && delta.x === 0 ? 0 : delta.y;
    this.camera.x -= panX;
    this.camera.y -= panY;
    this.positionNodeInteraction();
    this.cursorWorld = this.screenToWorld(point.x, point.y);
    this.interaction = 'Scroll pan';
    this.markDirty();
    this.emitStatus();
  };

  private onDoubleClick = (event: MouseEvent) => {
    if (!this.acceptsInput()) return;
    if (this.onCanvasDoubleClick?.(this.canvasId, event)) {
      this.interaction = 'Entered canvas';
      this.emitStatus();
      return;
    }
    const point = this.eventPoint(event);
    const world = this.screenToWorld(point.x, point.y);
    if (this.selectedResizeNodeAt(world)) {
      event.preventDefault();
      return;
    }
    const node = this.nodeAt(world);
    if (node) {
      if (!this.selectedNodeIds.has(node.id)) this.executeCommand({ type: 'select-node', nodeId: node.id, mode: 'replace', source: 'pointer' });
      if (this.shouldEnterLiveNodeContentOverlayInteraction(node, world)) {
        event.preventDefault();
        this.enterLiveNodeContentOverlayInteraction(node.id);
        return;
      }
      const renderNode = this.renderNode(node);
      const regions = this.interactionRegionsFor(node);
      const region = this.interactionRegionAt(node, world) ?? (pointInRect(world, renderNode) ? primaryInteractionRegion(regions) : null);
      if (region && this.startNodeInteraction(node, region, 'pointer')) {
        event.preventDefault();
        return;
      }
      if (this.selectedDragNodeAt(world)) {
        event.preventDefault();
        return;
      }
    }
    const action = node ? describeNode(node).actions.find((candidate) => candidate.available && candidate.id === 'enter-child-canvas') : null;
    if (node && action && this.routeNodeAction(node.id, action.id, 'pointer')) {
      this.interaction = 'Pointer node action';
      this.markDirty();
      this.emitStatus();
      return;
    }
    if (node) {
      this.zoomAt(point.x, point.y, 1.55);
      return;
    }
    if (this.requestAddMenuForEmptyCanvas(event)) return;
  };

  private onContextMenu = (event: MouseEvent) => {
    if (!this.acceptsInput()) return;
    this.requestAddMenuForEmptyCanvas(event);
  };

  private requestAddMenuForEmptyCanvas(event: MouseEvent): boolean {
    if (!this.onCanvasAddMenuRequest) return false;
    const point = this.eventPoint(event);
    const world = this.screenToWorld(point.x, point.y);
    this.cursorWorld = world;
    if (this.selectedResizeNodeAt(world) || this.nodeAt(world)) {
      event.preventDefault();
      event.stopPropagation();
      return false;
    }
    event.preventDefault();
    event.stopPropagation();
    this.canvas.focus({ preventScroll: true });
    this.closeNodeInteraction();
    if (!this.onCanvasAddMenuRequest(this.canvasId, event, world)) return false;
    this.interaction = 'Choose panel';
    this.emitStatus();
    return true;
  }

  private zoomAt(screenX: number, screenY: number, factor: number) {
    const next = clamp(this.camera.scale * factor, MIN_SCALE, MAX_SCALE);
    const k = next / this.camera.scale;
    this.camera.x = screenX - (screenX - this.camera.x) * k;
    this.camera.y = screenY - (screenY - this.camera.y) * k;
    this.camera.scale = next;
    this.positionNodeInteraction();
    this.markDirty();
    this.emitStatus();
  }

  private renderNode(node: CanvasNode): CanvasNode {
    const preview = this.previewGeometries.get(node.id);
    const pan = this.previewContentPans.get(node.id);
    if (!preview && !pan) return node;
    return {
      ...node,
      ...(preview ?? {}),
      appearance: pan ? nodeAppearanceWithContentOffset(node.appearance, pan.x, pan.y) : node.appearance,
    };
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
      if (!this.isNodeVisible(node)) continue;
      const renderNode = this.renderNode(node);
      const header = this.nodeHeaderRect(renderNode, this.themeForNode(renderNode));
      if (
        (point.x >= renderNode.x && point.x <= renderNode.x + renderNode.w && point.y >= renderNode.y && point.y <= renderNode.y + renderNode.h) ||
        pointInRect(point, header)
      ) {
        return node;
      }
    }
    return null;
  }

  private nodeIdsInsideMarquee(start: WorldPoint, current: WorldPoint): string[] {
    const rect = marqueeRect(start, current);
    return this.model.nodes
      .filter((node) => this.isNodeVisible(node) && nodeInsideRect(this.renderNode(node), rect))
      .map((node) => node.id);
  }

  private selectedResizeNodeAt(point: WorldPoint) {
    for (let i = this.model.nodes.length - 1; i >= 0; i--) {
      const node = this.model.nodes[i];
      if (!this.selectedNodeIds.has(node.id) || !this.isNodeVisible(node)) continue;
      if (this.isInsideResizeHandle(point, node)) return node;
    }
    return null;
  }

  private selectedDragNodeAt(point: WorldPoint) {
    for (let i = this.model.nodes.length - 1; i >= 0; i--) {
      const node = this.model.nodes[i];
      if (!this.isNodeVisible(node)) continue;
      const renderNode = this.renderNode(node);
      if (this.isInsideDragHandle(point, renderNode)) return node;
    }
    return null;
  }

  private nodeInternalHit(node: CanvasNode, point: WorldPoint) {
    const definition = nodeDefinitionFor(node);
    const data = parseNodeData(node);
    const theme = this.themeForNode(node);
    const localPoint = this.nodeContentLocalPoint(node, point, theme);
    return hitTestNodeContent({
      definition,
      node,
      data,
      point: localPoint,
      contentRect: this.nodeContentRect(node, theme),
      theme,
    });
  }

  private interactionRegionsFor(node: CanvasNode): NodeInteractionRegion[] {
    if (!this.onNodeDataChange) return [];
    const definition = nodeDefinitionFor(node);
    const data = parseNodeData(node);
    const theme = this.themeForNode(node);
    const headerRect = this.nodeHeaderRect(node, theme, describeNode(node).label);
    return nodeInteractionRegions({
      definition,
      node,
      data,
      theme,
      contentRect: this.nodeContentRect(node, theme),
    })
      .map((region) => region.id === 'title' ? { ...region, rect: headerRect } : region)
      .filter((region) => region.id.trim() && region.rect.w > 0 && region.rect.h > 0);
  }

  private interactionRegionAt(node: CanvasNode, point: WorldPoint): NodeInteractionRegion | null {
    const regions = this.interactionRegionsFor(node);
    const localPoint = this.nodeContentLocalPoint(node, point, this.themeForNode(node));
    for (let index = regions.length - 1; index >= 0; index -= 1) {
      const region = regions[index];
      const testPoint = isNodeChromeRegion(region) ? point : localPoint;
      if (pointInRect(testPoint, region.rect)) return region;
    }
    return null;
  }

  private startNodeInteraction(node: CanvasNode, region: NodeInteractionRegion, source: CanvasEditSource) {
    return this.overlayLayer?.startNodeInteraction(node, region, source) ?? false;
  }

  private closeNodeInteraction() {
    this.overlayLayer?.closeNodeInteraction();
  }

  private reconcileNodeInteraction() {
    this.overlayLayer?.reconcileNodeInteraction();
  }

  private positionNodeInteraction() {
    this.overlayLayer?.positionNodeInteraction();
  }

  private cursorFor(point: WorldPoint, node: CanvasNode | null) {
    if (this.selectedResizeNodeAt(point)) return 'nwse-resize';
    if (this.selectedDragNodeAt(point)) return this.drag?.mode === 'node' ? 'grabbing' : 'grab';
    if (node && node.id === this.primarySelectedNodeId) {
      const region = this.interactionRegionAt(node, point);
      if (region?.activation === 'single') return region.cursor ?? 'pointer';
      if (this.selectedNodeIds.has(node.id) && this.isInsideContentPanArea(node, point)) return this.drag?.mode === 'content-pan' ? 'grabbing' : 'grab';
      if (region) return region.cursor ?? 'pointer';
    }
    return 'default';
  }

  private tooltipFor(_point: WorldPoint, _node: CanvasNode | null) {
    return '';
  }

  private selectedNode() {
    if (!this.primarySelectedNodeId) return null;
    return this.model.nodes.find((node) => node.id === this.primarySelectedNodeId && this.isNodeVisible(node)) ?? null;
  }

  private selectedNodes() {
    const selected = this.selectedNodeIds;
    return this.model.nodes.filter((node) => selected.has(node.id) && this.isNodeVisible(node));
  }

  private selectionIds() {
    return this.selectedNodes().map((node) => node.id);
  }

  private selectionState(): CanvasSelectionState {
    return {
      selectedNodeIds: this.selectionIds(),
      primarySelectedNodeId: this.primarySelectedNodeId,
      resizeMode: this.resizeMode,
    };
  }

  private applySelectionState(state: CanvasSelectionState) {
    this.selectedNodeIds = new Set(state.selectedNodeIds);
    this.primarySelectedNodeId = state.primarySelectedNodeId;
    this.resizeMode = state.resizeMode;
    this.reconcileNodeInteraction();
    this.reconcileLiveNodeContentOverlayInteraction();
  }

  private reconcileSelection(selectedNodeIds: Set<string>, primarySelectedNodeId: string | null) {
    const existing = new Set(this.projectedNodes().map((node) => node.id));
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
    for (const node of this.projectedNodes()) {
      const nodeCenterX = node.x + node.w / 2;
      const nodeCenterY = node.y + node.h / 2;
      const distance = (nodeCenterX - center.x) ** 2 + (nodeCenterY - center.y) ** 2;
      if (distance < nearestDistance) {
        nearest = node;
        nearestDistance = distance;
      }
    }
    if (nearest) this.executeCommand({ type: 'select-node', nodeId: nearest.id, mode: 'replace', source: 'keyboard' });
    else this.executeCommand({ type: 'clear-selection', source: 'keyboard' });
  }

  private resizeHandleRect(node: CanvasNode) {
    const size = this.interactionHandleSize(RESIZE_HANDLE, FIXED_HANDLE_HIT_SIZE);
    return {
      x: node.x + node.w - size / 2,
      y: node.y + node.h - size / 2,
      w: size,
      h: size,
    };
  }

  private resizeHandleDrawRect(node: CanvasNode) {
    if (this.interactionHandleSizing === 'world') return this.resizeHandleRect(node);
    const size = this.interactionHandleLength(FIXED_HANDLE_DRAW_SIZE);
    return {
      x: node.x + node.w - size / 2,
      y: node.y + node.h - size / 2,
      w: size,
      h: size,
    };
  }

  private interactionHandleSize(worldUnits: number, fixedScreenPx: number) {
    if (this.interactionHandleSizing === 'screen-fixed') return this.interactionHandleLength(fixedScreenPx);
    return worldUnits;
  }

  private interactionHandleLength(screenPx: number) {
    if (this.interactionHandleSizing === 'screen-fixed') return screenPx / Math.max(this.camera.scale, MIN_SCALE);
    return screenPx;
  }

  private isInsideResizeHandle(point: WorldPoint, node: CanvasNode) {
    const rect = this.resizeHandleRect(node);
    return point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h;
  }

  private isInsideDragHandle(point: WorldPoint, node: CanvasNode) {
    return pointInRect(point, this.nodeHeaderRect(node, this.themeForNode(node)));
  }

  private modelBounds() {
    const nodes = this.projectedNodes();
    if (nodes.length === 0) return null;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const node of nodes) {
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

    let commandCommitted = false;
    if (commit) {
      if (drag.mode === 'node' && drag.moved) {
        this.clearPreview();
        commandCommitted = drag.command ? this.executeCommand(drag.command) : false;
      } else if (drag.mode === 'content-pan' && drag.moved) {
        this.clearPreview();
        commandCommitted = drag.command ? this.executeCommand(drag.command) : false;
      } else if (drag.mode === 'resize' && drag.moved) {
        this.clearPreview();
        commandCommitted = drag.command ? this.executeCommand(drag.command) : false;
      } else if (drag.mode === 'marquee' && drag.moved) {
        commandCommitted = this.executeCommand({ type: 'select-nodes', nodeIds: this.nodeIdsInsideMarquee(drag.start, drag.current), source: 'pointer' });
      } else if (drag.mode === 'marquee' && !drag.moved) {
        this.interaction = 'Selection unchanged';
      } else if (drag.mode === 'pan' && drag.moved) {
        this.interaction = 'Pointer pan';
      } else if (drag.mode === 'pan' && !drag.moved) {
        commandCommitted = this.executeCommand({ type: 'clear-selection', source: 'pointer' });
      }
    } else {
      if (drag.mode === 'pan') {
        this.rollbackPan(drag);
        this.interaction = 'Interaction canceled';
      } else if (drag.mode === 'marquee') {
        this.applySelectionState(drag.initialSelection);
        this.interaction = 'Selection canceled';
      } else {
        this.clearPreview();
        this.interaction = 'Interaction canceled';
      }
    }

    this.canvas.style.cursor = 'default';
    if (!commandCommitted) {
      this.markDirty();
      this.emitStatus();
    }
  }

  private rollbackPan(drag: Extract<NonNullable<DragState>, { mode: 'pan' }>) {
    this.camera.x = drag.camX;
    this.camera.y = drag.camY;
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

  private attachInputListenersForMode() {
    this.inputController.setEnabled(this.acceptsInput());
  }

  private detachInputListeners() {
    this.inputController.detach();
  }

  private frameIntervalMs() {
    if (this.interactionMode === 'embedded-live') return PREVIEW_FRAME_INTERVAL_MS;
    if (this.interactionMode === 'preview-live') return PREVIEW_FRAME_INTERVAL_MS;
    if (this.interactionMode === 'context-live') return CONTEXT_FRAME_INTERVAL_MS;
    return 0;
  }

  private acceptsInput() {
    return this.interactionMode === 'active' || this.interactionMode === 'embedded-live';
  }

  private portalLayoutsFor(visibleNodes: CanvasNode[]): PortalLayout[] {
    const cullBounds = this.visibleWorldBounds();
    return visibleNodes
      .map((node) => {
        const portal = portalInfoForNode(node);
        if (!portal) return null;
        const theme = this.themeForNode(node);
        const worldRect = canvasPortalViewportRect(this.nodeContentRect(node, theme), theme);
        return {
          parentCanvasId: this.canvasId,
          portalNodeId: node.id,
          childCanvasId: portal.childCanvasId,
          worldRect,
          screenRect: this.worldToScreenRect(worldRect),
          visible: intersectsRect(worldRect, cullBounds),
        };
      })
      .filter((layout): layout is PortalLayout => Boolean(layout));
  }

  private themeForNode(node: CanvasNode): CanvasTheme {
    return node.appearance?.themeId ? canvasThemeFor(node.appearance.themeId) : this.theme;
  }

  private isNodeVisible(node: CanvasNode) {
    return this.nodeVisibilityFilter?.(node) ?? true;
  }

  private projectedNodes() {
    return this.nodeVisibilityFilter ? this.model.nodes.filter((node) => this.isNodeVisible(node)) : this.model.nodes;
  }

  private portalPreviewState(node: CanvasNode): 'none' | 'live' {
    const portal = portalInfoForNode(node);
    if (!portal?.childCanvasId) return 'none';
    return this.livePortalNodeIds.has(node.id) ? 'live' : 'none';
  }

  private syncLiveNodeContentOverlays(visibleNodes: CanvasNode[], compact: boolean, liveNodeIds = this.liveNodeContentOverlayNodeIdsFor(visibleNodes, compact)): void {
    const layer = this.overlayLayer?.root ?? null;
    if (!layer || compact) {
      this.disposeLiveNodeContentOverlays();
      return;
    }
    for (const node of visibleNodes) {
      if (!liveNodeIds.has(node.id)) continue;
      const theme = this.themeForNode(node);
      const screenRect = this.worldToScreenRect(this.nodeContentRect(node, theme));
      this.syncLiveNodeContentOverlaySlot(layer, node, theme, screenRect);
    }
    for (const [nodeId, slot] of this.liveNodeContentOverlaySlots) {
      if (liveNodeIds.has(nodeId)) continue;
      slot.overlay.dispose();
      this.liveNodeContentOverlaySlots.delete(nodeId);
    }
    this.reconcileLiveNodeContentOverlayInteraction(liveNodeIds);
  }

  private liveNodeContentOverlayNodeIdsFor(visibleNodes: CanvasNode[], compact: boolean): Set<string> {
    const live = new Set<string>();
    if (!this.overlayLayer || compact) return live;
    const portalRects = this.portalLayoutsFor(visibleNodes)
      .filter((layout) => layout.visible && layout.childCanvasId)
      .map((layout) => layout.screenRect);
    for (const [index, node] of visibleNodes.entries()) {
      if (!this.shouldUseLiveNodeContentOverlay(node)) continue;
      const theme = this.themeForNode(node);
      const screenRect = this.worldToScreenRect(this.nodeContentRect(node, theme));
      if (screenRect.w < 96 || screenRect.h < 56) continue;
      if (this.liveNodeContentOverlayWouldBreakStacking(screenRect, visibleNodes, index, portalRects)) continue;
      live.add(node.id);
    }
    return live;
  }

  private syncLiveNodeContentOverlaySlot(layer: HTMLDivElement, node: CanvasNode, theme: CanvasTheme, rect: ScreenRect): void {
    let slot = this.liveNodeContentOverlaySlots.get(node.id);
    if (!slot || slot.nodeType !== node.type) {
      slot?.overlay.dispose();
      const overlay = createLiveNodeContentOverlay({
        node,
        theme,
        commit: (nextData) => this.commitLiveNodeContentOverlay(node.id, nextData),
        select: () => this.selectLiveNodeContentOverlayNode(node.id),
        close: () => this.closeLiveNodeContentOverlayInteraction(),
      });
      if (!overlay) return;
      layer.append(overlay.root);
      slot = { overlay, nodeType: node.type };
      this.liveNodeContentOverlaySlots.set(node.id, slot);
    }
    slot.overlay.root.style.left = `${rect.x}px`;
    slot.overlay.root.style.top = `${rect.y}px`;
    slot.overlay.root.style.width = `${Math.max(1, rect.w)}px`;
    slot.overlay.root.style.height = `${Math.max(1, rect.h)}px`;
    slot.overlay.update(node);
    slot.overlay.updateViewport(this.screenContentViewportForNode(node));
    slot.overlay.setInteractive(this.liveNodeContentInteractionNodeId === node.id);
  }

  private disposeLiveNodeContentOverlays(): void {
    for (const slot of this.liveNodeContentOverlaySlots.values()) slot.overlay.dispose();
    this.liveNodeContentOverlaySlots.clear();
  }

  private liveNodeContentOverlayWouldBreakStacking(rect: ScreenRect, visibleNodes: CanvasNode[], nodeIndex: number, portalRects: ScreenRect[]): boolean {
    for (let index = nodeIndex + 1; index < visibleNodes.length; index += 1) {
      if (screenRectsOverlap(rect, this.worldToScreenRect(visibleNodes[index]))) return true;
    }
    return portalRects.some((portalRect) => screenRectsOverlap(rect, portalRect));
  }

  private shouldUseLiveNodeContentOverlay(node: CanvasNode): boolean {
    if (this.overlayLayer?.activeNodeId === node.id) return false;
    if (!this.onNodeDataChange) return false;
    if (!hasLiveNodeContentOverlay(node)) return false;
    const rect = this.worldToScreenRect(this.nodeContentRect(node, this.themeForNode(node)));
    return rect.w >= 96 && rect.h >= 56;
  }

  private shouldEnterLiveNodeContentOverlayInteraction(node: CanvasNode, point: WorldPoint): boolean {
    if (!this.liveNodeContentOverlaySlots.has(node.id)) return false;
    const renderNode = this.renderNode(node);
    return pointInRect(point, this.nodeContentRect(renderNode, this.themeForNode(renderNode)));
  }

  private commitLiveNodeContentOverlay(nodeId: string, nextData: NodeData): void {
    const current = this.model.nodes.find((candidate) => candidate.id === nodeId);
    if (!current || sameNodeData(current.data, nextData)) return;
    const committed = this.onNodeDataChange?.(nodeId, current.data, nextData, 'pointer') ?? false;
    this.interaction = committed ? 'Edited panel' : 'Panel edit unchanged';
    if (committed) this.markDirty();
    this.emitStatus();
  }

  private selectLiveNodeContentOverlayNode(nodeId: string): void {
    if (!this.acceptsInput()) return;
    const mode = this.selectedNodeIds.has(nodeId) ? 'add' : 'replace';
    this.executeCommand({ type: 'select-node', nodeId, mode, source: 'pointer' });
  }

  private enterLiveNodeContentOverlayInteraction(nodeId: string): void {
    const overlay = this.liveNodeContentOverlaySlots.get(nodeId)?.overlay;
    if (!overlay) return;
    this.closeNodeInteraction();
    this.liveNodeContentInteractionNodeId = nodeId;
    overlay.setInteractive(true);
    this.interaction = 'Editing panel';
    this.markDirty();
    this.syncNodeContentToolbar();
    this.emitStatus();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.liveNodeContentOverlaySlots.get(nodeId)?.overlay.focus();
      });
    });
  }

  private closeLiveNodeContentOverlayInteraction(): void {
    const nodeId = this.liveNodeContentInteractionNodeId;
    if (!nodeId) return;
    const overlay = this.liveNodeContentOverlaySlots.get(nodeId)?.overlay;
    overlay?.setInteractive(false);
    if (overlay?.root.contains(document.activeElement)) this.canvas.focus({ preventScroll: true });
    this.liveNodeContentInteractionNodeId = null;
    this.syncNodeContentToolbar();
    this.markDirty();
    this.emitStatus();
  }

  private reconcileLiveNodeContentOverlayInteraction(liveNodeIds?: ReadonlySet<string>): void {
    const nodeId = this.liveNodeContentInteractionNodeId;
    if (!nodeId) return;
    if (!this.selectedNodeIds.has(nodeId)) {
      this.closeLiveNodeContentOverlayInteraction();
      return;
    }
    if (liveNodeIds && !liveNodeIds.has(nodeId)) this.closeLiveNodeContentOverlayInteraction();
  }

  private syncEmbedOverlays(visibleNodes: CanvasNode[], compact: boolean): void {
    const layer = this.overlayLayer?.root ?? null;
    if (!layer || compact) {
      this.disposeEmbedOverlays();
      return;
    }
    const live = new Set<string>();
    const portalRects = this.portalLayoutsFor(visibleNodes)
      .filter((layout) => layout.visible && layout.childCanvasId)
      .map((layout) => layout.screenRect);
    for (const [index, node] of visibleNodes.entries()) {
      if (this.overlayLayer?.activeNodeId === node.id) continue;
      const embed = embedOverlayForNode(node);
      if (!embed) continue;
      const theme = this.themeForNode(node);
      const worldRect = this.nodeContentVisualRect(node, this.nodeContentRect(node, theme), theme);
      const screenRect = this.worldToScreenRect(worldRect);
      if (screenRect.w < 96 || screenRect.h < 64) continue;
      if (this.embedOverlayWouldBreakStacking(screenRect, visibleNodes, index, portalRects)) continue;
      live.add(node.id);
      this.syncEmbedOverlaySlot(layer, node.id, embed, screenRect);
    }
    for (const [nodeId, slot] of this.embedOverlaySlots) {
      if (live.has(nodeId)) continue;
      slot.root.remove();
      this.embedOverlaySlots.delete(nodeId);
    }
  }

  private syncEmbedOverlaySlot(layer: HTMLDivElement, nodeId: string, embed: EmbedOverlayData, rect: ScreenRect): void {
    let slot = this.embedOverlaySlots.get(nodeId);
    if (!slot) {
      const root = document.createElement('div');
      root.className = 'node-embed-preview-mount';
      root.dataset.nodeId = nodeId;
      const frame = document.createElement('iframe');
      frame.className = 'node-embed-preview-frame';
      frame.loading = 'lazy';
      frame.referrerPolicy = 'strict-origin-when-cross-origin';
      frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
      frame.allowFullscreen = true;
      frame.sandbox.add('allow-same-origin', 'allow-scripts', 'allow-popups', 'allow-forms');
      root.append(frame);
      layer.append(root);
      slot = { root, frame, src: '' };
      this.embedOverlaySlots.set(nodeId, slot);
    }
    slot.root.style.left = `${rect.x}px`;
    slot.root.style.top = `${rect.y}px`;
    slot.root.style.width = `${Math.max(1, rect.w)}px`;
    slot.root.style.height = `${Math.max(1, rect.h)}px`;
    slot.frame.title = embed.title;
    if (slot.src !== embed.frameUrl) {
      slot.src = embed.frameUrl;
      slot.frame.src = embed.frameUrl;
    }
  }

  private disposeEmbedOverlays(): void {
    for (const slot of this.embedOverlaySlots.values()) slot.root.remove();
    this.embedOverlaySlots.clear();
  }

  private embedOverlayWouldBreakStacking(rect: ScreenRect, visibleNodes: CanvasNode[], nodeIndex: number, portalRects: ScreenRect[]): boolean {
    for (let index = nodeIndex + 1; index < visibleNodes.length; index += 1) {
      if (screenRectsOverlap(rect, this.worldToScreenRect(visibleNodes[index]))) return true;
    }
    return portalRects.some((portalRect) => screenRectsOverlap(rect, portalRect));
  }

  private routeNodeAction(nodeId: string, actionId: string, source: CanvasEditSource) {
    return this.onNodeAction?.(nodeId, actionId, source) ?? false;
  }

  private syncNodeContentToolbar(): void {
    this.nodeContentToolbar?.sync();
  }

  private nodeContentToolbarNode(): CanvasNode | null {
    const primary = this.primarySelectedNodeId ? this.model.nodes.find((node) => node.id === this.primarySelectedNodeId && this.canZoomNodeContent(node)) ?? null : null;
    if (primary) return this.renderNode(primary);
    const hovered = this.hoverNodeId ? this.model.nodes.find((node) => node.id === this.hoverNodeId && this.canZoomNodeContent(node)) ?? null : null;
    return hovered ? this.renderNode(hovered) : null;
  }

  private contentZoomTargetNodes(nodeIds?: string[]): CanvasNode[] {
    const ids = nodeIds?.length ? new Set(nodeIds) : this.selectedNodeIds;
    return this.model.nodes.filter((node) => ids.has(node.id) && this.canZoomNodeContent(node));
  }

  private nodeContentTargetIdsFor(nodeId: string): string[] {
    if (this.selectedNodeIds.has(nodeId)) {
      return this.model.nodes
        .filter((node) => this.selectedNodeIds.has(node.id) && this.canZoomNodeContent(node))
        .map((node) => node.id);
    }
    const node = this.model.nodes.find((candidate) => candidate.id === nodeId && this.canZoomNodeContent(candidate));
    return node ? [node.id] : [];
  }

  private isInsideContentPanArea(node: CanvasNode, point: WorldPoint): boolean {
    if (!this.canZoomNodeContent(node)) return false;
    const renderNode = this.renderNode(node);
    return pointInRect(point, this.nodeContentRect(renderNode, this.themeForNode(renderNode)));
  }

  private canZoomNodeContent(node: CanvasNode): boolean {
    return node.type !== BuiltInNodeTypes.canvas && this.isNodeVisible(node);
  }

  private screenContentViewportForNode(node: CanvasNode): NodeContentViewport {
    const viewport = contentViewportForNode(node);
    return {
      scale: viewport.scale,
      offsetX: viewport.offsetX * this.camera.scale,
      offsetY: viewport.offsetY * this.camera.scale,
    };
  }

  private applyNodeContentTransform(node: CanvasNode, contentRect: NodeContentRect): void {
    const viewport = contentViewportForNode(node);
    if (viewport.scale === DEFAULT_NODE_CONTENT_SCALE && viewport.offsetX === 0 && viewport.offsetY === 0) return;
    const centerX = contentRect.x + contentRect.w / 2;
    const centerY = contentRect.y + contentRect.h / 2;
    this.ctx.translate(viewport.offsetX, viewport.offsetY);
    this.ctx.translate(centerX, centerY);
    this.ctx.scale(viewport.scale, viewport.scale);
    this.ctx.translate(-centerX, -centerY);
  }

  private visibleNodeContentRect(node: CanvasNode, contentRect: NodeContentRect, viewport = contentViewportForNode(node)): NodeContentRect {
    const centerX = contentRect.x + contentRect.w / 2;
    const centerY = contentRect.y + contentRect.h / 2;
    return {
      x: centerX + (contentRect.x - viewport.offsetX - centerX) / viewport.scale,
      y: centerY + (contentRect.y - viewport.offsetY - centerY) / viewport.scale,
      w: contentRect.w / viewport.scale,
      h: contentRect.h / viewport.scale,
    };
  }

  private nodeContentLocalPoint(node: CanvasNode, point: WorldPoint, theme: CanvasTheme): WorldPoint {
    const viewport = contentViewportForNode(node);
    if (viewport.scale === DEFAULT_NODE_CONTENT_SCALE && viewport.offsetX === 0 && viewport.offsetY === 0) return point;
    const contentRect = this.nodeContentRect(node, theme);
    const centerX = contentRect.x + contentRect.w / 2;
    const centerY = contentRect.y + contentRect.h / 2;
    return {
      x: centerX + (point.x - viewport.offsetX - centerX) / viewport.scale,
      y: centerY + (point.y - viewport.offsetY - centerY) / viewport.scale,
    };
  }

  private nodeContentVisualRect(node: CanvasNode, rect: NodeContentRect, theme: CanvasTheme): NodeContentRect {
    const viewport = contentViewportForNode(node);
    if (viewport.scale === DEFAULT_NODE_CONTENT_SCALE && viewport.offsetX === 0 && viewport.offsetY === 0) return rect;
    const contentRect = this.nodeContentRect(node, theme);
    const centerX = contentRect.x + contentRect.w / 2;
    const centerY = contentRect.y + contentRect.h / 2;
    return intersectNodeContentRects({
      x: centerX + (rect.x - centerX) * viewport.scale + viewport.offsetX,
      y: centerY + (rect.y - centerY) * viewport.scale + viewport.offsetY,
      w: rect.w * viewport.scale,
      h: rect.h * viewport.scale,
    }, contentRect);
  }
}

function cloneModel(model: CanvasModel): CanvasModel {
  return { schemaVersion: 2, nodes: model.nodes.map(cloneNode) };
}

type EmbedOverlayData = {
  frameUrl: string;
  title: string;
};

function embedOverlayForNode(node: CanvasNode): EmbedOverlayData | null {
  if (node.type !== BuiltInNodeTypes.embed) return null;
  const rawUrl = asString(node.data.url, '');
  const normalized = normalizeEmbedUrl(rawUrl, { allowLocalHttp: allowLocalHttpForCurrentHost() });
  if (!normalized) return null;
  const title = asString(node.data.title, '') || embedTitleForUrl(normalized);
  return {
    frameUrl: embedFrameUrlForUrl(normalized),
    title,
  };
}

function allowLocalHttpForCurrentHost(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}

function sameNodeData(left: NodeData, right: NodeData): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function cloneNode(node: CanvasNode): CanvasNode {
  return {
    ...node,
    appearance: cloneNodeAppearance(node.appearance),
    data: cloneNodeData(node.data),
  };
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

function cloneBackgroundImage(backgroundImage: CanvasBackgroundImage | null): CanvasBackgroundImage | null {
  const assetId = typeof backgroundImage?.assetId === 'string' ? backgroundImage.assetId.trim() : '';
  if (!assetId) return null;
  return {
    assetId,
    fit: backgroundImage?.fit === 'contain' || backgroundImage?.fit === 'stretch' ? backgroundImage.fit : 'cover',
    opacity: clampNumber(backgroundImage?.opacity, 0, 1, 1),
    x: finiteNumberOrUndefined(backgroundImage?.x),
    y: finiteNumberOrUndefined(backgroundImage?.y),
    w: positiveNumberOrUndefined(backgroundImage?.w),
    h: positiveNumberOrUndefined(backgroundImage?.h),
  };
}

function sameBackgroundImage(a: CanvasBackgroundImage | null, b: CanvasBackgroundImage | null) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.assetId === b.assetId && (a.fit ?? 'cover') === (b.fit ?? 'cover') && (a.opacity ?? 1) === (b.opacity ?? 1) && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

function backgroundImageWorldRect(backgroundImage: CanvasBackgroundImage, image: HTMLImageElement) {
  const w = backgroundImage.w ?? image.naturalWidth;
  const h = backgroundImage.h ?? image.naturalHeight;
  return {
    x: backgroundImage.x ?? 0,
    y: backgroundImage.y ?? 0,
    w,
    h,
  };
}

function fittedImageRect(image: HTMLImageElement, rect: NodeGeometry, fit: CanvasBackgroundImage['fit'] = 'cover') {
  if (fit === 'stretch') return rect;
  const scale = fit === 'contain'
    ? Math.min(rect.w / image.naturalWidth, rect.h / image.naturalHeight)
    : Math.max(rect.w / image.naturalWidth, rect.h / image.naturalHeight);
  const w = image.naturalWidth * scale;
  const h = image.naturalHeight * scale;
  return {
    x: rect.x + (rect.w - w) / 2,
    y: rect.y + (rect.h - h) / 2,
    w,
    h,
  };
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function finiteNumberOrUndefined(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function scaleCanvasFont(font: string, scale: number): string {
  return font.replace(/(\d+(?:\.\d+)?)px/g, (_match, size: string) => `${Number(size) / scale}px`);
}

function positiveNumberOrUndefined(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function previewGeometriesFrom(operations: CanvasOperation[]) {
  const geometries = new Map<string, NodeGeometry>();
  for (const operation of operations) {
    if (operation.type === 'set-node-geometry') geometries.set(operation.nodeId, operation.to);
  }
  return geometries;
}

function previewContentPansFrom(operations: CanvasOperation[]) {
  const pans = new Map<string, CanvasNodeContentPan>();
  for (const operation of operations) {
    if (operation.type === 'set-node-content-pan') pans.set(operation.nodeId, operation.to);
  }
  return pans;
}

function operationAffectsRender(operation: CanvasOperation) {
  return operation.type !== 'set-clipboard' && operation.type !== 'set-paste-counter';
}

function sameStringSet(a: Set<string>, b: Set<string>) {
  if (a.size !== b.size) return false;
  for (const id of a) {
    if (!b.has(id)) return false;
  }
  return true;
}

function isNodeChromeRegion(region: NodeInteractionRegion): boolean {
  return region.id === 'title';
}

function primaryInteractionRegion(regions: NodeInteractionRegion[]): NodeInteractionRegion | null {
  return regions.find((region) => region.id === PRIMARY_NODE_EDIT_REGION_ID) ?? regions[0] ?? null;
}

function intersectNodeContentRects(a: NodeContentRect, b: NodeContentRect): NodeContentRect {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  return {
    x: x1,
    y: y1,
    w: Math.max(1, x2 - x1),
    h: Math.max(1, y2 - y1),
  };
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

function normalizedWheelDelta(event: WheelEvent) {
  const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? WHEEL_LINE_PX : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? WHEEL_PAGE_PX : 1;
  return { x: event.deltaX * unit, y: event.deltaY * unit };
}

function marqueeRect(start: WorldPoint, current: WorldPoint): NodeGeometry {
  const x0 = Math.min(start.x, current.x);
  const y0 = Math.min(start.y, current.y);
  const x1 = Math.max(start.x, current.x);
  const y1 = Math.max(start.y, current.y);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function nodeInsideRect(node: CanvasNode, rect: NodeGeometry) {
  return node.x >= rect.x && node.y >= rect.y && node.x + node.w <= rect.x + rect.w && node.y + node.h <= rect.y + rect.h;
}

function intersectsNode(node: CanvasNode, bounds: VisibleWorldBounds) {
  return !(node.x > bounds.x1 || node.x + node.w < bounds.x0 || node.y > bounds.y1 || node.y + node.h < bounds.y0);
}

function intersectsRect(rect: { x: number; y: number; w: number; h: number }, bounds: VisibleWorldBounds) {
  return !(rect.x > bounds.x1 || rect.x + rect.w < bounds.x0 || rect.y > bounds.y1 || rect.y + rect.h < bounds.y0);
}

function screenRectsOverlap(a: ScreenRect, b: ScreenRect) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function pointInRect(point: WorldPoint, rect: { x: number; y: number; w: number; h: number }) {
  return point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h;
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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function positiveModulo(value: number, modulus: number) {
  return ((value % modulus) + modulus) % modulus;
}
