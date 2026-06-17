import { CanvasEngine } from '../CanvasEngine';
import {
  cameraForCanvas,
  cloneModel,
  cloneDocumentCollection,
  selectNodeInCanvas,
  selectionForCanvas,
  setCameraForCanvas,
  setSelectionForCanvas,
} from '../documentModel';
import {
  openDeleteConfirmation,
  planDocumentCommand,
  selectedPortalNodesWithChildren,
  stripPortalChildReferenceOnPaste,
} from '../documentCommands';
import { parseNodeData } from '../nodeTypes/registry';
import { BuiltInNodeTypes, type CanvasCommand, type CanvasModel, type CanvasPortalNodeData, type CanvasSelectionState, type PortalLayout, type ThemeName, type ViewportStatus } from '../types';
import type {
  CanvasDocumentCollection,
  CanvasDocumentId,
  CanvasWorkspaceHistory,
  CanvasWorkspaceSnapshot,
  DocumentCommand,
  DocumentModelChange,
  ParentContextPaneLayout,
} from '../documentTypes';
import {
  createWorkspaceHistory,
  createWorkspaceSnapshot,
  hydrateWorkspaceSnapshot,
  pushWorkspaceHistory,
  redoWorkspaceHistory,
  replaceWorkspacePresent,
  undoWorkspaceHistory,
} from '../workspaceHistory';
import { DEFAULT_WORKSPACE_STORAGE_ID, loadWorkspaceSnapshot, loadWorkspaceSnapshotMirror, saveWorkspaceSnapshot, saveWorkspaceSnapshotMirror } from '../workspaceStorage';
import { ACTIVE_ENGINE_FRAME_BUDGET_MS, livePortalSlotsFor, MAX_LIVE_PORTAL_PREVIEWS, MAX_TOTAL_ENGINES } from './engineSlots';
import {
  buildParentContextField,
  DEFAULT_PARENT_CONTEXT_PANE_LAYOUT,
  normalizeParentContextPaneLayout,
  type ParentContextPaneLayoutConstraints,
} from './parentContextField';
import { portalOverlayStyle } from './portalLayout';
import type { NestedCanvasWorkspaceChromeState } from './NestedCanvasWorkspace';

export type NativeNestedCanvasControllerOptions = {
  root: HTMLElement;
  initialCollection: CanvasDocumentCollection;
  theme: ThemeName;
  fitOnFirstLoad?: boolean;
  storageKey?: string;
  onCollectionChange?: (collection: CanvasDocumentCollection, changes: DocumentModelChange[]) => void;
  onChromeStateChange?: (state: NestedCanvasWorkspaceChromeState) => void;
};

type Slot = {
  key: string;
  canvasId: CanvasDocumentId;
  wrapper: HTMLDivElement;
  viewport: HTMLDivElement;
  parentContextField: HTMLDivElement;
  parentContextOwnerKey: string;
  childOverlayLayer: HTMLDivElement;
  resizers: HTMLDivElement;
  canvas: HTMLCanvasElement;
  engine: CanvasEngine;
  portalLayouts: PortalLayout[];
  sizeSignature: string;
};

type ParentContextCanvasSlot = {
  key: string;
  ownerKey: string;
  canvasId: CanvasDocumentId;
  region: string;
  clip: HTMLDivElement;
  canvas: HTMLCanvasElement;
  engine: CanvasEngine;
  sizeSignature: string;
};

type ResizeButtonState = {
  handle: ParentContextResizeHandle;
  paneLayout: ParentContextPaneLayout;
  stageRect: DOMRect;
  onChange: (layout: ParentContextPaneLayout, commit: boolean) => void;
};

const EMBEDDED_PARENT_CONTEXT_CONSTRAINTS: ParentContextPaneLayoutConstraints = {
  minPaneBand: 1,
  minCenterBand: 1,
};

const resizeButtonState = new WeakMap<HTMLButtonElement, ResizeButtonState>();

const initialStatus: ViewportStatus = {
  zoom: 1,
  selectedNodeId: null,
  selectedNodeIds: [],
  selectionCount: 0,
  cursorWorld: null,
  renderedNodes: 0,
  totalNodes: 0,
  interaction: 'Idle',
};

export class NativeNestedCanvasController {
  private readonly root: HTMLElement;
  private readonly storageKey: string;
  private readonly fitOnFirstLoad: boolean;
  private readonly onCollectionChange?: (collection: CanvasDocumentCollection, changes: DocumentModelChange[]) => void;
  private readonly onChromeStateChange?: (state: NestedCanvasWorkspaceChromeState) => void;
  private readonly historyRef: { current: CanvasWorkspaceHistory };
  private readonly collectionRef: { current: CanvasDocumentCollection };
  private readonly lastModelChangeRef: { current: DocumentModelChange | null } = { current: null };
  private readonly slots = new Map<string, Slot>();
  private readonly parentContextSlots = new Map<string, ParentContextCanvasSlot>();
  private readonly activeFrameOverBudgetCount = { current: 0 };

  private theme: ThemeName;
  private status: ViewportStatus = initialStatus;
  private previewCapacity = MAX_LIVE_PORTAL_PREVIEWS;
  private activeEngine: CanvasEngine | null = null;
  private stage: HTMLDivElement;
  private center: HTMLDivElement;
  private parentContextField: HTMLDivElement;
  private overlayLayer: HTMLDivElement;
  private activeCanvas: HTMLCanvasElement;
  private resizerLayer: HTMLDivElement;
  private portalLayouts: PortalLayout[] = [];
  private storageReady = false;
  private userMutationBeforeStorageReady = false;
  private restoredFromStorage = false;
  private didAutoFitInitialView = false;
  private disposed = false;
  private overlayFrame: number | null = null;
  private overlayTimer: number | null = null;
  private lastOverlayRenderAt = 0;
  private viewportSaveTimer: number | null = null;
  private liveStatusTimer: number | null = null;
  private lastLiveStatusEmitAt = 0;
  private lastOverlaySignature = '';
  private overlayRenderCount = 0;
  private overlayStableCount = 0;
  private commitCount = 0;
  private resizeObserver: ResizeObserver;

  constructor(options: NativeNestedCanvasControllerOptions) {
    this.root = options.root;
    this.theme = options.theme;
    this.fitOnFirstLoad = options.fitOnFirstLoad ?? true;
    this.storageKey = options.storageKey ?? DEFAULT_WORKSPACE_STORAGE_ID;
    this.onCollectionChange = options.onCollectionChange;
    this.onChromeStateChange = options.onChromeStateChange;
    this.historyRef = { current: createWorkspaceHistory(options.initialCollection) };
    this.collectionRef = { current: this.historyRef.current.present };

    this.root.replaceChildren();
    this.root.classList.add('nested-workspace-native');
    this.root.dataset.activeCanvasId = this.collectionRef.current.activeCanvasId;

    this.stage = document.createElement('div');
    this.stage.className = 'nested-stage';
    this.stage.dataset.animation = 'off';
    this.stage.dataset.nativeCanvas = 'true';

    this.center = document.createElement('div');
    this.center.className = 'nested-center-cell';

    this.activeCanvas = document.createElement('canvas');
    this.activeCanvas.className = 'canvas-surface active-plane';
    this.activeCanvas.dataset.engineMode = 'active';
    this.activeCanvas.setAttribute('aria-label', 'Active canvas');

    this.overlayLayer = document.createElement('div');
    this.overlayLayer.className = 'portal-overlays';
    this.overlayLayer.setAttribute('aria-label', 'Live child canvas previews');

    this.parentContextField = document.createElement('div');
    this.parentContextField.className = 'parent-context-field native-parent-context-field';
    this.parentContextField.setAttribute('aria-label', 'Parent canvas context');

    this.resizerLayer = document.createElement('div');
    this.resizerLayer.className = 'parent-context-resizers native-resizers';
    this.resizerLayer.setAttribute('aria-label', 'Resize parent context panes');

    this.center.append(this.activeCanvas, this.overlayLayer);
    this.stage.append(this.center, this.parentContextField, this.resizerLayer);
    this.root.append(this.stage);

    this.resizeObserver = new ResizeObserver(() => {
      this.layout();
      this.scheduleOverlayRender();
    });
    this.resizeObserver.observe(this.root);

    this.createActiveEngine();
    this.exposeDebugApi();
    this.emitChromeState();
    this.record('controller:create', {
      activeCanvasId: this.collectionRef.current.activeCanvasId,
      documents: Object.keys(this.collectionRef.current.documents).length,
    });
    this.restoreStorage();
  }

  dispose() {
    this.disposed = true;
    this.record('controller:dispose', { slots: this.slots.size });
    if (this.overlayFrame !== null) cancelAnimationFrame(this.overlayFrame);
    if (this.overlayTimer !== null) window.clearTimeout(this.overlayTimer);
    if (this.viewportSaveTimer !== null) window.clearTimeout(this.viewportSaveTimer);
    if (this.liveStatusTimer !== null) window.clearTimeout(this.liveStatusTimer);
    this.resizeObserver.disconnect();
    this.activeEngine?.dispose();
    this.activeEngine = null;
    this.disposeParentContextSlots();
    this.disposeSlots();
    if ((window as Window & { __canwayNested?: unknown }).__canwayNested) {
      delete (window as Window & { __canwayNested?: unknown }).__canwayNested;
    }
    this.root.replaceChildren();
  }

  setTheme(theme: ThemeName) {
    if (this.theme === theme) return;
    this.theme = theme;
    this.activeEngine?.setTheme(theme);
    for (const slot of this.slots.values()) slot.engine.setTheme(theme);
  }

  fitActiveCanvas() {
    this.activeEngine?.fit();
    this.persistViewportFromActiveEngine();
  }

  resetActiveZoom() {
    this.activeEngine?.resetZoom();
    this.persistViewportFromActiveEngine();
  }

  zoomActiveBy(factor: number) {
    this.activeEngine?.zoomBy(factor);
    this.persistViewportFromActiveEngine();
  }

  undoWorkspace(): boolean {
    const current = replaceWorkspacePresent(this.historyRef.current, this.saveActiveViewport(this.collectionRef.current));
    if (!current.undoStack.length) return false;
    this.commitWorkspaceHistory(undoWorkspaceHistory(current), 'Undo');
    return true;
  }

  redoWorkspace(): boolean {
    const current = replaceWorkspacePresent(this.historyRef.current, this.saveActiveViewport(this.collectionRef.current));
    if (!current.redoStack.length) return false;
    this.commitWorkspaceHistory(redoWorkspaceHistory(current), 'Redo');
    return true;
  }

  executeActiveCanvasCommand(command: CanvasCommand): boolean {
    return this.activeEngine?.executeCommand(command) ?? false;
  }

  executeDocumentCommand(command: DocumentCommand): void {
    const base = this.saveActiveViewport(this.collectionRef.current);
    const plan = planDocumentCommand(base, command);
    if (plan.changes.some((change) => change.kind === 'active-canvas-change')) {
      this.commitActiveCanvasTransition(plan.collection, plan.changes, plan.interaction);
      return;
    }
    this.commitCollection(plan.collection, plan.changes);
    this.setStatus({ ...this.status, interaction: plan.interaction });
  }

  collection(): CanvasDocumentCollection {
    return cloneDocumentCollection(this.collectionRef.current);
  }

  getWorkspaceSnapshot(): CanvasWorkspaceSnapshot {
    const current = replaceWorkspacePresent(this.historyRef.current, this.saveActiveViewport(this.collectionRef.current));
    return createWorkspaceSnapshot(current, this.lastModelChangeRef.current);
  }

  loadWorkspaceSnapshot(snapshot: CanvasWorkspaceSnapshot, interaction = 'Document loaded'): void {
    const hydrated = hydrateWorkspaceSnapshot(snapshot);
    this.historyRef.current = hydrated.history;
    this.collectionRef.current = hydrated.history.present;
    this.lastModelChangeRef.current = hydrated.lastModelChange;
    this.setStatus({ ...this.status, interaction });
    this.mirrorWorkspaceSnapshot(hydrated);
    void saveWorkspaceSnapshot(hydrated, this.storageKey);
    this.onCollectionChange?.(hydrated.history.present, []);
    this.renderCollection();
  }

  async flushWorkspaceSnapshot(): Promise<void> {
    await saveWorkspaceSnapshot(this.getWorkspaceSnapshot(), this.storageKey);
  }

  replaceCollection(next: CanvasDocumentCollection, options: { persist?: boolean; notify?: boolean; recordHistory?: boolean } = {}) {
    this.userMutationBeforeStorageReady = true;
    this.record('collection:replace', {
      documents: Object.keys(next.documents).length,
      activeCanvasId: next.activeCanvasId,
      persist: options.persist ?? true,
      notify: options.notify ?? true,
      recordHistory: options.recordHistory ?? false,
    });
    this.commitCollection(cloneDocumentCollection(next), [], options);
  }

  private async restoreStorage() {
    this.storageReady = false;
    this.userMutationBeforeStorageReady = false;
    this.restoredFromStorage = Boolean(loadWorkspaceSnapshotMirror(this.storageKey));
    try {
      const snapshot = await loadWorkspaceSnapshot(this.storageKey);
      if (this.disposed) return;
      if (snapshot) this.restoredFromStorage = true;
      if (!snapshot || this.userMutationBeforeStorageReady) return;
      this.historyRef.current = snapshot.history;
      this.collectionRef.current = snapshot.history.present;
      this.lastModelChangeRef.current = snapshot.lastModelChange;
      this.setStatus({ ...this.status, interaction: 'Workspace restored' });
      this.renderCollection();
    } catch (error) {
      console.warn('Failed to load Canway workspace snapshot', error);
    } finally {
      this.storageReady = true;
      this.maybeAutoFit();
      this.emitChromeState();
    }
  }

  private createActiveEngine() {
    this.activeEngine?.dispose();
    const collection = this.collectionRef.current;
    const active = collection.documents[collection.activeCanvasId];
    this.record('engine:active:create', {
      canvasId: collection.activeCanvasId,
      nodes: active?.model.nodes.length ?? 0,
    });
    this.activeCanvas.dataset.engineMode = 'active';
    this.activeEngine = new CanvasEngine(this.activeCanvas, {
      canvasId: collection.activeCanvasId,
      interactionMode: 'active',
      onStatus: (status) => this.handleActiveStatus(this.collectionRef.current.activeCanvasId, status),
      onModelChange: (model) => this.handleActiveModelChange(this.collectionRef.current.activeCanvasId, model),
      onPortalLayout: (layouts) => this.handleActivePortalLayouts(layouts),
      onNodeAction: (nodeId, actionId, source) => {
        this.executeDocumentCommand({ type: 'execute-node-action', canvasId: this.collectionRef.current.activeCanvasId, nodeId, actionId, source });
        return true;
      },
      onFrameMetrics: (metrics) => this.handleFrameMetrics(metrics.frameMs),
      beforeCommand: (command) => this.handleBeforeCommand(command),
      transformPastedNode: stripPortalChildReferenceOnPaste,
      pasteInteractionForNodes: (nodes) => nodes.some((node) => node.type === BuiltInNodeTypes.canvas) ? 'Pasted canvas node without child contents' : null,
    });
    if (active) this.activeEngine.setModel(active.model);
    this.activeEngine.setTheme(this.theme);
    this.activeEngine.setCamera(cameraForCanvas(collection, collection.activeCanvasId));
    this.activeEngine.setSelectionState(selectionForCanvas(collection, collection.activeCanvasId));
    this.layout();
    this.maybeAutoFit();
  }

  private renderCollection() {
    const collection = this.collectionRef.current;
    this.record('collection:render', {
      activeCanvasId: collection.activeCanvasId,
      slots: this.slots.size,
      portalLayouts: this.portalLayouts.length,
    });
    this.root.dataset.activeCanvasId = collection.activeCanvasId;
    this.activeCanvas.setAttribute('aria-label', `${collection.documents[collection.activeCanvasId]?.title ?? 'Active canvas'} active canvas`);
    this.disposeParentContextSlots();
    this.createActiveEngine();
    this.disposeSlots();
    this.portalLayouts = [];
    this.lastOverlaySignature = '';
    this.scheduleOverlayRender();
    this.emitChromeState();
    this.exposeDebugApi();
  }

  private layout() {
    const collection = this.collectionRef.current;
    const rect = this.root.getBoundingClientRect();
    const paneLayout = collection.view.paneLayouts[collection.activeCanvasId] ?? DEFAULT_PARENT_CONTEXT_PANE_LAYOUT;
    const hasParent = Boolean(collection.documents[collection.activeCanvasId]?.parentCanvasId);
    const normalized = hasParent ? normalizeParentContextPaneLayout(rectToDomRect(rect), paneLayout) : { left: 0, right: 0, top: 0, bottom: 0 };
    this.stage.style.gridTemplateColumns = `${normalized.left}px minmax(0, 1fr) ${normalized.right}px`;
    this.stage.style.gridTemplateRows = `${normalized.top}px minmax(0, 1fr) ${normalized.bottom}px`;
    this.resizerLayer.style.display = hasParent ? '' : 'none';
    this.renderParentContextCanvases(this.parentContextField, `active:${collection.activeCanvasId}`, collection.activeCanvasId, rectToDomRect(rect), normalized);
    if (hasParent) this.renderResizers(this.resizerLayer, normalized, rectToDomRect(rect), true, (next, commit) => this.handlePaneLayoutChange(collection.activeCanvasId, next, commit));
  }

  private scheduleOverlayRender() {
    if (this.overlayFrame !== null || this.overlayTimer !== null || this.disposed) return;
    const now = performance.now();
    const minInterval = this.lastOverlaySignature ? 50 : 0;
    const waitMs = Math.max(0, minInterval - (now - this.lastOverlayRenderAt));
    if (waitMs > 0) {
      this.overlayTimer = window.setTimeout(() => {
        this.overlayTimer = null;
        this.scheduleOverlayRender();
      }, waitMs);
      return;
    }
    this.overlayFrame = requestAnimationFrame(() => {
      this.overlayFrame = null;
      this.lastOverlayRenderAt = performance.now();
      this.renderOverlays();
    });
  }

  private renderOverlays() {
    const collection = this.collectionRef.current;
    const liveLayouts = livePortalSlotsFor(collection, this.portalLayouts).slice(0, Math.min(this.previewCapacity, MAX_TOTAL_ENGINES - 1));
    const signature = liveLayouts.map((layout) => `${layout.portalNodeId}:${layout.childCanvasId}`).join('|');
    const topologyChanged = signature !== this.lastOverlaySignature;
    if (!topologyChanged) {
      this.overlayStableCount += 1;
    }
    const previousSignature = this.lastOverlaySignature;
    this.lastOverlaySignature = signature;
    this.overlayRenderCount += 1;
    this.record('overlay:render', {
      renderCount: this.overlayRenderCount,
      changed: Boolean(previousSignature) && topologyChanged,
      liveLayouts: liveLayouts.length,
      previewCapacity: this.previewCapacity,
      previousSlots: this.slots.size,
      stableSkips: this.overlayStableCount,
    });
    let remaining = MAX_TOTAL_ENGINES - 1;
    const seen = new Set<string>();
    for (const layout of liveLayouts) {
      if (remaining <= 0 || !layout.childCanvasId) break;
      remaining -= this.createOverlayViewport(this.overlayLayer, layout.childCanvasId, layout, remaining, 0, 'active', seen);
    }
    this.disposeSlotsExcept(seen);
    this.updateLivePortalIds();
    this.emitChromeState();
  }

  private createOverlayViewport(parent: HTMLElement, canvasId: CanvasDocumentId, layout: PortalLayout, remaining: number, depth: number, ownerPath: string, seen: Set<string>): number {
    const canvasDocument = this.collectionRef.current.documents[canvasId];
    if (!canvasDocument || remaining <= 0) return 0;
    const key = `embedded:${ownerPath}:${depth}:${canvasId}:${layout.portalNodeId}`;
    seen.add(key);
    const existing = this.slots.get(key);
    if (existing) {
      if (existing.wrapper.parentElement !== parent) parent.append(existing.wrapper);
      this.updateOverlayViewport(existing, layout);
      let used = 1;
      used += this.renderEmbeddedChildOverlays(existing, remaining - used, depth + 1, seen);
      return used;
    }
    this.record('overlay:viewport:create', {
      canvasId,
      depth,
      portalNodeId: layout.portalNodeId,
      remaining,
      ownerPath,
      nodes: canvasDocument.model.nodes.length,
    });

    const wrapper = document.createElement('div');
    wrapper.className = 'portal-overlay';
    applyPortalOverlayStyle(wrapper, layout);

    const viewport = document.createElement('div');
    viewport.className = 'embedded-nested-viewport native-embedded-viewport';
    viewport.dataset.canvasId = canvasId;
    viewport.dataset.depth = String(depth);

    const center = document.createElement('div');
    center.className = 'nested-center-cell';

    const canvas = document.createElement('canvas');
    canvas.className = 'canvas-surface embedded-plane';
    canvas.dataset.engineMode = 'embedded-live';
    canvas.setAttribute('aria-label', `${canvasDocument.title} live preview`);

    const childOverlayLayer = document.createElement('div');
    childOverlayLayer.className = 'portal-overlays';

    const parentContextField = document.createElement('div');
    parentContextField.className = 'parent-context-field native-parent-context-field';
    parentContextField.setAttribute('aria-label', 'Nested parent canvas context');
    parentContextField.style.display = 'none';

    const resizers = document.createElement('div');
    resizers.className = 'parent-context-resizers native-resizers';
    resizers.setAttribute('aria-label', 'Resize nested panes');
    resizers.style.display = 'none';

    center.append(canvas, childOverlayLayer);
    viewport.append(center, parentContextField, resizers);
    wrapper.append(viewport);
    parent.append(wrapper);

    const stageRect = screenRectToDomRect(layout.screenRect);
    viewport.style.gridTemplateColumns = '0px minmax(0, 1fr) 0px';
    viewport.style.gridTemplateRows = '0px minmax(0, 1fr) 0px';
    const parentContextOwnerKey = `context:${key}`;

    const engine = new CanvasEngine(canvas, {
      canvasId,
      interactionMode: 'embedded-live',
      onStatus: () => undefined,
      onModelChange: (model) => this.handleEmbeddedModelChange(canvasId, model),
      onCanvasDoubleClick: (targetCanvasId) => {
        this.executeDocumentCommand({ type: 'select-canvas', canvasId: targetCanvasId, source: 'pointer' });
        return true;
      },
      onPortalLayout: (layouts) => this.handleEmbeddedPortalLayouts(key, layouts),
    });
    engine.setModel(canvasDocument.model);
    engine.setTheme(this.theme);
    engine.setSelectionState(selectionForCanvas(this.collectionRef.current, canvasId));
    this.slots.set(key, { key, canvasId, wrapper, viewport, parentContextField, parentContextOwnerKey, childOverlayLayer, resizers, canvas, engine, portalLayouts: [], sizeSignature: sizeSignature(stageRect) });
    requestAnimationFrame(() => {
      if (this.disposed || !this.slots.has(key)) return;
      engine.fit(16);
    });

    const slot = this.slots.get(key);
    return 1 + (slot ? this.renderEmbeddedChildOverlays(slot, remaining - 1, depth + 1, seen) : 0);
  }

  private renderEmbeddedChildOverlays(slot: Slot, remaining: number, depth: number, seen: Set<string>): number {
    if (remaining <= 0 || !slot.portalLayouts.length) return 0;
    const collection = this.collectionRef.current;
    const liveLayouts = livePortalSlotsFor(collection, slot.portalLayouts).slice(0, remaining);
    this.record('embedded:child-overlays:render', {
      canvasId: slot.canvasId,
      depth,
      remaining,
      layouts: slot.portalLayouts.length,
      liveLayouts: liveLayouts.length,
      rects: slot.portalLayouts.map((layout) => ({
        id: layout.portalNodeId,
        child: layout.childCanvasId,
        visible: layout.visible,
        w: Math.round(layout.screenRect.w),
        h: Math.round(layout.screenRect.h),
      })),
    });
    let used = 0;
    for (const layout of liveLayouts) {
      if (remaining - used <= 0 || !layout.childCanvasId) break;
      used += this.createOverlayViewport(slot.childOverlayLayer, layout.childCanvasId, layout, remaining - used, depth, slot.key, seen);
    }
    return used;
  }

  private handleEmbeddedPortalLayouts(slotKey: string, layouts: PortalLayout[]) {
    const slot = this.slots.get(slotKey);
    if (!slot || samePortalLayouts(slot.portalLayouts, layouts)) return;
    slot.portalLayouts = layouts;
    this.record('embedded:portal-layouts:update', {
      canvasId: slot.canvasId,
      count: layouts.length,
      visible: layouts.filter((layout) => layout.visible && layout.childCanvasId).length,
    });
    this.scheduleOverlayRender();
  }

  private updateOverlayViewport(slot: Slot, layout: PortalLayout) {
    applyPortalOverlayStyle(slot.wrapper, layout);
    const stageRect = screenRectToDomRect(layout.screenRect);
    const nextSizeSignature = sizeSignature(stageRect);
    if (nextSizeSignature === slot.sizeSignature) return;
    slot.sizeSignature = nextSizeSignature;
    slot.viewport.style.gridTemplateColumns = '0px minmax(0, 1fr) 0px';
    slot.viewport.style.gridTemplateRows = '0px minmax(0, 1fr) 0px';
    this.disposeParentContextSlotsForOwner(slot.parentContextOwnerKey);
    this.record('overlay:viewport:update', {
      canvasId: slot.canvasId,
      width: Math.round(stageRect.width),
      height: Math.round(stageRect.height),
    });
  }

  private renderResizers(
    layer: HTMLElement,
    paneLayout: ParentContextPaneLayout,
    stageRect: DOMRect,
    isCurrentView: boolean,
    onChange: (layout: ParentContextPaneLayout, commit: boolean) => void,
  ) {
    layer.dataset.currentView = String(isCurrentView);
    const width = Math.max(1, stageRect.width);
    const height = Math.max(1, stageRect.height);
    const centerW = Math.max(1, width - paneLayout.left - paneLayout.right);
    const centerH = Math.max(1, height - paneLayout.top - paneLayout.bottom);
    const rightX = width - paneLayout.right;
    const bottomY = height - paneLayout.bottom;
    const lineWidth = isCurrentView ? 6 : 1;
    const lineOffset = lineWidth / 2;
    const cornerSize = isCurrentView ? 6 : 1;
    const cornerOffset = cornerSize / 2;
    const handles: Array<[ParentContextResizeHandle, string, Partial<CSSStyleDeclaration>]> = [
      ['left', 'Resize west panes', { left: `${paneLayout.left - lineOffset}px`, top: `${paneLayout.top}px`, width: `${lineWidth}px`, height: `${centerH}px` }],
      ['right', 'Resize east panes', { left: `${rightX - lineOffset}px`, top: `${paneLayout.top}px`, width: `${lineWidth}px`, height: `${centerH}px` }],
      ['top', 'Resize north panes', { left: `${paneLayout.left}px`, top: `${paneLayout.top - lineOffset}px`, width: `${centerW}px`, height: `${lineWidth}px` }],
      ['bottom', 'Resize south panes', { left: `${paneLayout.left}px`, top: `${bottomY - lineOffset}px`, width: `${centerW}px`, height: `${lineWidth}px` }],
      ['top-left', 'Resize northwest intersection', { left: `${paneLayout.left - cornerOffset}px`, top: `${paneLayout.top - cornerOffset}px`, width: `${cornerSize}px`, height: `${cornerSize}px` }],
      ['top-right', 'Resize northeast intersection', { left: `${rightX - cornerOffset}px`, top: `${paneLayout.top - cornerOffset}px`, width: `${cornerSize}px`, height: `${cornerSize}px` }],
      ['bottom-left', 'Resize southwest intersection', { left: `${paneLayout.left - cornerOffset}px`, top: `${bottomY - cornerOffset}px`, width: `${cornerSize}px`, height: `${cornerSize}px` }],
      ['bottom-right', 'Resize southeast intersection', { left: `${rightX - cornerOffset}px`, top: `${bottomY - cornerOffset}px`, width: `${cornerSize}px`, height: `${cornerSize}px` }],
    ];
    const seen = new Set<string>();
    for (const [handle, label, style] of handles) {
      seen.add(handle);
      let button = layer.querySelector<HTMLButtonElement>(`button[data-resize-handle="${handle}"]`);
      if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        button.dataset.resizeHandle = handle;
        this.attachResizeHandle(button);
        layer.append(button);
      }
      button.className = `parent-context-resizer ${handle.includes('-') ? 'corner' : handle === 'left' || handle === 'right' ? 'vertical' : 'horizontal'}`;
      button.setAttribute('aria-label', label);
      Object.assign(button.style, style);
      resizeButtonState.set(button, { handle, paneLayout: { ...paneLayout }, stageRect, onChange });
    }
    for (const button of [...layer.querySelectorAll<HTMLButtonElement>('button[data-resize-handle]')]) {
      if (!button.dataset.resizeHandle || seen.has(button.dataset.resizeHandle)) continue;
      resizeButtonState.delete(button);
      button.remove();
    }
  }

  private attachResizeHandle(button: HTMLButtonElement) {
    let start: { x: number; y: number; layout: ParentContextPaneLayout; last: ParentContextPaneLayout; state: ResizeButtonState } | null = null;
    button.addEventListener('pointerdown', (event) => {
      const state = resizeButtonState.get(button);
      if (!state) return;
      event.preventDefault();
      event.stopPropagation();
      try {
        button.setPointerCapture(event.pointerId);
      } catch {
        // Synthetic and interrupted pointer streams may not have an active pointer to capture.
      }
      start = { x: event.clientX, y: event.clientY, layout: { ...state.paneLayout }, last: { ...state.paneLayout }, state };
    });
    button.addEventListener('pointermove', (event) => {
      if (!start) return;
      event.preventDefault();
      event.stopPropagation();
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      const next = { ...start.layout };
      const { handle, stageRect, onChange } = start.state;
      if (handle === 'left' || handle === 'top-left' || handle === 'bottom-left') next.left = start.layout.left + dx;
      if (handle === 'right' || handle === 'top-right' || handle === 'bottom-right') next.right = start.layout.right - dx;
      if (handle === 'top' || handle === 'top-left' || handle === 'top-right') next.top = start.layout.top + dy;
      if (handle === 'bottom' || handle === 'bottom-left' || handle === 'bottom-right') next.bottom = start.layout.bottom - dy;
      start.last = normalizeParentContextPaneLayout(stageRect, next);
      onChange(start.last, false);
    });
    const stop = (event: PointerEvent) => {
      if (!start) return;
      event.preventDefault();
      event.stopPropagation();
      start.state.onChange(start.last, true);
      start = null;
    };
    button.addEventListener('pointerup', stop);
    button.addEventListener('pointercancel', stop);
  }

  private handlePaneLayoutChange(canvasId: CanvasDocumentId, nextLayout: ParentContextPaneLayout, commit = true) {
    const base = this.collectionRef.current;
    if (!base.documents[canvasId]) return;
    const current = base.view.paneLayouts[canvasId];
    if (current && current.left === nextLayout.left && current.right === nextLayout.right && current.top === nextLayout.top && current.bottom === nextLayout.bottom) return;
    base.view.paneLayouts[canvasId] = { ...nextLayout };
    this.historyRef.current = { ...this.historyRef.current, present: base };
    this.collectionRef.current = base;
    this.record('pane:layout:change', {
      canvasId,
      left: Math.round(nextLayout.left),
      right: Math.round(nextLayout.right),
      top: Math.round(nextLayout.top),
      bottom: Math.round(nextLayout.bottom),
      commit,
    });
    if (canvasId === base.activeCanvasId) {
      this.layout();
    } else {
      this.layoutEmbeddedPane(canvasId, nextLayout);
    }
    if (!commit) return;
    if (this.storageReady) this.scheduleViewportSnapshotMirror();
    this.emitChromeState();
  }

  private layoutEmbeddedPane(canvasId: CanvasDocumentId, _paneLayout: ParentContextPaneLayout) {
    for (const slot of this.slots.values()) {
      if (slot.canvasId !== canvasId) continue;
      this.disposeParentContextSlotsForOwner(slot.parentContextOwnerKey);
      slot.viewport.style.gridTemplateColumns = '0px minmax(0, 1fr) 0px';
      slot.viewport.style.gridTemplateRows = '0px minmax(0, 1fr) 0px';
    }
  }

  private renderParentContextCanvases(layer: HTMLElement, ownerKey: string, canvasId: CanvasDocumentId, stageRect: DOMRect, paneLayout: ParentContextPaneLayout) {
    const field = buildParentContextField(this.collectionRef.current, stageRect, canvasId, paneLayout, canvasId === this.collectionRef.current.activeCanvasId ? {} : EMBEDDED_PARENT_CONTEXT_CONSTRAINTS);
    const seen = new Set<string>();
    for (const shape of field.shapes) {
      if (!shape.childCanvasId) continue;
      const canvasDocument = this.collectionRef.current.documents[shape.childCanvasId];
      if (!canvasDocument) continue;
      const rect = shape.projectedRect;
      if (rect.w <= 0 || rect.h <= 0) continue;
      const key = `${ownerKey}:${shape.region}:${shape.childCanvasId}`;
      seen.add(key);
      let slot = this.parentContextSlots.get(key);
      if (!slot) {
        slot = this.createParentContextCanvasSlot(key, ownerKey, shape.region, shape.childCanvasId);
        this.parentContextSlots.set(key, slot);
      }
      if (slot.clip.parentElement !== layer) layer.append(slot.clip);
      applyParentContextClipStyle(slot.clip, rect);
      slot.clip.dataset.region = shape.region;
      slot.clip.dataset.canvasId = shape.childCanvasId;
      const nextSizeSignature = rectSizeSignature(rect);
      if (slot.canvasId !== shape.childCanvasId) {
        slot.canvasId = shape.childCanvasId;
        slot.engine.setCanvasId(shape.childCanvasId);
      }
      slot.engine.setTheme(this.theme);
      slot.engine.setModel(canvasDocument.model, { preserveInteraction: true });
      slot.engine.setSelectionState(selectionForCanvas(this.collectionRef.current, shape.childCanvasId));
      if (slot.sizeSignature !== nextSizeSignature) {
        slot.sizeSignature = nextSizeSignature;
        requestAnimationFrame(() => {
          if (this.disposed || !this.parentContextSlots.has(key)) return;
          slot?.engine.fit(parentContextFitPadding(rect));
        });
      }
    }

    this.disposeParentContextSlotsExcept(ownerKey, seen);
  }

  private createParentContextCanvasSlot(key: string, ownerKey: string, region: string, canvasId: CanvasDocumentId): ParentContextCanvasSlot {
    const clip = document.createElement('div');
    clip.className = 'parent-context-canvas-clip native-parent-context-canvas-clip';
    clip.dataset.region = region;
    clip.dataset.canvasId = canvasId;
    const canvas = document.createElement('canvas');
    canvas.className = 'parent-context-canvas';
    canvas.dataset.engineMode = 'context-live';
    canvas.setAttribute('aria-label', `${this.collectionRef.current.documents[canvasId]?.title ?? 'Sibling'} context canvas`);
    clip.append(canvas);
    const engine = new CanvasEngine(canvas, {
      canvasId,
      interactionMode: 'context-live',
      onStatus: () => undefined,
      onCanvasDoubleClick: (targetCanvasId) => {
        this.executeDocumentCommand({ type: 'select-canvas', canvasId: targetCanvasId, source: 'pointer' });
        return true;
      },
      onPortalLayout: () => undefined,
    });
    const canvasDocument = this.collectionRef.current.documents[canvasId];
    if (canvasDocument) engine.setModel(canvasDocument.model);
    engine.setTheme(this.theme);
    engine.setSelectionState(selectionForCanvas(this.collectionRef.current, canvasId));
    this.record('parent-context:canvas:create', { ownerKey, canvasId, region });
    return { key, ownerKey, canvasId, region, clip, canvas, engine, sizeSignature: '' };
  }

  private handleActiveStatus(canvasId: CanvasDocumentId, nextStatus: ViewportStatus) {
    if (this.collectionRef.current.activeCanvasId !== canvasId) return;
    this.setLiveStatus(nextStatus);
    this.persistViewportFromActiveEngine();
  }

  private handleActiveModelChange(canvasId: CanvasDocumentId, model: CanvasModel) {
    const base = this.collectionRef.current;
    if (base.activeCanvasId !== canvasId) return;
    this.commitCanvasModelInPlace(canvasId, model);
  }

  private handleEmbeddedModelChange(canvasId: CanvasDocumentId, model: CanvasModel) {
    const base = this.collectionRef.current;
    if (!base.documents[canvasId]) return;
    this.commitCanvasModelInPlace(canvasId, model);
  }

  private commitCanvasModelInPlace(canvasId: CanvasDocumentId, model: CanvasModel) {
    if (model.schemaVersion !== 2) throw new Error('Canvas documents only accept schemaVersion 2 models');
    const base = this.collectionRef.current;
    const document = base.documents[canvasId];
    if (!document) return;
    const next: CanvasDocumentCollection = {
      ...base,
      documents: {
        ...base.documents,
        [canvasId]: {
          ...document,
          model: cloneModel(model),
        },
      },
      view: {
        ...base.view,
        cameras: { ...base.view.cameras },
        selections: { ...base.view.selections },
        paneLayouts: { ...base.view.paneLayouts },
        stackPath: base.view.stackPath.map((frame) => ({ ...frame })),
        previewFocus: base.view.previewFocus ? { ...base.view.previewFocus } : null,
        parentContext: {
          ...base.view.parentContext,
          shapes: base.view.parentContext.shapes.map((shape) => ({ ...shape, projectedRect: { ...shape.projectedRect }, node: cloneModel({ schemaVersion: 2, nodes: [shape.node] }).nodes[0] })),
        },
        deleteConfirmation: base.view.deleteConfirmation ? { ...base.view.deleteConfirmation, nodeIds: [...base.view.deleteConfirmation.nodeIds] } : null,
      },
    };
    updateParentPortalSummary(next, canvasId);
    const nextHistory = pushWorkspaceHistory(this.historyRef.current, next);
    this.historyRef.current = nextHistory;
    this.collectionRef.current = nextHistory.present;
    if (this.storageReady) this.scheduleViewportSnapshotMirror();
    this.onCollectionChange?.(nextHistory.present, []);
    this.emitChromeState();
  }

  private handleActivePortalLayouts(layouts: PortalLayout[]) {
    if (samePortalLayouts(this.portalLayouts, layouts)) return;
    this.record('portal:layouts:update', {
      count: layouts.length,
      visible: layouts.filter((layout) => layout.visible && layout.childCanvasId).length,
    });
    this.portalLayouts = layouts;
    this.scheduleOverlayRender();
  }

  private handleBeforeCommand(command: CanvasCommand) {
    if (command.type === 'delete-selection') {
      const base = this.saveActiveViewport(this.collectionRef.current);
      const selected = selectedPortalNodesWithChildren(base, base.activeCanvasId);
      if (selected.length) {
        const plan = openDeleteConfirmation(base, base.activeCanvasId, selected.map((node) => node.id), command.source);
        this.commitCollection(plan.collection, plan.changes);
        this.setStatus({ ...this.status, interaction: plan.interaction });
        return false;
      }
    }
    return command;
  }

  private handleFrameMetrics(frameMs: number) {
    if (frameMs > ACTIVE_ENGINE_FRAME_BUDGET_MS) {
      this.activeFrameOverBudgetCount.current += 1;
      if (this.activeFrameOverBudgetCount.current >= 3) {
        this.activeFrameOverBudgetCount.current = 0;
        this.previewCapacity = Math.max(0, this.previewCapacity - 1);
        this.record('frame:budget:degrade', {
          frameMs: Math.round(frameMs * 10) / 10,
          previewCapacity: this.previewCapacity,
        }, 'warn');
        this.scheduleOverlayRender();
      }
      return;
    }
    this.activeFrameOverBudgetCount.current = 0;
    if (this.previewCapacity < MAX_LIVE_PORTAL_PREVIEWS) {
      this.previewCapacity += 1;
      this.scheduleOverlayRender();
    }
  }

  private persistViewportFromActiveEngine() {
    const engine = this.activeEngine;
    if (!engine) return;
    const base = this.collectionRef.current;
    const nextCamera = engine.getCamera();
    const nextSelection = engine.getSelectionState();
    const currentCamera = cameraForCanvas(base, base.activeCanvasId);
    const currentSelection = selectionForCanvas(base, base.activeCanvasId);
    if (sameCamera(currentCamera, nextCamera) && sameSelectionState(currentSelection, nextSelection)) return;
    base.view.cameras[base.activeCanvasId] = nextCamera;
    base.view.selections[base.activeCanvasId] = {
      selectedNodeIds: [...nextSelection.selectedNodeIds],
      primarySelectedNodeId: nextSelection.primarySelectedNodeId,
      resizeMode: nextSelection.resizeMode,
    };
    this.historyRef.current = { ...this.historyRef.current, present: base };
    this.collectionRef.current = base;
    if (this.storageReady) this.scheduleViewportSnapshotMirror();
  }

  private scheduleViewportSnapshotMirror() {
    if (this.viewportSaveTimer !== null) window.clearTimeout(this.viewportSaveTimer);
    this.viewportSaveTimer = window.setTimeout(() => {
      this.viewportSaveTimer = null;
      this.mirrorWorkspaceSnapshot(createWorkspaceSnapshot(this.historyRef.current, this.lastModelChangeRef.current));
    }, 250);
  }

  private saveActiveViewport(base: CanvasDocumentCollection) {
    const engine = this.activeEngine;
    if (!engine) return base;
    const withCamera = setCameraForCanvas(base, base.activeCanvasId, engine.getCamera());
    return setSelectionForCanvas(withCamera, base.activeCanvasId, engine.getSelectionState());
  }

  private commitCollection(next: CanvasDocumentCollection, changes: DocumentModelChange[], options: { recordHistory?: boolean; persist?: boolean; notify?: boolean } = {}) {
    const recordHistory = options.recordHistory ?? changes.length > 0;
    const persist = options.persist ?? true;
    const notify = options.notify ?? true;
    this.commitCount += 1;
    this.record('collection:commit', {
      commitCount: this.commitCount,
      changes: changes.length,
      recordHistory,
      persist,
      notify,
      activeCanvasId: next.activeCanvasId,
    });
    const nextHistory = recordHistory ? pushWorkspaceHistory(this.historyRef.current, next) : replaceWorkspacePresent(this.historyRef.current, next);
    const meaningfulMutation = recordHistory || changes.length > 0;
    const nextLastModelChange = changes.length ? changes[changes.length - 1] : this.lastModelChangeRef.current;
    if (!this.storageReady && meaningfulMutation) this.userMutationBeforeStorageReady = true;
    if (persist && (this.storageReady || meaningfulMutation)) this.mirrorWorkspaceSnapshot(createWorkspaceSnapshot(nextHistory, nextLastModelChange));
    this.historyRef.current = nextHistory;
    this.collectionRef.current = nextHistory.present;
    this.lastModelChangeRef.current = nextLastModelChange;
    if (notify) this.onCollectionChange?.(nextHistory.present, changes);
    this.renderCollection();
  }

  private commitActiveCanvasTransition(next: CanvasDocumentCollection, changes: DocumentModelChange[], interaction: string) {
    const nextHistory = pushWorkspaceHistory(this.historyRef.current, next);
    this.historyRef.current = nextHistory;
    this.collectionRef.current = nextHistory.present;
    this.lastModelChangeRef.current = changes.length ? changes[changes.length - 1] : this.lastModelChangeRef.current;
    const collection = this.collectionRef.current;
    const active = collection.documents[collection.activeCanvasId];
    this.record('collection:active-transition', {
      activeCanvasId: collection.activeCanvasId,
      changes: changes.length,
      previousSlots: this.slots.size,
    });
    this.root.dataset.activeCanvasId = collection.activeCanvasId;
    this.activeCanvas.setAttribute('aria-label', `${active?.title ?? 'Active canvas'} active canvas`);
    if (active && this.activeEngine) {
      this.activeEngine.setCanvasId(collection.activeCanvasId);
      this.activeEngine.setModel(active.model);
      this.activeEngine.setTheme(this.theme);
      this.activeEngine.setCamera(cameraForCanvas(collection, collection.activeCanvasId));
      this.activeEngine.setSelectionState(selectionForCanvas(collection, collection.activeCanvasId));
    } else {
      this.createActiveEngine();
    }
    this.disposeSlots();
    this.disposeParentContextSlots();
    this.portalLayouts = [];
    this.lastOverlaySignature = '';
    this.setStatus({ ...this.status, interaction });
    this.layout();
    this.scheduleOverlayRender();
    if (this.storageReady) this.scheduleViewportSnapshotMirror();
    this.onCollectionChange?.(collection, changes);
    this.exposeDebugApi();
  }

  private commitWorkspaceHistory(nextHistory: CanvasWorkspaceHistory, interaction: string) {
    if (!this.storageReady) this.userMutationBeforeStorageReady = true;
    this.mirrorWorkspaceSnapshot(createWorkspaceSnapshot(nextHistory, this.lastModelChangeRef.current));
    this.historyRef.current = nextHistory;
    this.collectionRef.current = nextHistory.present;
    this.setStatus({ ...this.status, interaction });
    this.onCollectionChange?.(nextHistory.present, []);
    this.renderCollection();
  }

  private mirrorWorkspaceSnapshot(snapshot: CanvasWorkspaceSnapshot) {
    saveWorkspaceSnapshotMirror(snapshot, this.storageKey);
  }

  private maybeAutoFit() {
    if (!this.fitOnFirstLoad || this.restoredFromStorage || this.didAutoFitInitialView || !this.activeEngine) return;
    if (this.collectionRef.current.activeCanvasId !== this.collectionRef.current.rootCanvasId) return;
    this.didAutoFitInitialView = true;
    requestAnimationFrame(() => {
      if (this.disposed || !this.activeEngine) return;
      this.activeEngine.fit();
      this.persistViewportFromActiveEngine();
      this.setStatus({ ...this.status, interaction: 'Fit view' });
    });
  }

  private setStatus(status: ViewportStatus) {
    this.status = status;
    this.emitChromeState();
  }

  private setLiveStatus(status: ViewportStatus) {
    this.status = status;
    const now = performance.now();
    if (now - this.lastLiveStatusEmitAt >= 80) {
      this.lastLiveStatusEmitAt = now;
      this.emitChromeState();
      return;
    }
    if (this.liveStatusTimer !== null) return;
    this.liveStatusTimer = window.setTimeout(() => {
      this.liveStatusTimer = null;
      this.lastLiveStatusEmitAt = performance.now();
      this.emitChromeState();
    }, 80);
  }

  private emitChromeState() {
    this.onChromeStateChange?.({
      collection: this.collectionRef.current,
      status: this.status,
      lastModelChange: this.lastModelChangeRef.current,
      canUndo: this.historyRef.current.undoStack.length > 0,
      canRedo: this.historyRef.current.redoStack.length > 0,
    });
  }

  private updateLivePortalIds() {
    const ids = new Set(this.portalLayouts.filter((layout) => layout.childCanvasId).map((layout) => layout.portalNodeId));
    this.activeEngine?.setLivePortalNodeIds(ids);
  }

  private disposeSlots() {
    if (this.slots.size) this.record('engine:embedded:dispose', { slots: this.slots.size });
    for (const slot of this.slots.values()) {
      this.disposeParentContextSlotsForOwner(slot.parentContextOwnerKey);
      slot.engine.dispose();
      slot.wrapper.remove();
    }
    this.slots.clear();
  }

  private disposeSlotsExcept(seen: Set<string>) {
    let disposed = 0;
    for (const [key, slot] of this.slots) {
      if (seen.has(key)) continue;
      this.disposeParentContextSlotsForOwner(slot.parentContextOwnerKey);
      slot.engine.dispose();
      slot.wrapper.remove();
      this.slots.delete(key);
      disposed += 1;
    }
    if (disposed) this.record('engine:embedded:dispose-removed', { slots: disposed });
  }

  private disposeParentContextSlots() {
    if (this.parentContextSlots.size) this.record('parent-context:canvas:dispose', { slots: this.parentContextSlots.size });
    for (const slot of this.parentContextSlots.values()) {
      slot.engine.dispose();
      slot.clip.remove();
    }
    this.parentContextSlots.clear();
  }

  private disposeParentContextSlotsForOwner(ownerKey: string) {
    let disposed = 0;
    for (const [key, slot] of this.parentContextSlots) {
      if (slot.ownerKey !== ownerKey) continue;
      slot.engine.dispose();
      slot.clip.remove();
      this.parentContextSlots.delete(key);
      disposed += 1;
    }
    if (disposed) this.record('parent-context:canvas:dispose-owner', { ownerKey, slots: disposed });
  }

  private disposeParentContextSlotsExcept(ownerKey: string, seen: Set<string>) {
    let disposed = 0;
    for (const [key, slot] of this.parentContextSlots) {
      if (slot.ownerKey !== ownerKey || seen.has(key)) continue;
      slot.engine.dispose();
      slot.clip.remove();
      this.parentContextSlots.delete(key);
      disposed += 1;
    }
    if (disposed) this.record('parent-context:canvas:dispose-removed', { ownerKey, slots: disposed });
  }

  private record(name: string, data: Record<string, unknown> = {}, level: 'debug' | 'warn' = 'debug') {
    recordNativeCanvasEvent(name, data, level);
  }

  private exposeDebugApi() {
    (window as Window & { __canwayNested?: unknown }).__canwayNested = {
      getCollection: () => cloneDocumentCollection(this.collectionRef.current),
      getWorkspaceSnapshot: () => this.getWorkspaceSnapshot(),
      loadWorkspaceSnapshot: (snapshot: CanvasWorkspaceSnapshot) => this.loadWorkspaceSnapshot(snapshot),
      flushWorkspaceSnapshot: () => this.flushWorkspaceSnapshot(),
      executeDocumentCommand: (command: DocumentCommand) => this.executeDocumentCommand(command),
      executeActiveCanvasCommand: (command: CanvasCommand) => this.executeActiveCanvasCommand(command),
      replaceCollection: (next: CanvasDocumentCollection) => this.replaceCollection(next),
      replaceCollectionForProfile: (next: CanvasDocumentCollection) => this.replaceCollection(next, { persist: false, notify: false, recordHistory: false }),
      undoWorkspace: () => this.undoWorkspace(),
      redoWorkspace: () => this.redoWorkspace(),
      activeCanvasId: () => this.collectionRef.current.activeCanvasId,
      engineCount: () => this.root.querySelectorAll('canvas[data-engine-mode]').length,
      runtimeLog: () => nativeCanvasRuntimeLog(),
    };
  }
}

type ParentContextResizeHandle = 'left' | 'right' | 'top' | 'bottom' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

function rectToDomRect(rect: DOMRect | DOMRectReadOnly): DOMRect {
  return new DOMRect(rect.x, rect.y, Math.max(1, rect.width), Math.max(1, rect.height));
}

function sizeSignature(rect: DOMRect) {
  return `${Math.round(rect.width)}x${Math.round(rect.height)}`;
}

function rectSizeSignature(rect: { w: number; h: number }) {
  return `${Math.round(rect.w)}x${Math.round(rect.h)}`;
}

function parentContextFitPadding(rect: { w: number; h: number }) {
  const minDimension = Math.min(Math.max(1, rect.w), Math.max(1, rect.h));
  return Math.max(0, Math.min(16, Math.floor(minDimension * 0.08)));
}

function screenRectToDomRect(rect: { x: number; y: number; w: number; h: number }): DOMRect {
  return new DOMRect(rect.x, rect.y, Math.max(1, rect.w), Math.max(1, rect.h));
}

function applyParentContextClipStyle(element: HTMLElement, rect: { x: number; y: number; w: number; h: number }) {
  element.style.position = 'absolute';
  element.style.left = `${rect.x}px`;
  element.style.top = `${rect.y}px`;
  element.style.width = `${rect.w}px`;
  element.style.height = `${rect.h}px`;
}

function applyPortalOverlayStyle(element: HTMLElement, layout: PortalLayout) {
  const style = portalOverlayStyle(layout);
  element.style.position = 'absolute';
  element.style.left = `${style.left}px`;
  element.style.top = `${style.top}px`;
  element.style.width = `${style.width}px`;
  element.style.height = `${style.height}px`;
  element.style.overflow = 'hidden';
  element.style.borderRadius = `${style.borderRadius}px`;
  element.style.pointerEvents = 'auto';
}

function updateParentPortalSummary(collection: CanvasDocumentCollection, canvasId: CanvasDocumentId) {
  const document = collection.documents[canvasId];
  if (!document?.parentCanvasId || !document.parentNodeId) return;
  const parent = collection.documents[document.parentCanvasId];
  if (!parent) return;
  let changed = false;
  const nodes = parent.model.nodes.map((node) => {
    if (node.id !== document.parentNodeId || node.type !== BuiltInNodeTypes.canvas) return node;
    const data = parseNodeData(node) as CanvasPortalNodeData;
    if (data.title === document.title && data.nodeCount === document.model.nodes.length) return node;
    changed = true;
    return {
      ...node,
      data: {
        ...data,
        title: document.title,
        nodeCount: document.model.nodes.length,
      },
    };
  });
  if (!changed) return;
  collection.documents[parent.id] = {
    ...parent,
    model: {
      schemaVersion: 2,
      nodes,
    },
  };
}

type NativeCanvasRuntimeEvent = {
  name: string;
  at: number;
  level: 'debug' | 'warn';
  data: Record<string, unknown>;
};

type NativeCanvasWindow = Window & {
  __canwayNativeCanvasLog?: NativeCanvasRuntimeEvent[];
  __CANWAY_DEBUG_CANVAS?: boolean;
};

function nativeCanvasRuntimeLog(): NativeCanvasRuntimeEvent[] {
  return [...(((window as NativeCanvasWindow).__canwayNativeCanvasLog) ?? [])];
}

function recordNativeCanvasEvent(name: string, data: Record<string, unknown>, level: 'debug' | 'warn') {
  const canwayWindow = window as NativeCanvasWindow;
  const log = canwayWindow.__canwayNativeCanvasLog ?? [];
  const entry = { name, at: Math.round(performance.now()), level, data };
  log.push(entry);
  if (log.length > 500) log.splice(0, log.length - 500);
  canwayWindow.__canwayNativeCanvasLog = log;
  performance.mark(`canway-native:${name}`, { detail: data });
  const shouldConsoleLog = level === 'warn' || canwayWindow.__CANWAY_DEBUG_CANVAS || new URLSearchParams(window.location.search).has('canwayDebugCanvas');
  if (!shouldConsoleLog) return;
  const method = level === 'warn' ? console.warn : console.debug;
  method.call(console, '[canway-native]', name, data);
}

function sameCamera(a: { x: number; y: number; scale: number }, b: { x: number; y: number; scale: number }) {
  return a.x === b.x && a.y === b.y && a.scale === b.scale;
}

function sameSelectionState(a: CanvasSelectionState, b: CanvasSelectionState): boolean {
  return (
    a.primarySelectedNodeId === b.primarySelectedNodeId &&
    a.resizeMode === b.resizeMode &&
    a.selectedNodeIds.length === b.selectedNodeIds.length &&
    a.selectedNodeIds.every((id, index) => id === b.selectedNodeIds[index])
  );
}

function samePortalLayouts(a: PortalLayout[], b: PortalLayout[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((layout, index) => {
    const other = b[index];
    return Boolean(
      other &&
      layout.parentCanvasId === other.parentCanvasId &&
      layout.portalNodeId === other.portalNodeId &&
      layout.childCanvasId === other.childCanvasId &&
      layout.visible === other.visible &&
      layout.worldRect.x === other.worldRect.x &&
      layout.worldRect.y === other.worldRect.y &&
      layout.worldRect.w === other.worldRect.w &&
      layout.worldRect.h === other.worldRect.h &&
      layout.screenRect.x === other.screenRect.x &&
      layout.screenRect.y === other.screenRect.y &&
      layout.screenRect.w === other.screenRect.w &&
      layout.screenRect.h === other.screenRect.h
    );
  });
}
