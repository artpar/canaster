import { Clipboard, Copy, Maximize2, MoveRight, Trash2 } from 'lucide-react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
} from 'react';
import { CanvasEngine } from '../CanvasEngine';
import {
  cameraForCanvas,
  cloneDocumentCollection,
  selectNodeInCanvas,
  selectionForCanvas,
  setCameraForCanvas,
  setPaneLayoutForCanvas,
  setSelectionForCanvas,
  updateCanvasModel,
} from '../documentModel';
import {
  openDeleteConfirmation,
  planDocumentCommand,
  selectedPortalNodesWithChildren,
  stripPortalChildReferenceOnPaste,
} from '../documentCommands';
import { describeNode } from '../nodeTypes/registry';
import { BuiltInNodeTypes, type Camera, type CanvasCommand, type CanvasModel, type CanvasSelectionState, type PortalLayout, type ThemeName, type ViewportStatus } from '../types';
import type {
  CanvasDocumentCollection,
  CanvasDocumentId,
  CanvasWorkspaceHistory,
  CanvasWorkspaceSnapshot,
  DocumentCommand,
  DocumentModelChange,
  ParentContextFieldShape,
} from '../documentTypes';
import {
  createWorkspaceHistory,
  createWorkspaceSnapshot,
  pushWorkspaceHistory,
  redoWorkspaceHistory,
  replaceWorkspacePresent,
  undoWorkspaceHistory,
} from '../workspaceHistory';
import { DEFAULT_WORKSPACE_STORAGE_ID, loadWorkspaceSnapshot, loadWorkspaceSnapshotMirror, saveWorkspaceSnapshot, saveWorkspaceSnapshotMirror } from '../workspaceStorage';
import { ACTIVE_ENGINE_FRAME_BUDGET_MS, livePortalSlotsFor, MAX_LIVE_PORTAL_PREVIEWS, MAX_TOTAL_ENGINES } from './engineSlots';
import {
  DEFAULT_PARENT_CONTEXT_PANE_LAYOUT,
  EMBEDDED_FIELD_CENTER_RATIO,
  EMBEDDED_FIELD_MIN_BORDER_BAND,
  EMBEDDED_FIELD_MIN_CENTER_BAND,
  buildParentContextField,
  normalizeParentContextPaneLayout,
  paneLayoutForCenterRatio,
  parentContextRegionLabel,
  type ParentContextPaneLayout,
  type ParentContextPaneLayoutConstraints,
} from './parentContextField';
import { portalOverlayStyle } from './portalLayout';
import { activePlaneStyle, stackPlaneStyle, visibleStackFrames } from './stackLayout';

export type NestedCanvasWorkspaceProps = {
  initialCollection: CanvasDocumentCollection;
  theme: ThemeName;
  animationEnabled?: boolean;
  storageKey?: string;
  onCollectionChange?: (collection: CanvasDocumentCollection, changes: DocumentModelChange[]) => void;
  onChromeStateChange?: (state: NestedCanvasWorkspaceChromeState) => void;
};

export type NestedCanvasWorkspaceChromeState = {
  collection: CanvasDocumentCollection;
  status: ViewportStatus;
  lastModelChange: DocumentModelChange | null;
  canUndo: boolean;
  canRedo: boolean;
};

export type NestedCanvasWorkspaceHandle = {
  fitActiveCanvas(): void;
  resetActiveZoom(): void;
  zoomActiveBy(factor: number): void;
  undoWorkspace(): boolean;
  redoWorkspace(): boolean;
  executeActiveCanvasCommand(command: CanvasCommand): boolean;
  executeDocumentCommand(command: DocumentCommand): void;
  collection(): CanvasDocumentCollection;
};

export const initialViewportStatus: ViewportStatus = {
  zoom: 1,
  selectedNodeId: null,
  selectedNodeIds: [],
  selectionCount: 0,
  cursorWorld: null,
  renderedNodes: 0,
  totalNodes: 0,
  interaction: 'Idle',
};

const NO_PARENT_CONTEXT_PANE_LAYOUT: ParentContextPaneLayout = {
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
};

const EMBEDDED_PARENT_CONTEXT_CONSTRAINTS = {
  minPaneBand: EMBEDDED_FIELD_MIN_BORDER_BAND,
  minCenterBand: EMBEDDED_FIELD_MIN_CENTER_BAND,
};

export const NestedCanvasWorkspace = forwardRef<NestedCanvasWorkspaceHandle, NestedCanvasWorkspaceProps>(function NestedCanvasWorkspace(
  { initialCollection, theme, animationEnabled = true, storageKey = DEFAULT_WORKSPACE_STORAGE_ID, onCollectionChange, onChromeStateChange },
  ref,
) {
  const initialStorageSnapshotRef = useRef<CanvasWorkspaceSnapshot | null | undefined>(undefined);
  if (initialStorageSnapshotRef.current === undefined) {
    initialStorageSnapshotRef.current = loadWorkspaceSnapshotMirror(storageKey);
  }
  const [history, setHistory] = useState<CanvasWorkspaceHistory>(() => {
    if (initialStorageSnapshotRef.current) return initialStorageSnapshotRef.current.history;
    const next = cloneDocumentCollection(initialCollection);
    next.view.animationEnabled = animationEnabled;
    return createWorkspaceHistory(next);
  });
  const collection = history.present;
  const historyRef = useRef(history);
  const collectionRef = useRef(collection);
  const lastModelChangeRef = useRef<DocumentModelChange | null>(initialStorageSnapshotRef.current?.lastModelChange ?? null);
  const storageReadyRef = useRef(false);
  const userMutationBeforeStorageReadyRef = useRef(false);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const saveRevisionRef = useRef(0);
  const activeEngineRef = useRef<CanvasEngine | null>(null);
  const [status, setStatus] = useState<ViewportStatus>(() => (
    initialStorageSnapshotRef.current
      ? { ...initialViewportStatus, interaction: 'Workspace restored' }
      : initialViewportStatus
  ));
  const [lastModelChange, setLastModelChange] = useState<DocumentModelChange | null>(() => initialStorageSnapshotRef.current?.lastModelChange ?? null);
  const [portalLayouts, setPortalLayouts] = useState<PortalLayout[]>([]);
  const [previewCapacity, setPreviewCapacity] = useState(MAX_LIVE_PORTAL_PREVIEWS);
  const activeFrameOverBudgetCount = useRef(0);
  const [stageRect, setStageRect] = useState<DOMRect>(() => new DOMRect(0, 0, 1, 1));
  const [activeStageRect, setActiveStageRect] = useState<DOMRect>(() => new DOMRect(0, 0, 1, 1));
  const stageRef = useRef<HTMLDivElement | null>(null);
  const activeStageRef = useRef<HTMLDivElement | null>(null);

  const persistWorkspaceSnapshot = useCallback((snapshot: ReturnType<typeof createWorkspaceSnapshot>) => {
    const revision = ++saveRevisionRef.current;
    saveWorkspaceSnapshotMirror(snapshot, storageKey);
    saveChainRef.current = saveChainRef.current
      .catch(() => undefined)
      .then(() => {
        if (revision !== saveRevisionRef.current) return;
        return saveWorkspaceSnapshot(snapshot, storageKey);
      })
      .catch((error) => {
        console.warn('Failed to save Canway workspace snapshot', error);
      });
    return saveChainRef.current;
  }, [storageKey]);

  const mirrorWorkspaceSnapshot = useCallback((snapshot: ReturnType<typeof createWorkspaceSnapshot>) => {
    saveRevisionRef.current += 1;
    saveWorkspaceSnapshotMirror(snapshot, storageKey);
  }, [storageKey]);

  useEffect(() => {
    historyRef.current = history;
    collectionRef.current = collection;
    exposeDebugApi();
  }, [collection, history]);

  useEffect(() => {
    lastModelChangeRef.current = lastModelChange;
    onChromeStateChange?.({
      collection,
      status,
      lastModelChange,
      canUndo: history.undoStack.length > 0,
      canRedo: history.redoStack.length > 0,
    });
  }, [collection, history.redoStack.length, history.undoStack.length, lastModelChange, onChromeStateChange, status]);

  useEffect(() => {
    let canceled = false;
    storageReadyRef.current = false;
    userMutationBeforeStorageReadyRef.current = false;
    loadWorkspaceSnapshot(storageKey)
      .then((snapshot) => {
        if (canceled || !snapshot || userMutationBeforeStorageReadyRef.current) return;
        historyRef.current = snapshot.history;
        collectionRef.current = snapshot.history.present;
        lastModelChangeRef.current = snapshot.lastModelChange;
        setHistory(snapshot.history);
        setLastModelChange(snapshot.lastModelChange);
        setStatus((current) => ({ ...current, interaction: 'Workspace restored' }));
      })
      .catch((error) => {
        console.warn('Failed to load Canway workspace snapshot', error);
      })
      .finally(() => {
        storageReadyRef.current = true;
        if (userMutationBeforeStorageReadyRef.current) {
          persistWorkspaceSnapshot(createWorkspaceSnapshot(historyRef.current, lastModelChangeRef.current));
        }
      });
    return () => {
      canceled = true;
    };
  }, [storageKey]);

  useEffect(() => {
    if (!storageReadyRef.current) return;
    const timeout = window.setTimeout(() => {
      persistWorkspaceSnapshot(createWorkspaceSnapshot(history, lastModelChange));
    }, 180);
    return () => window.clearTimeout(timeout);
  }, [history, lastModelChange, persistWorkspaceSnapshot]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const update = () => setStageRect(stage.getBoundingClientRect());
    update();
    const observer = new ResizeObserver(update);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const activeStage = activeStageRef.current;
    if (!activeStage) return;
    const update = () => setActiveStageRect(activeStage.getBoundingClientRect());
    update();
    const observer = new ResizeObserver(update);
    observer.observe(activeStage);
    return () => observer.disconnect();
  }, []);

  const activeDocument = collection.documents[collection.activeCanvasId];
  const paneLayout = collection.view.paneLayouts[collection.activeCanvasId] ?? DEFAULT_PARENT_CONTEXT_PANE_LAYOUT;
  const parentContext = useMemo(() => buildParentContextField(collection, stageRect, collection.activeCanvasId, paneLayout), [collection, stageRect, paneLayout]);
  const hasParentContext = parentContext.shapes.length > 0;
  const normalizedPaneLayout = hasParentContext
    ? normalizeParentContextPaneLayout(stageRect, paneLayout)
    : NO_PARENT_CONTEXT_PANE_LAYOUT;
  const visibleContextFrames = useMemo(() => visibleStackFrames(collection), [collection]);
  const parentContextCanvasCapacity = Math.min(parentContext.shapes.length, Math.max(0, MAX_TOTAL_ENGINES - 1 - visibleContextFrames.length));
  const livePreviewCapacity = Math.max(0, MAX_TOTAL_ENGINES - 1 - visibleContextFrames.length - parentContextCanvasCapacity);
  const liveLayouts = useMemo(
    () => livePortalSlotsFor(collection, portalLayouts).slice(0, Math.min(previewCapacity, livePreviewCapacity)),
    [collection, portalLayouts, previewCapacity, livePreviewCapacity],
  );
  const livePortalNodeIds = useMemo(() => new Set(liveLayouts.map((layout) => layout.portalNodeId)), [liveLayouts]);

  useEffect(() => {
    activeEngineRef.current?.setLivePortalNodeIds(livePortalNodeIds);
  }, [livePortalNodeIds]);

  const commitCollection = useCallback((next: CanvasDocumentCollection, changes: DocumentModelChange[], options: { recordHistory?: boolean } = {}) => {
    const recordHistory = options.recordHistory ?? changes.length > 0;
    const nextHistory = recordHistory
      ? pushWorkspaceHistory(historyRef.current, next)
      : replaceWorkspacePresent(historyRef.current, next);
    const meaningfulMutation = recordHistory || changes.length > 0;
    const nextLastModelChange = changes.length ? changes[changes.length - 1] : lastModelChangeRef.current;
    if (!storageReadyRef.current && meaningfulMutation) {
      userMutationBeforeStorageReadyRef.current = true;
    }
    if (storageReadyRef.current || meaningfulMutation) {
      mirrorWorkspaceSnapshot(createWorkspaceSnapshot(nextHistory, nextLastModelChange));
    }
    historyRef.current = nextHistory;
    collectionRef.current = nextHistory.present;
    setHistory(nextHistory);
    if (changes.length) setLastModelChange(changes[changes.length - 1]);
    onCollectionChange?.(nextHistory.present, changes);
  }, [mirrorWorkspaceSnapshot, onCollectionChange]);

  const commitWorkspaceHistory = useCallback((nextHistory: CanvasWorkspaceHistory, interaction: string) => {
    if (!storageReadyRef.current) userMutationBeforeStorageReadyRef.current = true;
    mirrorWorkspaceSnapshot(createWorkspaceSnapshot(nextHistory, lastModelChangeRef.current));
    historyRef.current = nextHistory;
    collectionRef.current = nextHistory.present;
    setHistory(nextHistory);
    setStatus((current) => ({ ...current, interaction }));
    onCollectionChange?.(nextHistory.present, []);
  }, [mirrorWorkspaceSnapshot, onCollectionChange]);

  const saveActiveViewport = useCallback((base: CanvasDocumentCollection) => {
    const engine = activeEngineRef.current;
    if (!engine) return base;
    const withCamera = setCameraForCanvas(base, base.activeCanvasId, engine.getCamera());
    return setSelectionForCanvas(withCamera, base.activeCanvasId, engine.getSelectionState());
  }, []);

  const executeDocumentCommand = useCallback((command: DocumentCommand) => {
    const base = saveActiveViewport(collectionRef.current);
    const plan = planDocumentCommand(base, command);
    commitCollection(plan.collection, plan.changes);
    setStatus((current) => ({ ...current, interaction: plan.interaction }));
  }, [commitCollection, saveActiveViewport]);

  const executeActiveCanvasCommand = useCallback((command: CanvasCommand) => activeEngineRef.current?.executeCommand(command) ?? false, []);

  const undoWorkspace = useCallback(() => {
    const current = replaceWorkspacePresent(historyRef.current, saveActiveViewport(collectionRef.current));
    if (!current.undoStack.length) return false;
    commitWorkspaceHistory(undoWorkspaceHistory(current), 'Undo');
    return true;
  }, [commitWorkspaceHistory, saveActiveViewport]);

  const redoWorkspace = useCallback(() => {
    const current = replaceWorkspacePresent(historyRef.current, saveActiveViewport(collectionRef.current));
    if (!current.redoStack.length) return false;
    commitWorkspaceHistory(redoWorkspaceHistory(current), 'Redo');
    return true;
  }, [commitWorkspaceHistory, saveActiveViewport]);

  const handlePaneLayoutChange = useCallback((canvasId: CanvasDocumentId, nextLayout: ParentContextPaneLayout) => {
    const base = collectionRef.current;
    if (!base.documents[canvasId]) return;
    commitCollection(setPaneLayoutForCanvas(base, canvasId, nextLayout), [], { recordHistory: false });
  }, [commitCollection]);

  const handleWorkspaceKeyDownCapture = useCallback((event: React.KeyboardEvent) => {
    if (event.key !== 'Escape' || collectionRef.current.view.deleteConfirmation) return;
    const active = collectionRef.current.documents[collectionRef.current.activeCanvasId];
    if (!active?.parentCanvasId) return;
    event.preventDefault();
    event.stopPropagation();
    executeDocumentCommand({ type: 'go-to-parent-canvas', source: 'keyboard' });
  }, [executeDocumentCommand]);

  useImperativeHandle(ref, () => ({
    fitActiveCanvas: () => activeEngineRef.current?.fit(),
    resetActiveZoom: () => activeEngineRef.current?.resetZoom(),
    zoomActiveBy: (factor: number) => activeEngineRef.current?.zoomBy(factor),
    undoWorkspace,
    redoWorkspace,
    executeActiveCanvasCommand,
    executeDocumentCommand,
    collection: () => cloneDocumentCollection(collectionRef.current),
  }), [executeActiveCanvasCommand, executeDocumentCommand, redoWorkspace, undoWorkspace]);

  const handleActiveStatus = useCallback((canvasId: CanvasDocumentId, nextStatus: ViewportStatus) => {
    if (collectionRef.current.activeCanvasId !== canvasId) return;
    setStatus(nextStatus);
    const engine = activeEngineRef.current;
    if (!engine) return;
    if (!storageReadyRef.current) return;
    const base = collectionRef.current;
    const withCamera = setCameraForCanvas(base, base.activeCanvasId, engine.getCamera());
    const withSelection = setSelectionForCanvas(withCamera, base.activeCanvasId, engine.getSelectionState());
    commitCollection(withSelection, [], { recordHistory: false });
  }, [commitCollection]);

  const handleEmbeddedStatus = useCallback((canvasId: CanvasDocumentId, _status: ViewportStatus, engine: CanvasEngine) => {
    if (!storageReadyRef.current) return;
    const base = collectionRef.current;
    if (!base.documents[canvasId]) return;
    const withCamera = setCameraForCanvas(base, canvasId, engine.getCamera());
    const withSelection = setSelectionForCanvas(withCamera, canvasId, engine.getSelectionState());
    commitCollection(withSelection, [], { recordHistory: false });
  }, [commitCollection]);

  const handleActiveModelChange = useCallback((canvasId: CanvasDocumentId, model: CanvasModel) => {
    const base = collectionRef.current;
    if (base.activeCanvasId !== canvasId) return;
    const next = updateCanvasModel(base, base.activeCanvasId, model);
    commitCollection(next, [], { recordHistory: true });
  }, [commitCollection, activeDocument.model]);

  const handleEmbeddedModelChange = useCallback((canvasId: CanvasDocumentId, model: CanvasModel) => {
    const base = collectionRef.current;
    if (!base.documents[canvasId]) return;
    const next = updateCanvasModel(base, canvasId, model);
    commitCollection(next, [], { recordHistory: true });
  }, [commitCollection]);

  const handleEmbeddedEnter = useCallback((canvasId: CanvasDocumentId) => {
    executeDocumentCommand({ type: 'select-canvas', canvasId, source: 'pointer' });
    return true;
  }, [executeDocumentCommand]);

  const handleContextSnippetModelChange = useCallback((shape: ParentContextFieldShape, model: CanvasModel) => {
    const replacement = model.nodes.find((node) => node.id === shape.node.id);
    const base = collectionRef.current;
    const parent = base.documents[shape.parentCanvasId];
    if (!replacement || !parent) return;
    const nextParentModel: CanvasModel = {
      schemaVersion: 2,
      nodes: parent.model.nodes.map((node) => node.id === shape.node.id ? replacement : node),
    };
    const next = updateCanvasModel(base, shape.parentCanvasId, nextParentModel);
    commitCollection(next, [], { recordHistory: true });
  }, [commitCollection]);

  const handleNodeAction = useCallback((nodeId: string, actionId: string, source: 'pointer' | 'keyboard' | 'nonvisual' | 'ai') => {
    executeDocumentCommand({ type: 'execute-node-action', canvasId: collectionRef.current.activeCanvasId, nodeId, actionId, source });
    return true;
  }, [executeDocumentCommand]);

  const handleFrameMetrics = useCallback((frameMs: number) => {
    if (frameMs > ACTIVE_ENGINE_FRAME_BUDGET_MS) {
      activeFrameOverBudgetCount.current += 1;
      if (activeFrameOverBudgetCount.current >= 3) {
        activeFrameOverBudgetCount.current = 0;
        setPreviewCapacity((current) => Math.max(0, current - 1));
      }
      return;
    }
    activeFrameOverBudgetCount.current = 0;
    setPreviewCapacity((current) => current < MAX_LIVE_PORTAL_PREVIEWS ? current + 1 : current);
  }, []);

  const handleBeforeCommand = useCallback((command: CanvasCommand) => {
    if (command.type === 'delete-selection') {
      const base = saveActiveViewport(collectionRef.current);
      const selected = selectedPortalNodesWithChildren(base, base.activeCanvasId);
      if (selected.length) {
        const plan = openDeleteConfirmation(base, base.activeCanvasId, selected.map((node) => node.id), command.source);
        commitCollection(plan.collection, plan.changes);
        setStatus((current) => ({ ...current, interaction: plan.interaction }));
        return false;
      }
    }
    return command;
  }, [commitCollection, saveActiveViewport]);

  function exposeDebugApi() {
    (window as Window & { __canwayNested?: unknown }).__canwayNested = {
      getCollection: () => cloneDocumentCollection(collectionRef.current),
      getWorkspaceSnapshot: () => createWorkspaceSnapshot(historyRef.current, lastModelChangeRef.current),
      flushWorkspaceSnapshot: () => persistWorkspaceSnapshot(createWorkspaceSnapshot(historyRef.current, lastModelChangeRef.current)),
      executeDocumentCommand,
      executeActiveCanvasCommand,
      replaceCollection: (next: CanvasDocumentCollection) => commitCollection(cloneDocumentCollection(next), []),
      undoWorkspace,
      redoWorkspace,
      activeCanvasId: () => collectionRef.current.activeCanvasId,
      engineCount: () => document.querySelectorAll('canvas[data-engine-mode]').length,
    };
  }

  if (!activeDocument) return null;

  return (
    <section className="nested-workspace" aria-label="Nested canvas workspace" data-active-canvas-id={collection.activeCanvasId} onKeyDownCapture={handleWorkspaceKeyDownCapture}>
      <div
        ref={stageRef}
        className="nested-stage"
        data-animation={collection.view.animationEnabled ? 'on' : 'off'}
        data-parent-context={hasParentContext ? 'on' : 'off'}
        style={parentContextGridStyle(normalizedPaneLayout)}
      >
        <div ref={activeStageRef} className="nested-center-cell">
          <div className="stack-planes" aria-hidden="true">
            {dormantAncestorFrames(collection).map((frame, index) => {
              const document = collection.documents[frame.canvasId];
              if (!document) return null;
              return (
                <button
                  key={`slab:${frame.canvasId}`}
                  className="stack-slab"
                  type="button"
                  style={{ top: 92 + index * 38 }}
                  onClick={() => executeDocumentCommand({ type: 'select-canvas', canvasId: frame.canvasId, source: 'nonvisual' })}
                >
                  {document.title}
                </button>
              );
            })}
            {visibleContextFrames.map((frame, index) => {
              const document = collection.documents[frame.canvasId];
              if (!document) return null;
              return (
                <button
                  key={frame.canvasId}
                  className="stack-plane-button"
                  type="button"
                  style={stackPlaneStyle({ ...frame, depth: index }, activeStageRect)}
                  aria-label={`Go to ${document.title}`}
                  onClick={() => executeDocumentCommand({ type: 'select-canvas', canvasId: frame.canvasId, source: 'nonvisual' })}
                >
                  <EngineCanvas
                    canvasId={frame.canvasId}
                    model={document.model}
                    theme={theme}
                    mode="context-live"
                    camera={cameraForCanvas(collection, frame.canvasId)}
                    className="canvas-surface context-plane"
                    ariaLabel={`${document.title} context canvas`}
                  />
                </button>
              );
            })}
          </div>

          <ActiveEngineCanvas
            key={collection.activeCanvasId}
            refEngine={activeEngineRef}
            canvasId={collection.activeCanvasId}
            model={activeDocument.model}
            theme={theme}
            camera={cameraForCanvas(collection, collection.activeCanvasId)}
            selection={collection.view.selections[collection.activeCanvasId]}
            livePortalNodeIds={livePortalNodeIds}
            onStatus={handleActiveStatus}
            onModelChange={handleActiveModelChange}
            onPortalLayout={setPortalLayouts}
            onNodeAction={handleNodeAction}
            beforeCommand={handleBeforeCommand}
            onFrameMetrics={handleFrameMetrics}
            style={activePlaneStyle(activeStageRect)}
          />

          <div className="portal-overlays" aria-label="Live child canvas previews">
            {liveLayouts.map((layout) => {
              const childCanvasId = layout.childCanvasId;
              if (!childCanvasId) return null;
              const child = collection.documents[childCanvasId];
              if (!child) return null;
              return (
                <div key={`${layout.portalNodeId}:${childCanvasId}`} className="portal-overlay" style={portalOverlayStyle(layout)}>
                  <EmbeddedNestedViewport
                    canvasId={childCanvasId}
                    collection={collection}
                    theme={theme}
                    ariaLabel={`${child.title} live preview`}
                    depth={0}
                    remainingSlots={livePreviewCapacity}
                    onStatus={handleEmbeddedStatus}
                    onModelChange={handleEmbeddedModelChange}
                    onEnterCanvas={handleEmbeddedEnter}
                    onSnippetModelChange={handleContextSnippetModelChange}
                    onPaneLayoutChange={handlePaneLayoutChange}
                  />
                </div>
              );
            })}
          </div>

          <div className="stack-breadcrumb" aria-label="Canvas path">
            {collection.view.stackPath.map((frame) => {
              const document = collection.documents[frame.canvasId];
              if (!document) return null;
              return (
                <button key={frame.canvasId} type="button" onClick={() => executeDocumentCommand({ type: 'select-canvas', canvasId: frame.canvasId, source: 'nonvisual' })}>
                  {document.title}
                </button>
              );
            })}
          </div>
        </div>

        <ParentContextField
          field={parentContext}
          collection={collection}
          theme={theme}
          stageRect={stageRect}
          paneLayout={paneLayout}
          onPaneLayoutChange={(nextLayout) => {
            const current = collectionRef.current.view.paneLayouts[collectionRef.current.activeCanvasId] ?? DEFAULT_PARENT_CONTEXT_PANE_LAYOUT;
            const resolved = typeof nextLayout === 'function' ? nextLayout(current) : nextLayout;
            handlePaneLayoutChange(collectionRef.current.activeCanvasId, resolved);
          }}
          liveCanvasCapacity={parentContextCanvasCapacity}
          onStatus={handleEmbeddedStatus}
          onModelChange={handleEmbeddedModelChange}
          onEnterCanvas={handleEmbeddedEnter}
          onSnippetModelChange={handleContextSnippetModelChange}
          onChildPaneLayoutChange={handlePaneLayoutChange}
          onActivate={(shape) => {
            if (shape.portal) {
              executeDocumentCommand({ type: 'activate-neighbor-portal', parentCanvasId: shape.parentCanvasId, portalNodeId: shape.node.id, source: 'nonvisual' });
            } else {
              const selected = selectNodeInCanvas(collectionRef.current, shape.parentCanvasId, shape.node.id);
              const plan = planDocumentCommand(selected, { type: 'select-canvas', canvasId: shape.parentCanvasId, source: 'nonvisual' });
              commitCollection(plan.collection, plan.changes);
            }
          }}
        />
      </div>

      {collection.view.deleteConfirmation ? (
        <div className="delete-confirmation" role="dialog" aria-modal="true" aria-label="Delete child canvas confirmation">
          <div className="delete-confirmation-panel">
            <h2>Delete child canvas?</h2>
            <p>This removes the selected portal and descendant canvases.</p>
            <div>
              <button type="button" onClick={() => executeDocumentCommand({ type: 'cancel-delete-confirmation', source: 'nonvisual' })}>Cancel</button>
              <button type="button" onClick={() => executeDocumentCommand({ type: 'confirm-delete-selection', canvasId: collection.activeCanvasId, source: 'nonvisual' })}>Delete</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
});

type ActiveEngineCanvasProps = {
  refEngine: React.MutableRefObject<CanvasEngine | null>;
  canvasId: CanvasDocumentId;
  model: CanvasModel;
  theme: ThemeName;
  camera: Camera;
  selection: CanvasSelectionState | undefined;
  livePortalNodeIds: Set<string>;
  style: CSSProperties;
  onStatus: (canvasId: CanvasDocumentId, status: ViewportStatus) => void;
  onModelChange: (canvasId: CanvasDocumentId, model: CanvasModel) => void;
  onPortalLayout: (layouts: PortalLayout[]) => void;
  onNodeAction: (nodeId: string, actionId: string, source: 'pointer' | 'keyboard' | 'nonvisual' | 'ai') => boolean;
  beforeCommand: (command: CanvasCommand) => CanvasCommand | false;
  onFrameMetrics: (frameMs: number) => void;
};

function ActiveEngineCanvas({
  refEngine,
  canvasId,
  model,
  theme,
  camera,
  selection,
  livePortalNodeIds,
  style,
  onStatus,
  onModelChange,
  onPortalLayout,
  onNodeAction,
  beforeCommand,
  onFrameMetrics,
}: ActiveEngineCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = new CanvasEngine(canvasRef.current, {
      canvasId,
      interactionMode: 'active',
      beforeCommand,
      onNodeAction,
      onStatus: (nextStatus) => onStatus(canvasId, nextStatus),
      onModelChange: (nextModel) => onModelChange(canvasId, nextModel),
      onPortalLayout,
      onFrameMetrics: (metrics) => onFrameMetrics(metrics.frameMs),
      livePortalNodeIds,
      transformPastedNode: stripPortalChildReferenceOnPaste,
      pasteInteractionForNodes: (nodes) => nodes.some((node) => node.type === BuiltInNodeTypes.canvas) ? 'Pasted canvas node without child contents' : null,
    });
    engine.setModel(model);
    engine.setTheme(theme);
    engine.setCamera(camera);
    if (selection) engine.setSelectionState(selection);
    refEngine.current = engine;
    return () => {
      engine.dispose();
      if (refEngine.current === engine) refEngine.current = null;
    };
  }, [canvasId, refEngine]);

  useEffect(() => {
    const engine = refEngine.current;
    if (!engine) return;
    engine.setModel(model, { preserveInteraction: true });
    engine.setTheme(theme);
    engine.setLivePortalNodeIds(livePortalNodeIds);
  }, [model, refEngine, theme, livePortalNodeIds]);

  useEffect(() => {
    const engine = refEngine.current;
    if (!engine) return;
    engine.setCamera(camera);
    if (selection) engine.setSelectionState(selection);
  }, [camera, refEngine, selection]);

  return <canvas ref={canvasRef} className="canvas-surface active-plane" aria-label="Canway canvas" data-engine-mode="active" style={style} />;
}

type EngineCanvasProps = {
  canvasId: CanvasDocumentId;
  model: CanvasModel;
  theme: ThemeName;
  mode: 'embedded-live' | 'preview-live' | 'context-live';
  camera?: Camera;
  selection?: CanvasSelectionState;
  livePortalNodeIds?: Set<string>;
  className: string;
  ariaLabel: string;
  onStatus?: (canvasId: CanvasDocumentId, status: ViewportStatus, engine: CanvasEngine) => void;
  onModelChange?: (canvasId: CanvasDocumentId, model: CanvasModel) => void;
  onPortalLayout?: (canvasId: CanvasDocumentId, layouts: PortalLayout[]) => void;
  onCanvasDoubleClick?: (canvasId: CanvasDocumentId, event: MouseEvent) => boolean;
};

function EngineCanvas({
  canvasId,
  model,
  theme,
  mode,
  camera,
  selection,
  livePortalNodeIds,
  className,
  ariaLabel,
  onStatus,
  onModelChange,
  onPortalLayout,
  onCanvasDoubleClick,
}: EngineCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<CanvasEngine | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = new CanvasEngine(canvasRef.current, {
      canvasId,
      interactionMode: mode,
      onCanvasDoubleClick,
      onStatus: (status) => onStatus?.(canvasId, status, engine),
      onModelChange: (nextModel) => onModelChange?.(canvasId, nextModel),
      onPortalLayout: (layouts) => onPortalLayout?.(canvasId, layouts),
      livePortalNodeIds,
      transformPastedNode: stripPortalChildReferenceOnPaste,
      pasteInteractionForNodes: (nodes) => nodes.some((node) => node.type === BuiltInNodeTypes.canvas) ? 'Pasted canvas node without child contents' : null,
    });
    engine.setModel(model);
    engine.setTheme(theme);
    if (camera) engine.setCamera(camera);
    else engine.fit(24);
    if (selection) engine.setSelectionState(selection);
    engineRef.current = engine;
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, [canvasId, mode]);

  useEffect(() => {
    engineRef.current?.setModel(model, { preserveInteraction: true });
    engineRef.current?.setTheme(theme);
    if (livePortalNodeIds) engineRef.current?.setLivePortalNodeIds(livePortalNodeIds);
  }, [model, theme, livePortalNodeIds]);

  useEffect(() => {
    if (camera) engineRef.current?.setCamera(camera);
    if (selection) engineRef.current?.setSelectionState(selection);
  }, [camera, selection]);

  return <canvas ref={canvasRef} className={className} aria-label={ariaLabel} data-engine-mode={mode} />;
}

type EmbeddedNestedViewportProps = {
  canvasId: CanvasDocumentId;
  collection: CanvasDocumentCollection;
  theme: ThemeName;
  ariaLabel: string;
  depth: number;
  remainingSlots: number;
  onStatus: (canvasId: CanvasDocumentId, status: ViewportStatus, engine: CanvasEngine) => void;
  onModelChange: (canvasId: CanvasDocumentId, model: CanvasModel) => void;
  onEnterCanvas: (canvasId: CanvasDocumentId) => boolean;
  onSnippetModelChange: (shape: ParentContextFieldShape, model: CanvasModel) => void;
  onPaneLayoutChange: (canvasId: CanvasDocumentId, paneLayout: ParentContextPaneLayout) => void;
};

function EmbeddedNestedViewport({
  canvasId,
  collection,
  theme,
  ariaLabel,
  depth,
  remainingSlots,
  onStatus,
  onModelChange,
  onEnterCanvas,
  onSnippetModelChange,
  onPaneLayoutChange,
}: EmbeddedNestedViewportProps) {
  const document = collection.documents[canvasId];
  const [stageRect, setStageRect] = useState<DOMRect>(() => new DOMRect(0, 0, 1, 1));
  const [portalLayouts, setPortalLayouts] = useState<PortalLayout[]>([]);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const update = () => setStageRect(viewport.getBoundingClientRect());
    update();
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  const portalBudget = Math.max(0, remainingSlots - 1);
  const defaultPaneLayout = useMemo(
    () => paneLayoutForCenterRatio(stageRect, EMBEDDED_FIELD_CENTER_RATIO, EMBEDDED_PARENT_CONTEXT_CONSTRAINTS),
    [stageRect],
  );
  const paneLayout = collection.view.paneLayouts[canvasId] ?? defaultPaneLayout;
  const setEmbeddedPaneLayout: Dispatch<SetStateAction<ParentContextPaneLayout>> = useCallback((next) => {
    const base = collection.view.paneLayouts[canvasId] ?? defaultPaneLayout;
    const resolved = typeof next === 'function' ? next(base) : next;
    onPaneLayoutChange(canvasId, normalizeParentContextPaneLayout(stageRect, resolved, EMBEDDED_PARENT_CONTEXT_CONSTRAINTS));
  }, [canvasId, collection.view.paneLayouts, defaultPaneLayout, onPaneLayoutChange, stageRect]);
  const contextField = useMemo(
    () => buildParentContextField(collection, stageRect, canvasId, paneLayout, EMBEDDED_PARENT_CONTEXT_CONSTRAINTS),
    [collection, stageRect, canvasId, paneLayout],
  );
  const childLayouts = useMemo(() => livePortalSlotsFor(collection, portalLayouts).slice(0, portalBudget), [collection, portalLayouts, portalBudget]);
  const contextCapacity = Math.min(contextField.shapes.length, Math.max(0, portalBudget - childLayouts.length));
  const showContextField = contextCapacity > 0 && contextField.shapes.length > 0;
  const normalizedPaneLayout = showContextField
    ? normalizeParentContextPaneLayout(stageRect, paneLayout, EMBEDDED_PARENT_CONTEXT_CONSTRAINTS)
    : NO_PARENT_CONTEXT_PANE_LAYOUT;
  const livePortalNodeIds = useMemo(() => new Set(childLayouts.map((layout) => layout.portalNodeId)), [childLayouts]);

  if (!document) return null;

  return (
    <div
      ref={viewportRef}
      className="embedded-nested-viewport"
      data-canvas-id={canvasId}
      data-depth={depth}
      data-parent-context={showContextField ? 'on' : 'off'}
      style={parentContextGridStyle(normalizedPaneLayout)}
    >
      <div className="nested-center-cell">
        <EngineCanvas
          canvasId={canvasId}
          model={document.model}
          theme={theme}
          mode="embedded-live"
          camera={cameraForCanvas(collection, canvasId)}
          selection={selectionForCanvas(collection, canvasId)}
          livePortalNodeIds={livePortalNodeIds}
          className="canvas-surface embedded-plane"
          ariaLabel={ariaLabel}
          onStatus={onStatus}
          onModelChange={onModelChange}
          onPortalLayout={(_, layouts) => setPortalLayouts(layouts)}
          onCanvasDoubleClick={(targetCanvasId) => onEnterCanvas(targetCanvasId)}
        />
        {portalBudget > 0 ? (
          <div className="portal-overlays" aria-label="Nested child canvas previews">
            {childLayouts.map((layout) => {
              if (!layout.childCanvasId || !collection.documents[layout.childCanvasId]) return null;
              return (
                <div key={`${canvasId}:${layout.portalNodeId}:${layout.childCanvasId}`} className="portal-overlay" style={portalOverlayStyle(layout)}>
                  <EmbeddedNestedViewport
                    canvasId={layout.childCanvasId}
                    collection={collection}
                    theme={theme}
                    ariaLabel={`${collection.documents[layout.childCanvasId].title} nested preview`}
                    depth={depth + 1}
                    remainingSlots={Math.max(0, portalBudget - childLayouts.length)}
                    onStatus={onStatus}
                    onModelChange={onModelChange}
                    onEnterCanvas={onEnterCanvas}
                    onSnippetModelChange={onSnippetModelChange}
                    onPaneLayoutChange={onPaneLayoutChange}
                  />
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
      {showContextField ? (
        <ParentContextField
          field={contextField}
          collection={collection}
          theme={theme}
          stageRect={stageRect}
          paneLayout={paneLayout}
          onPaneLayoutChange={setEmbeddedPaneLayout}
          paneLayoutConstraints={EMBEDDED_PARENT_CONTEXT_CONSTRAINTS}
          liveCanvasCapacity={contextCapacity}
          onStatus={onStatus}
          onModelChange={onModelChange}
          onEnterCanvas={onEnterCanvas}
          onSnippetModelChange={onSnippetModelChange}
          onChildPaneLayoutChange={onPaneLayoutChange}
          onActivate={(shape) => {
            if (shape.childCanvasId && collection.documents[shape.childCanvasId]) onEnterCanvas(shape.childCanvasId);
          }}
        />
      ) : null}
    </div>
  );
}

export type NodeAccessPanelProps = {
  collection: CanvasDocumentCollection;
  status: ViewportStatus;
  executeActiveCanvasCommand: (command: CanvasCommand) => boolean;
  executeDocumentCommand: (command: DocumentCommand) => void;
};

export function NodeAccessPanel({ collection, status, executeActiveCanvasCommand, executeDocumentCommand }: NodeAccessPanelProps) {
  const model = collection.documents[collection.activeCanvasId].model;
  return (
    <aside className="node-access-panel" aria-label="Canvas nodes">
      <div className="node-access-header">
        <span>Nodes</span>
        <span>{status.selectionCount ? `${status.selectionCount} selected` : 'No selection'}</span>
      </div>
      <div className="node-access-actions" aria-label="Node editing commands">
        <IconButton label="Move selection right" onClick={() => executeActiveCanvasCommand({ type: 'move-selection', dx: 32, dy: 0, source: 'nonvisual' })}>
          <MoveRight size={16} />
        </IconButton>
        <IconButton label="Resize primary selection wider" onClick={() => executeActiveCanvasCommand({ type: 'resize-primary', dw: 32, dh: 0, source: 'nonvisual' })}>
          <Maximize2 size={16} />
        </IconButton>
        <IconButton label="Copy selection" onClick={() => executeActiveCanvasCommand({ type: 'copy-selection', source: 'nonvisual' })}>
          <Copy size={16} />
        </IconButton>
        <IconButton label="Paste copied nodes" onClick={() => executeActiveCanvasCommand({ type: 'paste-clipboard', source: 'nonvisual' })}>
          <Clipboard size={16} />
        </IconButton>
        <IconButton label="Delete selection" onClick={() => executeActiveCanvasCommand({ type: 'delete-selection', source: 'nonvisual' })}>
          <Trash2 size={16} />
        </IconButton>
      </div>
      <ul className="node-access-list" aria-label="Canvas node list">
        {model.nodes.map((node) => {
          const selected = status.selectedNodeIds.includes(node.id);
          const primary = status.selectedNodeId === node.id;
          const description = describeNode(node);
          return (
            <li key={node.id} className="node-access-row">
              <button
                className="node-access-select"
                type="button"
                aria-pressed={selected}
                aria-label={`${selected ? 'Selected' : 'Select'} ${description.label}, ${description.roleDescription}, x ${Math.round(node.x)}, y ${Math.round(node.y)}, width ${Math.round(node.w)}, height ${Math.round(node.h)}`}
                onClick={() => executeActiveCanvasCommand({ type: 'select-node', nodeId: node.id, source: 'nonvisual' })}
              >
                <span>{description.label}</span>
                <span>{primary ? 'Primary' : selected ? 'Selected' : description.roleDescription}</span>
              </button>
              <button
                className="node-access-toggle"
                type="button"
                aria-label={`Toggle ${description.label} in selection`}
                aria-pressed={selected}
                onClick={() => executeActiveCanvasCommand({ type: 'select-node', nodeId: node.id, mode: 'toggle', source: 'nonvisual' })}
              >
                +
              </button>
              <span className="node-access-meta">
                {description.roleDescription} · x {Math.round(node.x)} · y {Math.round(node.y)} · {Math.round(node.w)}x{Math.round(node.h)}
              </span>
              <span className="node-access-detail">{description.details.join(' · ')}</span>
              {description.actions.map((action) => (
                <button
                  key={action.id}
                  className="node-action-button"
                  type="button"
                  disabled={!action.available}
                  onClick={() => executeDocumentCommand({ type: 'execute-node-action', canvasId: collection.activeCanvasId, nodeId: node.id, actionId: action.id, source: 'nonvisual' })}
                >
                  {action.label}
                </button>
              ))}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

export function WorkspaceStatusBar({
  collection,
  status,
  lastModelChange,
}: {
  collection: CanvasDocumentCollection;
  status: ViewportStatus;
  lastModelChange: DocumentModelChange | null;
}) {
  return (
    <div className="statusbar" role="status" aria-live="polite">
      <span>
        {status.selectionCount > 1
          ? `${status.selectionCount} selected`
          : status.selectedNodeId
            ? `Selected ${status.selectedNodeId}`
            : 'No selection'}
      </span>
      <span>{status.cursorWorld ? `x ${Math.round(status.cursorWorld.x)} · y ${Math.round(status.cursorWorld.y)}` : 'Move over canvas'}</span>
      <span>Drawn {status.renderedNodes}/{status.totalNodes}</span>
      <span>{status.interaction}</span>
      <span>{lastModelChange ? `${lastModelChange.kind} ${lastModelChange.source}` : `Canvas ${collection.activeCanvasId}`}</span>
    </div>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button className="icon-button" type="button" aria-label={label} title={label} onClick={onClick}>
      {children}
    </button>
  );
}

function ParentContextField({
  field,
  collection,
  theme,
  stageRect,
  paneLayout,
  onPaneLayoutChange,
  liveCanvasCapacity,
  onStatus,
  onModelChange,
  onEnterCanvas,
  onSnippetModelChange,
  onActivate,
  onChildPaneLayoutChange,
  paneLayoutConstraints = {},
}: {
  field: ReturnType<typeof buildParentContextField>;
  collection: CanvasDocumentCollection;
  theme: ThemeName;
  stageRect: DOMRect;
  paneLayout: ParentContextPaneLayout;
  onPaneLayoutChange: Dispatch<SetStateAction<ParentContextPaneLayout>>;
  paneLayoutConstraints?: ParentContextPaneLayoutConstraints;
  liveCanvasCapacity: number;
  onStatus: (canvasId: CanvasDocumentId, status: ViewportStatus, engine: CanvasEngine) => void;
  onModelChange: (canvasId: CanvasDocumentId, model: CanvasModel) => void;
  onEnterCanvas: (canvasId: CanvasDocumentId) => boolean;
  onSnippetModelChange: (shape: ParentContextFieldShape, model: CanvasModel) => void;
  onActivate: (shape: ParentContextFieldShape) => void;
  onChildPaneLayoutChange: (canvasId: CanvasDocumentId, paneLayout: ParentContextPaneLayout) => void;
}) {
  if (!field.shapes.length) return null;
  const normalizedPaneLayout = normalizeParentContextPaneLayout(stageRect, paneLayout, paneLayoutConstraints);
  const liveCanvasShapes = field.shapes
    .sort((a, b) => b.detail - a.detail)
    .slice(0, liveCanvasCapacity);
  const liveCanvasShapeIds = new Set(liveCanvasShapes.map((shape) => shape.node.id));
  return (
    <div className="parent-context-layer" aria-label="Parent context field">
      <div className="parent-context-canvas-layer" style={parentContextGridStyle(normalizedPaneLayout)}>
        {liveCanvasShapes.map((shape) => {
          const contextCanvas = parentContextCanvasForShape(collection, shape);
          return (
            <div
              key={`context-canvas:${shape.node.id}:${contextCanvas.canvasId}`}
              className="parent-context-canvas-clip"
              data-node-id={shape.node.id}
              data-region={shape.region}
              data-child-canvas-id={shape.childCanvasId ?? ''}
              data-context-model={contextCanvas.kind}
              style={parentContextCanvasStyle(shape)}
            >
              {contextCanvas.kind === 'child' ? (
                <EmbeddedNestedViewport
                  canvasId={contextCanvas.canvasId}
                  collection={collection}
                  theme={theme}
                  ariaLabel={contextCanvas.ariaLabel}
                  depth={1}
                  remainingSlots={Math.max(0, MAX_TOTAL_ENGINES - 1 - liveCanvasShapes.length)}
                  onStatus={onStatus}
                  onModelChange={onModelChange}
                  onEnterCanvas={onEnterCanvas}
                  onSnippetModelChange={onSnippetModelChange}
                  onPaneLayoutChange={onChildPaneLayoutChange}
                />
              ) : (
                <EngineCanvas
                  canvasId={contextCanvas.canvasId}
                  model={contextCanvas.model}
                  theme={theme}
                  mode="embedded-live"
                  className="canvas-surface parent-context-canvas"
                  ariaLabel={contextCanvas.ariaLabel}
                  onModelChange={(_, model) => onSnippetModelChange(shape, model)}
                  onCanvasDoubleClick={() => {
                    onActivate(shape);
                    return true;
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
      <ParentContextResizers
        stageRect={stageRect}
        paneLayout={normalizedPaneLayout}
        paneLayoutConstraints={paneLayoutConstraints}
        onPaneLayoutChange={onPaneLayoutChange}
      />
      <svg className="parent-context-field" viewBox={`0 0 ${stageRect.width} ${stageRect.height}`} role="group">
        {field.shapes.map((shape) => {
          const description = describeNode(shape.node);
          const hasLiveCanvas = liveCanvasShapeIds.has(shape.node.id);
          return (
            <g
              key={`${shape.region}:${shape.node.id}`}
              className="parent-context-shape-hit"
              role="button"
              tabIndex={0}
              aria-label={`${parentContextRegionLabel(shape.region)} ${description.label}`}
              data-region={shape.region}
              data-node-id={shape.node.id}
              data-portal={shape.portal ? 'true' : 'false'}
              data-live-canvas={hasLiveCanvas ? 'true' : 'false'}
              onClick={() => onActivate(shape)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') onActivate(shape);
              }}
            >
              <rect
                className={shape.portal ? 'parent-context-shape portal' : 'parent-context-shape'}
                x={shape.projectedRect.x}
                y={shape.projectedRect.y}
                width={shape.projectedRect.w}
                height={shape.projectedRect.h}
                rx={0}
                opacity={hasLiveCanvas ? 0.1 : shape.opacity}
              />
              {shape.portal && !hasLiveCanvas ? (
                <rect
                  className="parent-context-aperture"
                  x={shape.projectedRect.x + shape.projectedRect.w * 0.18}
                  y={shape.projectedRect.y + shape.projectedRect.h * 0.26}
                  width={shape.projectedRect.w * 0.64}
                  height={shape.projectedRect.h * 0.42}
                  rx={Math.max(1, shape.detail * 5)}
                  opacity={0.28 + shape.detail * 0.38}
                />
              ) : null}
              <rect
                className="parent-context-hit-rect"
                x={shape.projectedRect.x - 8}
                y={shape.projectedRect.y - 8}
                width={shape.projectedRect.w + 16}
                height={shape.projectedRect.h + 16}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

type ParentContextResizeHandle = 'left' | 'right' | 'top' | 'bottom' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

function ParentContextResizers({
  stageRect,
  paneLayout,
  paneLayoutConstraints,
  onPaneLayoutChange,
}: {
  stageRect: DOMRect;
  paneLayout: ParentContextPaneLayout;
  paneLayoutConstraints: ParentContextPaneLayoutConstraints;
  onPaneLayoutChange: Dispatch<SetStateAction<ParentContextPaneLayout>>;
}) {
  const dragRef = useRef<{ handle: ParentContextResizeHandle; startX: number; startY: number; startLayout: ParentContextPaneLayout } | null>(null);
  const width = Math.max(1, stageRect.width);
  const height = Math.max(1, stageRect.height);
  const centerW = Math.max(1, width - paneLayout.left - paneLayout.right);
  const centerH = Math.max(1, height - paneLayout.top - paneLayout.bottom);
  const rightX = width - paneLayout.right;
  const bottomY = height - paneLayout.bottom;

  const startResize = (handle: ParentContextResizeHandle, event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic probe events may not have an active pointer.
    }
    dragRef.current = { handle, startX: event.clientX, startY: event.clientY, startLayout: paneLayout };
  };

  const updateResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    event.preventDefault();
    event.stopPropagation();
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    const next = { ...drag.startLayout };
    if (drag.handle === 'left' || drag.handle === 'top-left' || drag.handle === 'bottom-left') next.left = drag.startLayout.left + dx;
    if (drag.handle === 'right' || drag.handle === 'top-right' || drag.handle === 'bottom-right') next.right = drag.startLayout.right - dx;
    if (drag.handle === 'top' || drag.handle === 'top-left' || drag.handle === 'top-right') next.top = drag.startLayout.top + dy;
    if (drag.handle === 'bottom' || drag.handle === 'bottom-left' || drag.handle === 'bottom-right') next.bottom = drag.startLayout.bottom - dy;
    onPaneLayoutChange(normalizeParentContextPaneLayout(stageRect, next, paneLayoutConstraints));
  };

  const stopResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!dragRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = null;
  };

  const handleProps = (handle: ParentContextResizeHandle, label: string, style: CSSProperties) => ({
    className: `parent-context-resizer ${handle.includes('-') ? 'corner' : handle === 'left' || handle === 'right' ? 'vertical' : 'horizontal'}`,
    type: 'button' as const,
    'aria-label': label,
    'data-resize-handle': handle,
    style,
    onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => startResize(handle, event),
    onPointerMove: updateResize,
    onPointerUp: stopResize,
    onPointerCancel: stopResize,
  });

  return (
    <div className="parent-context-resizers" aria-label="Resize parent context panes">
      <button {...handleProps('left', 'Resize west panes', { left: paneLayout.left - 3, top: paneLayout.top, width: 6, height: centerH })} />
      <button {...handleProps('right', 'Resize east panes', { left: rightX - 3, top: paneLayout.top, width: 6, height: centerH })} />
      <button {...handleProps('top', 'Resize north panes', { left: paneLayout.left, top: paneLayout.top - 3, width: centerW, height: 6 })} />
      <button {...handleProps('bottom', 'Resize south panes', { left: paneLayout.left, top: bottomY - 3, width: centerW, height: 6 })} />
      <button {...handleProps('top-left', 'Resize northwest intersection', { left: paneLayout.left - 7, top: paneLayout.top - 7 })} />
      <button {...handleProps('top-right', 'Resize northeast intersection', { left: rightX - 7, top: paneLayout.top - 7 })} />
      <button {...handleProps('bottom-left', 'Resize southwest intersection', { left: paneLayout.left - 7, top: bottomY - 7 })} />
      <button {...handleProps('bottom-right', 'Resize southeast intersection', { left: rightX - 7, top: bottomY - 7 })} />
    </div>
  );
}

function parentContextCanvasForShape(
  collection: CanvasDocumentCollection,
  shape: ParentContextFieldShape,
): { canvasId: CanvasDocumentId; model: CanvasModel; ariaLabel: string; kind: 'child' | 'snippet' } {
  if (shape.childCanvasId) {
    const child = collection.documents[shape.childCanvasId];
    if (child) {
      return {
        canvasId: child.id,
        model: child.model,
        ariaLabel: `${child.title} parent context preview`,
        kind: 'child',
      };
    }
  }

  const description = describeNode(shape.node);
  return {
    canvasId: `${shape.parentCanvasId}:${shape.node.id}:context-snippet`,
    model: {
      schemaVersion: 2,
      nodes: [shape.node],
    },
    ariaLabel: `${description.label} parent context preview`,
    kind: 'snippet',
  };
}

function parentContextGridStyle(paneLayout: ParentContextPaneLayout): CSSProperties {
  return {
    gridTemplateColumns: `${paneLayout.left}px minmax(0, 1fr) ${paneLayout.right}px`,
    gridTemplateRows: `${paneLayout.top}px minmax(0, 1fr) ${paneLayout.bottom}px`,
  };
}

function parentContextCanvasStyle(shape: ParentContextFieldShape): CSSProperties {
  const gridPlacement = gridPlacementForRegion(shape.region);
  return {
    ...gridPlacement,
    opacity: 0.55 + shape.detail * 0.38,
  };
}

function gridPlacementForRegion(region: ParentContextFieldShape['region']): CSSProperties {
  if (region === 'top-left') return { gridColumn: '1', gridRow: '1' };
  if (region === 'top') return { gridColumn: '2', gridRow: '1' };
  if (region === 'top-right') return { gridColumn: '3', gridRow: '1' };
  if (region === 'left') return { gridColumn: '1', gridRow: '2' };
  if (region === 'right') return { gridColumn: '3', gridRow: '2' };
  if (region === 'bottom-left') return { gridColumn: '1', gridRow: '3' };
  if (region === 'bottom') return { gridColumn: '2', gridRow: '3' };
  return { gridColumn: '3', gridRow: '3' };
}

function dormantAncestorFrames(collection: CanvasDocumentCollection) {
  const activeIndex = collection.view.stackPath.findIndex((frame) => frame.canvasId === collection.activeCanvasId);
  if (activeIndex <= 2) return [];
  return collection.view.stackPath.slice(0, activeIndex - 2);
}
