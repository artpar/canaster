import {
  cameraForCanvas,
  cloneModel,
  cloneDocumentCollection,
  documentThemeId,
  applySerializedViewState,
  selectNodeInCanvas,
  selectionForCanvas,
  serializeCollectionViewState,
  setCameraForCanvas,
  setSelectionForCanvas,
  syncDerivedView,
} from '../../../domain/documentModel';
import {
  cloneViewState,
  contextPaneViewportMemory,
  parentContextPaneViewportKey,
  rememberContextPaneViewport,
} from '../../../domain/viewState';
import {
  openDeleteConfirmation,
  planDocumentCommand,
  selectedPortalNodesWithChildrenForSelection,
  stripPortalChildReferenceOnPaste,
} from '../../../domain/documentCommands';
import { portalInfoForNode, updatePortalSummaryForNode } from '../nodeRegistry';
import type { Camera, CanvasCommand, CanvasModel, CanvasModelChange, CanvasNode, CanvasSelectionState, EngineOptions, PortalLayout, ScreenRect, ViewportStatus, WorldPoint } from '../../../domain/types';
import type {
  CanvasDocumentCollection,
  CanvasDocumentId,
  ParentContextFieldShape,
  CanvasWorkspaceHistory,
  CanvasWorkspaceSnapshot,
  DocumentCommand,
  DocumentModelChange,
  ParentContextPaneLayout,
  ParentContextRegion,
  SerializableNestedCanvasViewState,
} from '../../../domain/documentTypes';
import {
  createWorkspaceHistory,
  createWorkspaceSnapshot,
  hydrateWorkspaceSnapshot,
  pushWorkspaceHistory,
  redoWorkspaceHistory,
  replaceWorkspacePresent,
  undoWorkspaceHistory,
} from '../../../domain/workspaceHistory';
import { DEFAULT_WORKSPACE_STORAGE_ID, loadWorkspaceSnapshot, loadWorkspaceSnapshotMirror, saveWorkspaceSnapshot, saveWorkspaceSnapshotMirror } from '../../../infra/browser/workspaceStorage';
import { ACTIVE_ENGINE_FRAME_BUDGET_MS, livePortalSlotsFor, MAX_LIVE_PORTAL_PREVIEWS, MAX_TOTAL_ENGINES } from './engineSlots';
import { createCanvasViewportSlot, type CanvasViewportControl, type CanvasViewportControlEvent, type CanvasViewportSlot } from './createCanvasViewportSlot';
import {
  buildParentContextField,
  DEFAULT_PARENT_CONTEXT_PANE_LAYOUT,
  normalizeParentContextPaneLayout,
  paneRectForRegion,
  parentContextRegionForNode,
  PARENT_CONTEXT_REGIONS,
  type ParentContextPaneLayoutConstraints,
} from './parentContextField';
import { portalOverlayStyle } from './portalLayout';
import type { ArrangeCanvasMenuRequest, CanvasThemeMenuRequest, NestedCanvasWorkspaceChromeState, WorkspaceFileDropRequest } from './NestedCanvasWorkspace';
import type { WorkspaceUrlPaneCamera, WorkspaceUrlState } from '../../../infra/browser/workspaceUrlLocation';
import {hasMetaOrCtrlShortcutModifier} from '../../KeyboardShortcuts';
import type {CanasterThemeId} from '../../theme/CanasterTheme';
import {normalizeCanasterThemeId} from '../../theme/CanasterThemeRegistry';

export type NativeNestedCanvasControllerOptions = {
  root: HTMLElement;
  initialCollection: CanvasDocumentCollection;
  theme: CanasterThemeId;
  parentContextVisible?: boolean;
  fitOnFirstLoad?: boolean;
  storageKey?: string;
  onCollectionChange?: (collection: CanvasDocumentCollection, changes: DocumentModelChange[]) => void;
  onChromeStateChange?: (state: NestedCanvasWorkspaceChromeState) => void;
  onArrangeCanvasMenuRequest?: (request: ArrangeCanvasMenuRequest) => void;
  onCanvasThemeMenuRequest?: (request: CanvasThemeMenuRequest) => void;
  onFileDrop?: (request: WorkspaceFileDropRequest) => void;
};

type Slot = {
  key: string;
  parentCanvasId: CanvasDocumentId;
  portalNodeId: string;
  canvasId: CanvasDocumentId;
  viewportSlot: CanvasViewportSlot;
  parentContextOwnerKey: string;
  portalLayouts: PortalLayout[];
  sizeSignature: string;
};

type ParentContextPaneSlot = {
  key: string;
  ownerKey: string;
  canvasId: CanvasDocumentId;
  region: ParentContextRegion;
  viewportSlot: CanvasViewportSlot;
  portalLayouts: PortalLayout[];
  cameraInitialized: boolean;
  camera: Camera | null;
  targetSignature: string;
  memoryKey: string;
  sizeSignature: string;
};

type OverlayAllocation = {
  slot: Slot;
  depth: number;
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
  private storageKey: string;
  private readonly fitOnFirstLoad: boolean;
  private readonly onCollectionChange?: (collection: CanvasDocumentCollection, changes: DocumentModelChange[]) => void;
  private readonly onChromeStateChange?: (state: NestedCanvasWorkspaceChromeState) => void;
  private readonly onArrangeCanvasMenuRequest?: (request: ArrangeCanvasMenuRequest) => void;
  private readonly onCanvasThemeMenuRequest?: (request: CanvasThemeMenuRequest) => void;
  private readonly onFileDrop?: (request: WorkspaceFileDropRequest) => void;
  private readonly historyRef: { current: CanvasWorkspaceHistory };
  private readonly collectionRef: { current: CanvasDocumentCollection };
  private readonly lastModelChangeRef: { current: DocumentModelChange | null } = { current: null };
  private readonly lastCanvasModelChangeRef: { current: CanvasModelChange | null } = { current: null };
  private readonly slots = new Map<string, Slot>();
  private readonly parentContextSlots = new Map<string, ParentContextPaneSlot>();
  private readonly activeFrameOverBudgetCount = { current: 0 };

  private theme: CanasterThemeId;
  private status: ViewportStatus = initialStatus;
  private previewCapacity = MAX_LIVE_PORTAL_PREVIEWS;
  private activeSlot: CanvasViewportSlot | null = null;
  private stage: HTMLDivElement;
  private parentContextField: HTMLDivElement;
  private overlayLayer: HTMLDivElement;
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
  private canvasModelChangeCount = 0;
  private controlOwnerKey = 'active';
  private parentContextVisible: boolean;
  private resizeObserver: ResizeObserver;

  constructor(options: NativeNestedCanvasControllerOptions) {
    this.root = options.root;
    this.theme = normalizeCanasterThemeId(options.theme);
    this.parentContextVisible = options.parentContextVisible ?? true;
    this.fitOnFirstLoad = options.fitOnFirstLoad ?? true;
    this.storageKey = options.storageKey ?? DEFAULT_WORKSPACE_STORAGE_ID;
    this.onCollectionChange = options.onCollectionChange;
    this.onChromeStateChange = options.onChromeStateChange;
    this.onArrangeCanvasMenuRequest = options.onArrangeCanvasMenuRequest;
    this.onCanvasThemeMenuRequest = options.onCanvasThemeMenuRequest;
    this.onFileDrop = options.onFileDrop;
    this.historyRef = { current: createWorkspaceHistory(options.initialCollection) };
    this.collectionRef = { current: this.historyRef.current.present };

    this.root.replaceChildren();
    this.root.classList.add('nested-workspace-native');
    this.root.dataset.activeCanvasId = this.collectionRef.current.activeCanvasId;

    this.stage = document.createElement('div');
    this.stage.className = 'nested-stage';
    this.stage.dataset.animation = 'off';
    this.stage.dataset.nativeCanvas = 'true';

    this.activeSlot = this.createActiveViewportSlot();

    this.overlayLayer = this.activeSlot.childOverlayLayer;
    this.overlayLayer.setAttribute('aria-label', 'Live child canvas previews');

    this.parentContextField = document.createElement('div');
    this.parentContextField.className = 'parent-context-field native-parent-context-field';
    this.parentContextField.setAttribute('aria-label', 'Parent canvas context');

    this.resizerLayer = document.createElement('div');
    this.resizerLayer.className = 'parent-context-resizers native-resizers';
    this.resizerLayer.setAttribute('aria-label', 'Resize parent context panes');

    this.stage.append(this.activeSlot.wrapper, this.parentContextField, this.resizerLayer);
    this.root.append(this.stage);

    this.resizeObserver = new ResizeObserver(() => {
      this.layout();
      this.scheduleOverlayRender();
    });
    this.resizeObserver.observe(this.root);
    this.root.addEventListener('pointermove', this.handleViewportControlPointerMove);
    this.root.addEventListener('pointerleave', this.handleViewportControlPointerLeave);
    this.root.addEventListener('focusin', this.handleViewportControlFocusIn);
    this.root.addEventListener('focusout', this.handleViewportControlFocusOut);
    this.root.addEventListener('dragenter', this.handleFileDragEnter);
    this.root.addEventListener('dragover', this.handleFileDragOver);
    this.root.addEventListener('dragleave', this.handleFileDragLeave);
    this.root.addEventListener('drop', this.handleFileDrop);

    this.syncActiveViewportSlot();
    this.syncViewportControlVisibility();
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
    this.root.removeEventListener('pointermove', this.handleViewportControlPointerMove);
    this.root.removeEventListener('pointerleave', this.handleViewportControlPointerLeave);
    this.root.removeEventListener('focusin', this.handleViewportControlFocusIn);
    this.root.removeEventListener('focusout', this.handleViewportControlFocusOut);
    this.root.removeEventListener('dragenter', this.handleFileDragEnter);
    this.root.removeEventListener('dragover', this.handleFileDragOver);
    this.root.removeEventListener('dragleave', this.handleFileDragLeave);
    this.root.removeEventListener('drop', this.handleFileDrop);
    this.resizeObserver.disconnect();
    this.activeEngine()?.dispose();
    this.disposeParentContextSlots();
    this.disposeSlots();
    if ((window as Window & { __canwayNested?: unknown }).__canwayNested) {
      delete (window as Window & { __canwayNested?: unknown }).__canwayNested;
    }
    this.root.replaceChildren();
  }

  setTheme(theme: CanasterThemeId) {
    const nextTheme = normalizeCanasterThemeId(theme);
    if (this.theme === nextTheme) return;
    this.theme = nextTheme;
    this.renderCollection();
  }

  setWorkspaceTheme(theme: CanasterThemeId): boolean {
    const nextTheme = normalizeCanasterThemeId(theme);
    return this.executeDocumentCommand({ type: 'set-document-theme', themeId: nextTheme, source: 'nonvisual' });
  }

  private canvasThemeFor(canvasId: CanvasDocumentId): CanasterThemeId {
    return normalizeCanasterThemeId(this.canvasThemeIdForRuntime(canvasId));
  }

  private canvasThemeIdForRuntime(canvasId: CanvasDocumentId): string {
    const collection = this.collectionRef.current;
    const document = collection.documents[canvasId];
    if (document?.appearance?.themeId) return document.appearance.themeId;
    return this.theme;
  }

  private canvasBackgroundImageFor(canvasId: CanvasDocumentId) {
    return this.collectionRef.current.documents[canvasId]?.appearance?.backgroundImage ?? null;
  }

  setParentContextVisible(visible: boolean) {
    if (this.parentContextVisible === visible) return;
    const stageRect = rectToDomRect(this.root.getBoundingClientRect());
    const previousLayout = this.normalizedActiveParentContextLayout(stageRect, this.parentContextVisible);
    this.parentContextVisible = visible;
    const nextLayout = this.normalizedActiveParentContextLayout(stageRect, this.parentContextVisible);
    this.shiftActiveCameraForPaneLayoutChange(stageRect, previousLayout, nextLayout);
    this.layout();
    this.flushActiveCanvasRender();
    this.flushOverlayRender();
    this.scheduleOverlayRender();
    this.emitChromeState();
  }

  fitActiveCanvas() {
    this.activeEngine()?.fit();
    this.persistViewportFromActiveEngine();
  }

  resetActiveZoom() {
    this.activeEngine()?.resetZoom();
    this.persistViewportFromActiveEngine();
  }

  zoomActiveBy(factor: number) {
    this.activeEngine()?.zoomBy(factor);
    this.persistViewportFromActiveEngine();
  }

  refreshActiveCanvas() {
    this.activeEngine()?.flushRender();
    this.scheduleOverlayRender();
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
    return this.activeEngine()?.executeCommand(command) ?? false;
  }

  executeDocumentCommand(command: DocumentCommand): boolean {
    const base = this.saveActiveViewport(this.collectionRef.current);
    const plan = planDocumentCommand(base, command);
    if (plan.changes.some((change) => change.kind === 'active-canvas-change')) {
      this.commitActiveCanvasTransition(plan.collection, plan.changes, plan.interaction);
      return true;
    }
    this.commitCollection(plan.collection, plan.changes);
    this.setStatus({ ...this.status, interaction: plan.interaction });
    return plan.changes.length > 0;
  }

  private handleViewportControl(slot: CanvasViewportSlot, control: CanvasViewportControl, event: CanvasViewportControlEvent): void {
    if (control === 'arrange') {
      this.onArrangeCanvasMenuRequest?.({
        canvasId: slot.canvasId,
        anchor: event.anchor,
        metaOrCtrl: hasMetaOrCtrlShortcutModifier(event.sourceEvent),
      });
      this.setStatus({ ...this.status, interaction: 'Choose arrangement' });
      return;
    }
    if (control === 'theme') {
      this.onCanvasThemeMenuRequest?.({
        canvasId: slot.canvasId,
        anchor: event.anchor,
        metaOrCtrl: hasMetaOrCtrlShortcutModifier(event.sourceEvent),
      });
      this.setStatus({ ...this.status, interaction: 'Choose canvas theme' });
      return;
    }
    const recursive = hasMetaOrCtrlShortcutModifier(event.sourceEvent);
    const targets = this.viewportControlTargets(slot, recursive);
    if (control === 'fit') {
      for (const target of targets) target.engine.fit(target.mode === 'active' ? undefined : 16);
      if (this.activeSlot && targets.includes(this.activeSlot)) this.persistViewportFromActiveEngine();
      this.setStatus({ ...this.status, interaction: recursive && targets.length > 1 ? `Centered ${targets.length} views` : 'Centered view' });
      return;
    }
    if (control === 'reset-zoom') {
      for (const target of targets) target.engine.resetZoom();
      if (this.activeSlot && targets.includes(this.activeSlot)) this.persistViewportFromActiveEngine();
      this.setStatus({ ...this.status, interaction: recursive && targets.length > 1 ? `Reset zoom for ${targets.length} views` : 'Reset view zoom' });
      return;
    }
    const factor = control === 'zoom-in' ? 1.22 : 0.82;
    for (const target of targets) target.engine.zoomBy(factor);
    if (this.activeSlot && targets.includes(this.activeSlot)) this.persistViewportFromActiveEngine();
  }

  private handleViewportControlPointerMove = (event: PointerEvent) => {
    this.setControlOwnerForTarget(event.target);
  };

  private handleViewportControlPointerLeave = () => {
    this.setControlOwnerSlot(this.activeSlot);
  };

  private handleViewportControlFocusIn = (event: FocusEvent) => {
    this.setControlOwnerForTarget(event.target);
  };

  private handleViewportControlFocusOut = () => {
    requestAnimationFrame(() => {
      if (this.disposed) return;
      if (document.activeElement && this.root.contains(document.activeElement)) {
        this.setControlOwnerForTarget(document.activeElement);
        return;
      }
      this.setControlOwnerSlot(this.activeSlot);
    });
  };

  private handleFileDragEnter = (event: DragEvent) => {
    if (!hasDroppedFiles(event.dataTransfer)) return;
    event.preventDefault();
    this.root.classList.add('is-file-drag-over');
  };

  private handleFileDragOver = (event: DragEvent) => {
    if (!hasDroppedFiles(event.dataTransfer)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    this.root.classList.add('is-file-drag-over');
  };

  private handleFileDragLeave = (event: DragEvent) => {
    if (event.relatedTarget instanceof Node && this.root.contains(event.relatedTarget)) return;
    this.root.classList.remove('is-file-drag-over');
  };

  private handleFileDrop = (event: DragEvent) => {
    if (!hasDroppedFiles(event.dataTransfer)) return;
    event.preventDefault();
    this.root.classList.remove('is-file-drag-over');
    const at = this.activeCanvasWorldPoint(event);
    if (!at) {
      this.setStatus({ ...this.status, interaction: 'Drop images on the active view' });
      return;
    }
    const files = [...(event.dataTransfer?.files ?? [])];
    if (!files.length) return;
    this.onFileDrop?.({
      canvasId: this.collectionRef.current.activeCanvasId,
      at,
      files,
    });
  };

  private setControlOwnerForTarget(target: EventTarget | null): void {
    this.setControlOwnerSlot(this.viewportSlotForTarget(target) ?? this.activeSlot);
  }

  private activeCanvasWorldPoint(event: DragEvent): WorldPoint | null {
    const slot = this.activeSlot;
    if (!slot) return null;
    const rect = slot.canvas.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
      return null;
    }
    const camera = slot.engine.getCamera();
    return {
      x: (event.clientX - rect.left - camera.x) / camera.scale,
      y: (event.clientY - rect.top - camera.y) / camera.scale,
    };
  }

  private setControlOwnerSlot(slot: CanvasViewportSlot | null): void {
    const nextKey = slot?.key ?? 'active';
    if (this.controlOwnerKey === nextKey) return;
    this.controlOwnerKey = nextKey;
    this.syncViewportControlVisibility();
  }

  private viewportSlotForTarget(target: EventTarget | null): CanvasViewportSlot | null {
    if (!(target instanceof Element)) return null;
    const viewport = target.closest<HTMLElement>('.canvas-viewport');
    if (!viewport) return null;
    return this.viewportSlotForElement(viewport);
  }

  private viewportSlotForElement(viewport: HTMLElement): CanvasViewportSlot | null {
    if (this.activeSlot?.viewport === viewport) return this.activeSlot;
    for (const slot of this.slots.values()) {
      if (slot.viewportSlot.viewport === viewport) return slot.viewportSlot;
    }
    for (const slot of this.parentContextSlots.values()) {
      if (slot.viewportSlot.viewport === viewport) return slot.viewportSlot;
    }
    return null;
  }

  private syncViewportControlVisibility(): void {
    const syncSlot = (slot: CanvasViewportSlot | null) => {
      if (!slot) return;
      slot.viewport.dataset.controlsVisible = String(slot.key === this.controlOwnerKey);
    };
    syncSlot(this.activeSlot);
    for (const slot of this.slots.values()) syncSlot(slot.viewportSlot);
    for (const slot of this.parentContextSlots.values()) syncSlot(slot.viewportSlot);
  }

  private ensureControlOwnerSlotExists(): void {
    if (this.activeSlot?.key === this.controlOwnerKey) {
      this.syncViewportControlVisibility();
      return;
    }
    for (const slot of this.slots.values()) {
      if (slot.viewportSlot.key === this.controlOwnerKey) {
        this.syncViewportControlVisibility();
        return;
      }
    }
    for (const slot of this.parentContextSlots.values()) {
      if (slot.viewportSlot.key === this.controlOwnerKey) {
        this.syncViewportControlVisibility();
        return;
      }
    }
    this.setControlOwnerSlot(this.activeSlot);
  }

  private viewportControlTargets(slot: CanvasViewportSlot, recursive: boolean): CanvasViewportSlot[] {
    if (!recursive) return [slot];
    const targets = [slot];
    const seenSlotKeys = new Set([slot.key]);
    for (let index = 0; index < targets.length; index++) {
      const parentSlot = targets[index];
      for (const candidate of this.slots.values()) {
        if (candidate.viewportSlot.wrapper.parentElement !== parentSlot.childOverlayLayer || seenSlotKeys.has(candidate.key)) continue;
        seenSlotKeys.add(candidate.key);
        targets.push(candidate.viewportSlot);
      }
    }
    return targets;
  }

  collection(): CanvasDocumentCollection {
    return cloneDocumentCollection(this.collectionRef.current);
  }

  viewState() {
    return serializeCollectionViewState(this.collectionRef.current);
  }

  applyViewState(viewState: SerializableNestedCanvasViewState) {
    this.commitCollection(applySerializedViewState(this.collectionRef.current, viewState), [], {
      recordHistory: false,
      persist: true,
      notify: true,
    });
  }

  openWorkspaceUrlState(state: WorkspaceUrlState): boolean {
    const base = this.saveActiveViewport(this.collectionRef.current);
    if (!base.documents[state.activeCanvasId]) return false;
    const next = cloneDocumentCollection(base);
    next.activeCanvasId = state.activeCanvasId;
    next.view.activeCanvasId = state.activeCanvasId;
    next.view.focusedEngineId = state.activeCanvasId;
    next.view.previewFocus = null;
    next.view.deleteConfirmation = null;
    next.view.cameras[state.activeCanvasId] = { ...state.activeCamera };
    for (const pane of state.paneCameras) {
      const key = parentContextPaneViewportKey({
        ownerCanvasId: pane.ownerCanvasId,
        parentCanvasId: pane.parentCanvasId,
        sourceNodeId: pane.sourceNodeId,
        region: pane.region,
      });
      next.view.viewportMemory.contextPanes[key] = {
        camera: { ...pane.camera },
        targetSignature: pane.targetSignature,
        updatedAt: Date.now(),
      };
    }
    this.commitCollection(syncDerivedView(next), [], {
      recordHistory: false,
      persist: true,
      notify: true,
    });
    this.setStatus({ ...this.status, interaction: 'Opened linked view' });
    return true;
  }

  currentWorkspaceUrlState(documentId: string | null): WorkspaceUrlState | null {
    const collection = this.saveActiveViewport(this.collectionRef.current);
    if (!collection.documents[collection.activeCanvasId]) return null;
    return {
      documentId,
      activeCanvasId: collection.activeCanvasId,
      activeCamera: cameraForCanvas(collection, collection.activeCanvasId),
      paneCameras: [...this.parentContextSlots.values()]
        .filter((slot) => slot.cameraInitialized && slot.memoryKey && slot.targetSignature)
        .map((slot) => {
          const identity = parentContextPaneIdentityFromKey(slot.memoryKey);
          if (!identity) return null;
          return {
            ...identity,
            targetSignature: slot.targetSignature,
            camera: slot.viewportSlot.engine.getCamera(),
          };
        })
        .filter((pane): pane is WorkspaceUrlPaneCamera => Boolean(pane)),
    };
  }

  getWorkspaceSnapshot(): CanvasWorkspaceSnapshot {
    const current = replaceWorkspacePresent(this.historyRef.current, this.saveActiveViewport(this.collectionRef.current));
    return createWorkspaceSnapshot(current, this.lastModelChangeRef.current);
  }

  loadWorkspaceSnapshot(snapshot: CanvasWorkspaceSnapshot, interaction = 'Document loaded'): void {
    this.replaceWorkspaceSnapshot(snapshot, { interaction });
  }

  replaceWorkspaceSnapshot(
    snapshot: CanvasWorkspaceSnapshot,
    options: { storageKey?: string; interaction?: string; persist?: boolean } = {},
  ): void {
    if (options.storageKey) this.storageKey = options.storageKey;
    const interaction = options.interaction ?? 'Document loaded';
    const persist = options.persist ?? true;
    const hydrated = hydrateWorkspaceSnapshot(snapshot);
    this.historyRef.current = hydrated.history;
    this.collectionRef.current = hydrated.history.present;
    this.theme = normalizeCanasterThemeId(documentThemeId(this.collectionRef.current));
    this.lastModelChangeRef.current = hydrated.lastModelChange;
    this.setStatus({ ...this.status, interaction });
    if (persist) {
      this.mirrorWorkspaceSnapshot(hydrated);
      void saveWorkspaceSnapshot(hydrated, this.storageKey);
    }
    this.onCollectionChange?.(hydrated.history.present, []);
    this.renderCollection();
  }

  setStorageKey(storageKey: string): void {
    if (this.storageKey === storageKey) return;
    this.storageKey = storageKey;
    this.restoredFromStorage = Boolean(loadWorkspaceSnapshotMirror(this.storageKey));
    this.emitChromeState();
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
      this.theme = normalizeCanasterThemeId(documentThemeId(this.collectionRef.current));
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

  private activeEngine() {
    return this.activeSlot?.engine ?? null;
  }

  private applyActiveHandleSizing(slot: CanvasViewportSlot) {
    slot.engine.setInteractionHandleSizing(slot === this.activeSlot ? 'screen-fixed' : 'world');
  }

  private editableEngineOptions(
    canvasIdForEngine: CanvasDocumentId | (() => CanvasDocumentId),
    options: {
      beforeCommandSelection?: () => CanvasSelectionState | null;
      onCanvasDoubleClick?: EngineOptions['onCanvasDoubleClick'];
      onFrameMetrics?: EngineOptions['onFrameMetrics'];
      onModelChange?: EngineOptions['onModelChange'];
      onNodeAction?: EngineOptions['onNodeAction'];
      onPortalLayout?: EngineOptions['onPortalLayout'];
      onStatus?: EngineOptions['onStatus'];
    },
  ): EngineOptions {
    const { beforeCommandSelection, ...engineOptions } = options;
    const canvasId = () => typeof canvasIdForEngine === 'function' ? canvasIdForEngine() : canvasIdForEngine;
    return {
      ...engineOptions,
      onNodeAction: engineOptions.onNodeAction ?? ((nodeId, actionId, source) => {
        this.executeDocumentCommand({ type: 'execute-node-action', canvasId: canvasId(), nodeId, actionId, source });
        return true;
      }),
      onNodeDataChange: (nodeId, from, to, source) => {
        this.executeDocumentCommand({ type: 'set-node-data', canvasId: canvasId(), nodeId, from, to, source });
        return true;
      },
      beforeCommand: (command) => this.handleBeforeCommand(canvasId(), command, beforeCommandSelection?.() ?? null),
      transformPastedNode: stripPortalChildReferenceOnPaste,
      pasteInteractionForNodes: (nodes) => nodes.some((node) => portalInfoForNode(node)) ? 'Pasted canvas node without child contents' : null,
    };
  }

  private createActiveViewportSlot(): CanvasViewportSlot {
    const collection = this.collectionRef.current;
    this.record('engine:active:create', {
      canvasId: collection.activeCanvasId,
      nodes: collection.documents[collection.activeCanvasId]?.model.nodes.length ?? 0,
    });
    return createCanvasViewportSlot({
      key: 'active',
      canvasId: collection.activeCanvasId,
      mode: 'active',
      ariaLabel: `${collection.documents[collection.activeCanvasId]?.title ?? 'Active canvas'} active canvas`,
      canvasClassName: 'canvas-surface active-plane',
      wrapperClassName: 'nested-center-cell active-canvas-viewport-slot',
      viewportClassName: 'canvas-viewport active-canvas-viewport',
      controls: ['fit', 'reset-zoom', 'zoom-in', 'zoom-out', 'arrange', 'theme'],
      onControl: (slot, control, anchor) => this.handleViewportControl(slot, control, anchor),
      engineOptions: this.editableEngineOptions(() => this.collectionRef.current.activeCanvasId, {
        beforeCommandSelection: () => this.activeEngine()?.getSelectionState() ?? null,
        onStatus: (status) => this.handleActiveStatus(this.collectionRef.current.activeCanvasId, status),
        onModelChange: (model, change) => this.handleActiveModelChange(this.collectionRef.current.activeCanvasId, model, change),
        onPortalLayout: (layouts) => this.handleActivePortalLayouts(layouts),
        onNodeAction: (nodeId, actionId, source) => {
          this.executeDocumentCommand({ type: 'execute-node-action', canvasId: this.collectionRef.current.activeCanvasId, nodeId, actionId, source });
          return true;
        },
        onFrameMetrics: (metrics) => this.handleFrameMetrics(metrics.frameMs),
      }),
    });
  }

  private syncActiveViewportSlot() {
    const collection = this.collectionRef.current;
    const active = collection.documents[collection.activeCanvasId];
    const slot = this.activeSlot;
    if (!slot) return;
    slot.canvasId = collection.activeCanvasId;
    slot.wrapper.dataset.canvasId = collection.activeCanvasId;
    slot.viewport.dataset.canvasId = collection.activeCanvasId;
    slot.canvas.setAttribute('aria-label', `${active?.title ?? 'Active canvas'} active canvas`);
    slot.engine.setCanvasId(collection.activeCanvasId);
    this.applyActiveHandleSizing(slot);
    if (active) slot.engine.setModel(active.model);
    slot.engine.setTheme(this.canvasThemeFor(collection.activeCanvasId));
    slot.engine.setBackgroundImage(this.canvasBackgroundImageFor(collection.activeCanvasId));
    slot.engine.setCamera(cameraForCanvas(collection, collection.activeCanvasId));
    slot.engine.setSelectionState(selectionForCanvas(collection, collection.activeCanvasId));
    this.syncViewportControlVisibility();
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
    this.disposeParentContextSlots();
    this.syncActiveViewportSlot();
    this.setControlOwnerSlot(this.activeSlot);
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
    const parentContextEnabled = hasParent && this.parentContextVisible;
    const normalized = parentContextEnabled ? normalizeParentContextPaneLayout(rectToDomRect(rect), paneLayout) : { left: 0, right: 0, top: 0, bottom: 0 };
    this.stage.style.gridTemplateColumns = `${normalized.left}px minmax(0, 1fr) ${normalized.right}px`;
    this.stage.style.gridTemplateRows = `${normalized.top}px minmax(0, 1fr) ${normalized.bottom}px`;
    this.resizerLayer.style.display = parentContextEnabled ? '' : 'none';
    if (parentContextEnabled) {
      this.renderParentContextPanes(this.parentContextField, `active:${collection.activeCanvasId}`, collection.activeCanvasId, rectToDomRect(rect), normalized);
      this.renderResizers(this.resizerLayer, normalized, rectToDomRect(rect), true, (next, commit) => this.handlePaneLayoutChange(collection.activeCanvasId, next, commit));
    } else {
      this.disposeParentContextSlotsForOwner(`active:${collection.activeCanvasId}`);
      this.resizerLayer.replaceChildren();
    }
  }

  private normalizedActiveParentContextLayout(stageRect: DOMRect, visible: boolean): ParentContextPaneLayout {
    const collection = this.collectionRef.current;
    const hasParent = Boolean(collection.documents[collection.activeCanvasId]?.parentCanvasId);
    if (!visible || !hasParent) return { left: 0, right: 0, top: 0, bottom: 0 };
    const paneLayout = collection.view.paneLayouts[collection.activeCanvasId] ?? DEFAULT_PARENT_CONTEXT_PANE_LAYOUT;
    return normalizeParentContextPaneLayout(stageRect, paneLayout);
  }

  private shiftActiveCameraForPaneLayoutChange(stageRect: DOMRect, previous: ParentContextPaneLayout, next: ParentContextPaneLayout) {
    const engine = this.activeEngine();
    if (!engine) return;
    const dx = previous.left - next.left;
    const dy = previous.top - next.top;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
    const camera = engine.getCamera();
    const nextCamera = { ...camera, x: camera.x + dx, y: camera.y + dy };
    engine.setCamera(nextCamera);
    const base = this.collectionRef.current;
    base.view.cameras[base.activeCanvasId] = nextCamera;
    this.historyRef.current = { ...this.historyRef.current, present: base };
    this.collectionRef.current = base;
    if (this.storageReady) this.scheduleViewportSnapshotMirror();
    this.setLiveStatus(this.status);
  }

  private flushActiveCanvasRender() {
    this.activeEngine()?.flushRender();
  }

  private flushOverlayRender() {
    if (this.overlayFrame !== null) {
      cancelAnimationFrame(this.overlayFrame);
      this.overlayFrame = null;
    }
    if (this.overlayTimer !== null) {
      window.clearTimeout(this.overlayTimer);
      this.overlayTimer = null;
    }
    this.lastOverlayRenderAt = performance.now();
    this.renderOverlays();
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
    const firstLevelLimit = MAX_TOTAL_ENGINES - 1;
    const activeCanvas = this.activeSlot?.canvas;
    const liveLayouts = livePortalSlotsFor(collection, this.portalLayouts, firstLevelLimit, activeCanvas ? viewportRectFor(activeCanvas) : null, this.livePortalNodeIdsForOwner('active'));
    this.activeEngine()?.setLivePortalNodeIds(portalNodeIdsFor(liveLayouts));
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
    const queue: OverlayAllocation[] = [];
    for (const layout of liveLayouts) {
      if (remaining <= 0 || !layout.childCanvasId) break;
      const slot = this.createOverlayViewport(this.overlayLayer, layout.childCanvasId, layout, remaining, 0, 'active', seen);
      if (!slot) continue;
      remaining -= 1;
      queue.push({ slot, depth: 1 });
    }
    for (const slot of this.parentContextSlots.values()) {
      const contextLayouts = remaining > 0 ? livePortalSlotsFor(collection, slot.portalLayouts, remaining, viewportRectFor(slot.viewportSlot.canvas), this.livePortalNodeIdsForOwner(`context:${slot.key}`)) : [];
      slot.viewportSlot.engine.setLivePortalNodeIds(portalNodeIdsFor(contextLayouts));
      if (!contextLayouts.length) continue;
      for (const layout of contextLayouts) {
        if (remaining <= 0 || !layout.childCanvasId) break;
        const embeddedSlot = this.createOverlayViewport(slot.viewportSlot.childOverlayLayer, layout.childCanvasId, layout, remaining, 0, `context:${slot.key}`, seen);
        if (!embeddedSlot) continue;
        remaining -= 1;
        queue.push({ slot: embeddedSlot, depth: 1 });
      }
    }
    remaining = this.renderEmbeddedChildOverlaysBreadthFirst(queue, remaining, seen);
    this.disposeSlotsExcept(seen);
    this.emitChromeState();
  }

  private createOverlayViewport(parent: HTMLElement, canvasId: CanvasDocumentId, layout: PortalLayout, remaining: number, depth: number, ownerPath: string, seen: Set<string>): Slot | null {
    const canvasDocument = this.collectionRef.current.documents[canvasId];
    if (!canvasDocument || remaining <= 0) return null;
    const key = `embedded:${ownerPath}:${depth}:${canvasId}:${layout.portalNodeId}`;
    seen.add(key);
    const existing = this.slots.get(key);
    if (existing) {
      if (existing.viewportSlot.wrapper.parentElement !== parent) parent.append(existing.viewportSlot.wrapper);
      this.syncOverlayViewport(existing, canvasDocument);
      this.updateOverlayViewport(existing, layout);
      return existing;
    }
    this.record('overlay:viewport:create', {
      canvasId,
      depth,
      portalNodeId: layout.portalNodeId,
      remaining,
      ownerPath,
      nodes: canvasDocument.model.nodes.length,
    });

    const stageRect = screenRectToDomRect(layout.screenRect);
    const parentContextOwnerKey = `context:${key}`;
    let viewportSlot: CanvasViewportSlot;
    viewportSlot = createCanvasViewportSlot({
      key,
      canvasId,
      mode: 'embedded-live',
      ariaLabel: `${canvasDocument.title} live preview`,
      canvasClassName: 'canvas-surface embedded-plane',
      wrapperClassName: 'portal-overlay',
      viewportClassName: 'canvas-viewport embedded-nested-viewport native-embedded-viewport',
      controls: ['arrange', 'fit', 'theme'],
      includePaneLayers: true,
      onControl: (slot, control, anchor) => this.handleViewportControl(slot, control, anchor),
      engineOptions: this.editableEngineOptions(canvasId, {
        beforeCommandSelection: () => viewportSlot.engine.getSelectionState(),
        onStatus: () => undefined,
        onModelChange: (model, change) => this.handleEmbeddedModelChange(canvasId, model, change),
        onCanvasDoubleClick: (targetCanvasId) => {
          this.executeDocumentCommand({ type: 'select-canvas', canvasId: targetCanvasId, source: 'pointer' });
          return true;
        },
        onPortalLayout: (layouts) => this.handleEmbeddedPortalLayouts(key, layouts),
      }),
    });
    applyPortalOverlayStyle(viewportSlot.wrapper, layout);
    viewportSlot.viewport.style.inset = '0';
    viewportSlot.viewport.dataset.depth = String(depth);
    parent.append(viewportSlot.wrapper);
    viewportSlot.engine.setModel(canvasDocument.model);
    viewportSlot.engine.setTheme(this.canvasThemeFor(canvasId));
    viewportSlot.engine.setBackgroundImage(this.canvasBackgroundImageFor(canvasId));
    this.applyActiveHandleSizing(viewportSlot);
    const slot: Slot = { key, parentCanvasId: layout.parentCanvasId, portalNodeId: layout.portalNodeId, canvasId, viewportSlot, parentContextOwnerKey, portalLayouts: [], sizeSignature: sizeSignature(stageRect) };
    this.slots.set(key, slot);
    this.syncViewportControlVisibility();
    this.layoutEmbeddedSlot(slot, stageRect);
    requestAnimationFrame(() => {
      if (this.disposed || !this.slots.has(key)) return;
      viewportSlot.engine.fit(16);
    });

    return this.slots.get(key) ?? null;
  }

  private syncOverlayViewport(slot: Slot, canvasDocument: CanvasDocumentCollection['documents'][string]) {
    slot.viewportSlot.canvasId = canvasDocument.id;
    slot.viewportSlot.wrapper.dataset.canvasId = canvasDocument.id;
    slot.viewportSlot.viewport.dataset.canvasId = canvasDocument.id;
    slot.viewportSlot.viewport.style.inset = '0';
    slot.viewportSlot.canvas.setAttribute('aria-label', `${canvasDocument.title} live preview`);
    slot.viewportSlot.engine.setCanvasId(canvasDocument.id);
    slot.viewportSlot.engine.setTheme(this.canvasThemeFor(canvasDocument.id));
    slot.viewportSlot.engine.setBackgroundImage(this.canvasBackgroundImageFor(canvasDocument.id));
    slot.viewportSlot.engine.setModel(canvasDocument.model, { preserveInteraction: true });
  }

  private renderEmbeddedChildOverlaysBreadthFirst(queue: OverlayAllocation[], remaining: number, seen: Set<string>): number {
    while (queue.length && remaining > 0) {
      const currentDepth = queue[0].depth;
      const currentLevel: OverlayAllocation[] = [];
      while (queue.length && queue[0].depth === currentDepth) {
        const allocation = queue.shift();
        if (allocation) currentLevel.push(allocation);
      }
      for (const allocation of currentLevel) {
        remaining = this.renderEmbeddedChildOverlayLevel(allocation, remaining, seen, queue);
      }
    }
    for (const allocation of queue) allocation.slot.viewportSlot.engine.setLivePortalNodeIds(new Set());
    return remaining;
  }

  private renderEmbeddedChildOverlayLevel(allocation: OverlayAllocation, remaining: number, seen: Set<string>, queue: OverlayAllocation[]): number {
    const { slot, depth } = allocation;
    const collection = this.collectionRef.current;
    const liveLayouts = remaining > 0 ? livePortalSlotsFor(collection, slot.portalLayouts, Math.min(remaining, this.previewCapacity), viewportRectFor(slot.viewportSlot.canvas), this.livePortalNodeIdsForOwner(slot.key)) : [];
    slot.viewportSlot.engine.setLivePortalNodeIds(portalNodeIdsFor(liveLayouts));
    if (!liveLayouts.length && !slot.portalLayouts.length) return remaining;
    this.record('embedded:child-overlays:render', {
      canvasId: slot.viewportSlot.canvasId,
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
    if (!liveLayouts.length) return remaining;
    for (const layout of liveLayouts) {
      if (remaining <= 0 || !layout.childCanvasId) break;
      const childSlot = this.createOverlayViewport(slot.viewportSlot.childOverlayLayer, layout.childCanvasId, layout, remaining, depth, slot.key, seen);
      if (!childSlot) continue;
      remaining -= 1;
      queue.push({ slot: childSlot, depth: depth + 1 });
    }
    return remaining;
  }

  private livePortalNodeIdsForOwner(ownerPath: string): Set<string> {
    const prefix = `embedded:${ownerPath}:`;
    const ids = new Set<string>();
    for (const key of this.slots.keys()) {
      if (!key.startsWith(prefix)) continue;
      const slot = this.slots.get(key);
      if (slot) ids.add(portalNodeIdFromOverlayKey(key));
    }
    return ids;
  }

  private handleEmbeddedPortalLayouts(slotKey: string, layouts: PortalLayout[]) {
    const slot = this.slots.get(slotKey);
    if (!slot || samePortalLayouts(slot.portalLayouts, layouts)) return;
    slot.portalLayouts = layouts;
    this.record('embedded:portal-layouts:update', {
      canvasId: slot.viewportSlot.canvasId,
      count: layouts.length,
      visible: layouts.filter((layout) => layout.visible && layout.childCanvasId).length,
    });
    this.scheduleOverlayRender();
  }

  private updateOverlayViewport(slot: Slot, layout: PortalLayout) {
    applyPortalOverlayStyle(slot.viewportSlot.wrapper, layout);
    const stageRect = screenRectToDomRect(layout.screenRect);
    const nextSizeSignature = sizeSignature(stageRect);
    if (nextSizeSignature === slot.sizeSignature) return;
    slot.sizeSignature = nextSizeSignature;
    this.layoutEmbeddedSlot(slot, stageRect);
    this.record('overlay:viewport:update', {
      canvasId: slot.viewportSlot.canvasId,
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
      if (slot.viewportSlot.canvasId !== canvasId) continue;
      const rect = slot.viewportSlot.wrapper.getBoundingClientRect();
      this.layoutEmbeddedSlot(slot, rectToDomRect(rect));
    }
  }

  private layoutEmbeddedSlot(slot: Slot, stageRect: DOMRect) {
    slot.viewportSlot.viewport.style.gridTemplateColumns = '0px minmax(0, 1fr) 0px';
    slot.viewportSlot.viewport.style.gridTemplateRows = '0px minmax(0, 1fr) 0px';
    if (slot.viewportSlot.resizers) slot.viewportSlot.resizers.style.display = 'none';
    this.disposeParentContextSlotsForOwner(slot.parentContextOwnerKey);
  }

  private renderParentContextPanes(
    layer: HTMLElement,
    ownerKey: string,
    canvasId: CanvasDocumentId,
    stageRect: DOMRect,
    paneLayout: ParentContextPaneLayout,
    paneLayoutConstraints: ParentContextPaneLayoutConstraints = {},
  ) {
    const collection = this.collectionRef.current;
    const active = collection.documents[canvasId];
    const parent = active?.parentCanvasId ? collection.documents[active.parentCanvasId] : null;
    const source = parent && active?.parentNodeId ? parent.model.nodes.find((node) => node.id === active.parentNodeId) : null;
    if (!parent || !source) {
      this.disposeParentContextSlotsForOwner(ownerKey);
      return;
    }
    const field = buildParentContextField(collection, stageRect, canvasId, paneLayout, paneLayoutConstraints);
    const shapesByRegion = new Map(field.shapes.map((shape) => [shape.region, shape]));
    const seen = new Set<string>();
    for (const region of PARENT_CONTEXT_REGIONS) {
      const rect = paneRectForRegion(region, stageRect, paneLayout, paneLayoutConstraints);
      if (rect.w <= 0 || rect.h <= 0) continue;
      const key = `${ownerKey}:${region}:${parent.id}`;
      seen.add(key);
      let slot = this.parentContextSlots.get(key);
      if (!slot) {
        slot = this.createParentContextPaneSlot(key, ownerKey, region, parent.id, parent.title);
        this.parentContextSlots.set(key, slot);
      }
      if (slot.viewportSlot.wrapper.parentElement !== layer) layer.append(slot.viewportSlot.wrapper);
      applyParentContextClipStyle(slot.viewportSlot.wrapper, rect);
      slot.viewportSlot.wrapper.dataset.region = region;
      slot.viewportSlot.wrapper.dataset.canvasId = parent.id;
      const nextSizeSignature = rectSizeSignature(rect);
      if (slot.viewportSlot.canvasId !== parent.id) {
        slot.viewportSlot.canvasId = parent.id;
        slot.viewportSlot.engine.setCanvasId(parent.id);
      }
      this.applyActiveHandleSizing(slot.viewportSlot);
      slot.viewportSlot.engine.setTheme(this.canvasThemeFor(parent.id));
      slot.viewportSlot.engine.setBackgroundImage(this.canvasBackgroundImageFor(parent.id));
      slot.viewportSlot.engine.setModel(parent.model, { preserveInteraction: true });
      const visibleNodeIds = parentContextNodeIdsForRegion(parent.model.nodes, source, region);
      slot.viewportSlot.engine.setNodeVisibilityFilter(
        (node) => visibleNodeIds.has(node.id),
        parentContextProjectionSignature(parent.id, source, region, visibleNodeIds),
      );
      const worldRect = parentContextWorldRect(source, shapesByRegion.get(region), region);
      const targetSignature = worldRectSignature(worldRect);
      const memoryKey = parentContextPaneViewportKey({
        ownerCanvasId: canvasId,
        parentCanvasId: parent.id,
        sourceNodeId: source.id,
        region,
      });
      if (!slot.cameraInitialized || slot.targetSignature !== targetSignature || slot.memoryKey !== memoryKey) {
        const remembered = contextPaneViewportMemory(collection.view, memoryKey, targetSignature);
        slot.camera = remembered?.camera ?? cameraForWorldRect(worldRect, rect);
        slot.cameraInitialized = true;
        slot.targetSignature = targetSignature;
        slot.memoryKey = memoryKey;
        slot.viewportSlot.engine.setCamera(slot.camera);
      } else if (slot.camera) {
        slot.viewportSlot.engine.setCamera(slot.camera);
      }
      if (slot.sizeSignature !== nextSizeSignature) {
        slot.sizeSignature = nextSizeSignature;
      }
    }

    this.disposeParentContextSlotsExcept(ownerKey, seen);
    this.syncViewportControlVisibility();
  }

  private createParentContextPaneSlot(key: string, ownerKey: string, region: ParentContextRegion, canvasId: CanvasDocumentId, label: string): ParentContextPaneSlot {
    let viewportSlot: CanvasViewportSlot;
    viewportSlot = createCanvasViewportSlot({
      key,
      canvasId,
      mode: 'embedded-live',
      ariaLabel: `${label} context pane`,
      canvasClassName: 'parent-context-canvas',
      wrapperClassName: 'parent-context-canvas-clip native-parent-context-canvas-clip',
      viewportClassName: 'canvas-viewport parent-context-canvas-viewport',
      controls: ['fit', 'arrange', 'theme'],
      onControl: (slot, control, anchor) => this.handleViewportControl(slot, control, anchor),
      engineOptions: this.editableEngineOptions(canvasId, {
        beforeCommandSelection: () => viewportSlot.engine.getSelectionState(),
        onStatus: () => this.handleParentContextStatus(key),
        onModelChange: (model, change) => this.handleEmbeddedModelChange(canvasId, model, change),
        onCanvasDoubleClick: (targetCanvasId) => {
          this.executeDocumentCommand({ type: 'select-canvas', canvasId: targetCanvasId, source: 'pointer' });
          return true;
        },
        onPortalLayout: (layouts) => this.handleParentContextPortalLayouts(key, layouts),
      }),
    });
    viewportSlot.wrapper.dataset.region = region;
    viewportSlot.wrapper.style.background = 'transparent';
    viewportSlot.viewport.style.inset = '0';
    viewportSlot.engine.setTheme(this.canvasThemeFor(canvasId));
    viewportSlot.engine.setBackgroundImage(this.canvasBackgroundImageFor(canvasId));
    this.applyActiveHandleSizing(viewportSlot);
    this.record('parent-context:pane:create', { ownerKey, canvasId, region });
    this.syncViewportControlVisibility();
    return { key, ownerKey, canvasId, region, viewportSlot, portalLayouts: [], cameraInitialized: false, camera: null, targetSignature: '', memoryKey: '', sizeSignature: '' };
  }

  private handleParentContextStatus(slotKey: string) {
    const slot = this.parentContextSlots.get(slotKey);
    if (!slot) return;
    const nextCamera = slot.viewportSlot.engine.getCamera();
    if (slot.camera && sameCamera(slot.camera, nextCamera)) return;
    slot.camera = nextCamera;
    slot.cameraInitialized = true;
    if (!slot.memoryKey || !slot.targetSignature) return;
    const base = this.collectionRef.current;
    base.view = rememberContextPaneViewport(base.view, slot.memoryKey, nextCamera, slot.targetSignature);
    this.historyRef.current = { ...this.historyRef.current, present: base };
    this.collectionRef.current = base;
    if (this.storageReady) this.scheduleViewportSnapshotMirror();
    this.setLiveStatus(this.status);
  }

  private handleParentContextPortalLayouts(slotKey: string, layouts: PortalLayout[]) {
    const slot = this.parentContextSlots.get(slotKey);
    if (!slot || samePortalLayouts(slot.portalLayouts, layouts)) return;
    slot.portalLayouts = layouts;
    this.record('parent-context:portal-layouts:update', {
      canvasId: slot.viewportSlot.canvasId,
      region: slot.region,
      count: layouts.length,
      visible: layouts.filter((layout) => layout.visible && layout.childCanvasId).length,
    });
    this.scheduleOverlayRender();
  }

  private handleActiveStatus(canvasId: CanvasDocumentId, nextStatus: ViewportStatus) {
    if (this.collectionRef.current.activeCanvasId !== canvasId) return;
    this.setLiveStatus(nextStatus);
    this.persistViewportFromActiveEngine();
  }

  private handleActiveModelChange(canvasId: CanvasDocumentId, model: CanvasModel, change: CanvasModelChange) {
    const base = this.collectionRef.current;
    if (base.activeCanvasId !== canvasId) return;
    this.commitCanvasModelInPlace(canvasId, model, change);
  }

  private handleEmbeddedModelChange(canvasId: CanvasDocumentId, model: CanvasModel, change: CanvasModelChange) {
    const base = this.collectionRef.current;
    if (!base.documents[canvasId]) return;
    this.commitCanvasModelInPlace(canvasId, model, change);
  }

  private commitCanvasModelInPlace(canvasId: CanvasDocumentId, model: CanvasModel, change: CanvasModelChange) {
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
      view: cloneViewState(base.view),
    };
    updateParentPortalSummary(next, canvasId);
    const nextHistory = pushWorkspaceHistory(this.historyRef.current, next);
    this.historyRef.current = nextHistory;
    this.collectionRef.current = nextHistory.present;
    this.lastCanvasModelChangeRef.current = { ...change, nodeIds: [...change.nodeIds] };
    this.canvasModelChangeCount += 1;
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

  private handleBeforeCommand(canvasId: CanvasDocumentId, command: CanvasCommand, selection: CanvasSelectionState | null) {
    if (command.type === 'delete-selection') {
      const activeSaved = this.saveActiveViewport(this.collectionRef.current);
      const selected = selection ? selectedPortalNodesWithChildrenForSelection(activeSaved, canvasId, selection) : [];
      if (selected.length) {
        const plan = openDeleteConfirmation(activeSaved, canvasId, selected.map((node) => node.id), command.source);
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
    const engine = this.activeEngine();
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
    const engine = this.activeEngine();
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
    this.theme = normalizeCanasterThemeId(documentThemeId(nextHistory.present));
    this.lastModelChangeRef.current = nextLastModelChange;
    if (notify) this.onCollectionChange?.(nextHistory.present, changes);
    this.renderCollection();
  }

  private commitActiveCanvasTransition(next: CanvasDocumentCollection, changes: DocumentModelChange[], interaction: string) {
    const nextHistory = pushWorkspaceHistory(this.historyRef.current, next);
    this.historyRef.current = nextHistory;
    this.collectionRef.current = nextHistory.present;
    this.theme = normalizeCanasterThemeId(documentThemeId(nextHistory.present));
    this.lastModelChangeRef.current = changes.length ? changes[changes.length - 1] : this.lastModelChangeRef.current;
    const collection = this.collectionRef.current;
    const active = collection.documents[collection.activeCanvasId];
    this.record('collection:active-transition', {
      activeCanvasId: collection.activeCanvasId,
      changes: changes.length,
      previousSlots: this.slots.size,
    });
    this.root.dataset.activeCanvasId = collection.activeCanvasId;
    if (active) this.syncActiveViewportSlot();
    this.disposeSlots();
    this.disposeParentContextSlots();
    this.setControlOwnerSlot(this.activeSlot);
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
    this.theme = normalizeCanasterThemeId(documentThemeId(nextHistory.present));
    this.setStatus({ ...this.status, interaction });
    this.onCollectionChange?.(nextHistory.present, []);
    this.renderCollection();
  }

  private mirrorWorkspaceSnapshot(snapshot: CanvasWorkspaceSnapshot) {
    saveWorkspaceSnapshotMirror(snapshot, this.storageKey);
  }

  private maybeAutoFit() {
    if (!this.fitOnFirstLoad || this.restoredFromStorage || this.didAutoFitInitialView || !this.activeEngine()) return;
    if (this.collectionRef.current.activeCanvasId !== this.collectionRef.current.rootCanvasId) return;
    this.didAutoFitInitialView = true;
    requestAnimationFrame(() => {
      const engine = this.activeEngine();
      if (this.disposed || !engine) return;
      engine.fit();
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
      lastCanvasModelChange: this.lastCanvasModelChangeRef.current,
      lastCanvasModelChangeId: this.canvasModelChangeCount,
      canUndo: this.historyRef.current.undoStack.length > 0,
      canRedo: this.historyRef.current.redoStack.length > 0,
      storageReady: this.storageReady,
    });
  }

  private disposeSlots() {
    if (this.slots.size) this.record('engine:embedded:dispose', { slots: this.slots.size });
    for (const slot of this.slots.values()) {
      this.disposeParentContextSlotsForOwner(slot.parentContextOwnerKey);
      slot.viewportSlot.engine.dispose();
      slot.viewportSlot.wrapper.remove();
    }
    this.slots.clear();
    this.ensureControlOwnerSlotExists();
  }

  private disposeSlotsExcept(seen: Set<string>) {
    let disposed = 0;
    for (const [key, slot] of this.slots) {
      if (seen.has(key)) continue;
      this.disposeParentContextSlotsForOwner(slot.parentContextOwnerKey);
      slot.viewportSlot.engine.dispose();
      slot.viewportSlot.wrapper.remove();
      this.slots.delete(key);
      disposed += 1;
    }
    if (disposed) this.record('engine:embedded:dispose-removed', { slots: disposed });
    if (disposed) this.ensureControlOwnerSlotExists();
  }

  private disposeParentContextSlots() {
    if (this.parentContextSlots.size) this.record('parent-context:canvas:dispose', { slots: this.parentContextSlots.size });
    for (const slot of this.parentContextSlots.values()) {
      slot.viewportSlot.engine.dispose();
      slot.viewportSlot.wrapper.remove();
    }
    this.parentContextSlots.clear();
    this.ensureControlOwnerSlotExists();
  }

  private disposeParentContextSlotsForOwner(ownerKey: string) {
    let disposed = 0;
    for (const [key, slot] of this.parentContextSlots) {
      if (slot.ownerKey !== ownerKey) continue;
      slot.viewportSlot.engine.dispose();
      slot.viewportSlot.wrapper.remove();
      this.parentContextSlots.delete(key);
      disposed += 1;
    }
    if (disposed) this.record('parent-context:canvas:dispose-owner', { ownerKey, slots: disposed });
    if (disposed) this.ensureControlOwnerSlotExists();
  }

  private disposeParentContextSlotsExcept(ownerKey: string, seen: Set<string>) {
    let disposed = 0;
    for (const [key, slot] of this.parentContextSlots) {
      if (slot.ownerKey !== ownerKey || seen.has(key)) continue;
      slot.viewportSlot.engine.dispose();
      slot.viewportSlot.wrapper.remove();
      this.parentContextSlots.delete(key);
      disposed += 1;
    }
    if (disposed) this.record('parent-context:canvas:dispose-removed', { ownerKey, slots: disposed });
    if (disposed) this.ensureControlOwnerSlotExists();
  }

  private record(name: string, data: Record<string, unknown> = {}, level: 'debug' | 'warn' = 'debug') {
    recordNativeCanvasEvent(name, data, level);
  }

  private exposeDebugApi() {
    (window as Window & { __canwayNested?: unknown }).__canwayNested = {
      getCollection: () => cloneDocumentCollection(this.collectionRef.current),
      getViewState: () => this.viewState(),
      applyViewState: (viewState: SerializableNestedCanvasViewState) => this.applyViewState(viewState),
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
      contextPaneCameras: () => [...this.parentContextSlots.values()].map((slot) => ({
        key: slot.key,
        ownerKey: slot.ownerKey,
        canvasId: slot.viewportSlot.canvasId,
        region: slot.region,
        memoryKey: slot.memoryKey,
        targetSignature: slot.targetSignature,
        projectedNodeIds: slot.viewportSlot.engine.getProjectedNodeIds(),
        renderedNodeIds: slot.viewportSlot.engine.getRenderedNodeIds(),
        camera: slot.viewportSlot.engine.getCamera(),
      })),
      runtimeLog: () => nativeCanvasRuntimeLog(),
    };
  }
}

type ParentContextResizeHandle = 'left' | 'right' | 'top' | 'bottom' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

function parentContextPaneIdentityFromKey(key: string): Omit<WorkspaceUrlPaneCamera, 'targetSignature' | 'camera'> | null {
  const [kind, rawOwnerCanvasId, rawParentCanvasId, rawSourceNodeId, rawRegion] = key.split('/');
  if (kind !== 'parent-context-pane' || !rawOwnerCanvasId || !rawParentCanvasId || !rawSourceNodeId || !rawRegion) return null;
  const region = parseParentContextRegion(rawRegion);
  if (!region) return null;
  try {
    return {
      ownerCanvasId: decodeURIComponent(rawOwnerCanvasId),
      parentCanvasId: decodeURIComponent(rawParentCanvasId),
      sourceNodeId: decodeURIComponent(rawSourceNodeId),
      region,
    };
  } catch {
    return null;
  }
}

function parseParentContextRegion(value: string): ParentContextRegion | null {
  if (
    value === 'top' ||
    value === 'top-right' ||
    value === 'right' ||
    value === 'bottom-right' ||
    value === 'bottom' ||
    value === 'bottom-left' ||
    value === 'left' ||
    value === 'top-left'
  ) {
    return value;
  }
  return null;
}

function rectToDomRect(rect: DOMRect | DOMRectReadOnly): DOMRect {
  return new DOMRect(rect.x, rect.y, Math.max(1, rect.width), Math.max(1, rect.height));
}

function sizeSignature(rect: DOMRect) {
  return `${Math.round(rect.width)}x${Math.round(rect.height)}`;
}

function rectSizeSignature(rect: { w: number; h: number }) {
  return `${Math.round(rect.w)}x${Math.round(rect.h)}`;
}

function screenRectToDomRect(rect: { x: number; y: number; w: number; h: number }): DOMRect {
  return new DOMRect(rect.x, rect.y, Math.max(1, rect.w), Math.max(1, rect.h));
}

function viewportRectFor(element: HTMLElement): ScreenRect {
  const rect = element.getBoundingClientRect();
  return { x: 0, y: 0, w: Math.max(1, rect.width), h: Math.max(1, rect.height) };
}

function portalNodeIdFromOverlayKey(key: string): string {
  return key.slice(key.lastIndexOf(':') + 1);
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
  element.style.background = 'transparent';
  element.style.pointerEvents = 'auto';
}

function parentContextNodeIdsForRegion(nodes: CanvasNode[], source: CanvasNode, region: ParentContextRegion) {
  const ids = new Set<string>();
  for (const node of nodes) {
    if (node.id === source.id) continue;
    if (parentContextRegionForNode(source, node) === region) ids.add(node.id);
  }
  return ids;
}

function parentContextProjectionSignature(parentCanvasId: CanvasDocumentId, source: CanvasNode, region: ParentContextRegion, nodeIds: Set<string>) {
  return [
    parentCanvasId,
    source.id,
    Math.round(source.x),
    Math.round(source.y),
    Math.round(source.w),
    Math.round(source.h),
    region,
    [...nodeIds].sort().join(','),
  ].join(':');
}

function parentContextWorldRect(source: { x: number; y: number; w: number; h: number }, shape: ParentContextFieldShape | undefined, region: string) {
  if (shape) return paddedWorldRect(shape.node, 0.48);

  const gapX = Math.max(source.w * 1.35, 260);
  const gapY = Math.max(source.h * 1.35, 200);
  const target = { ...source };
  if (region.includes('left')) target.x -= gapX;
  if (region.includes('right')) target.x += gapX;
  if (region === 'top' || region.includes('top')) target.y -= gapY;
  if (region === 'bottom' || region.includes('bottom')) target.y += gapY;
  return paddedWorldRect(target, 0.48);
}

function paddedWorldRect(rect: { x: number; y: number; w: number; h: number }, ratio: number) {
  const padX = Math.max(48, rect.w * ratio);
  const padY = Math.max(40, rect.h * ratio);
  return {
    x: rect.x - padX,
    y: rect.y - padY,
    w: rect.w + padX * 2,
    h: rect.h + padY * 2,
  };
}

function hasDroppedFiles(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false;
  if ([...dataTransfer.types].includes('Files')) return true;
  return [...dataTransfer.items].some((item) => item.kind === 'file');
}

function cameraForWorldRect(worldRect: { x: number; y: number; w: number; h: number }, screenRect: { w: number; h: number }) {
  const scale = Math.max(0.08, Math.min(1.5, Math.min(screenRect.w / Math.max(1, worldRect.w), screenRect.h / Math.max(1, worldRect.h))));
  return {
    scale,
    x: (screenRect.w - worldRect.w * scale) / 2 - worldRect.x * scale,
    y: (screenRect.h - worldRect.h * scale) / 2 - worldRect.y * scale,
  };
}

function worldRectSignature(rect: { x: number; y: number; w: number; h: number }) {
  return `${Math.round(rect.x)}:${Math.round(rect.y)}:${Math.round(rect.w)}:${Math.round(rect.h)}`;
}

function updateParentPortalSummary(collection: CanvasDocumentCollection, canvasId: CanvasDocumentId) {
  const document = collection.documents[canvasId];
  if (!document?.parentCanvasId || !document.parentNodeId) return;
  const parent = collection.documents[document.parentCanvasId];
  if (!parent) return;
  let changed = false;
  const nodes = parent.model.nodes.map((node) => {
    if (node.id !== document.parentNodeId || !portalInfoForNode(node)) return node;
    const nextNode = updatePortalSummaryForNode(node, { title: document.title, nodeCount: document.model.nodes.length });
    if (nextNode === node) return node;
    changed = true;
    return nextNode;
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

function portalNodeIdsFor(layouts: PortalLayout[]): Set<string> {
  return new Set(layouts.filter((layout) => layout.childCanvasId).map((layout) => layout.portalNodeId));
}
