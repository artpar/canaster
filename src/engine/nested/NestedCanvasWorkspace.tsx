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
} from 'react';
import { CanvasEngine } from '../CanvasEngine';
import {
  cameraForCanvas,
  cloneDocumentCollection,
  selectNodeInCanvas,
  setCameraForCanvas,
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
  DocumentCommand,
  DocumentModelChange,
  ParentContextFieldShape,
} from '../documentTypes';
import { ACTIVE_ENGINE_FRAME_BUDGET_MS, livePortalSlotsFor, MAX_LIVE_PORTAL_PREVIEWS, MAX_TOTAL_ENGINES } from './engineSlots';
import { buildParentContextField, parentContextRegionLabel } from './parentContextField';
import { portalActivationOverlayStyle, portalOverlayStyle } from './portalLayout';
import { activePlaneStyle, stackPlaneStyle, visibleStackFrames } from './stackLayout';

export type NestedCanvasWorkspaceProps = {
  initialCollection: CanvasDocumentCollection;
  theme: ThemeName;
  nodesOpen?: boolean;
  animationEnabled?: boolean;
  onCollectionChange?: (collection: CanvasDocumentCollection, changes: DocumentModelChange[]) => void;
};

export type NestedCanvasWorkspaceHandle = {
  fitActiveCanvas(): void;
  resetActiveZoom(): void;
  zoomActiveBy(factor: number): void;
  executeActiveCanvasCommand(command: CanvasCommand): boolean;
  executeDocumentCommand(command: DocumentCommand): void;
  collection(): CanvasDocumentCollection;
};

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

export const NestedCanvasWorkspace = forwardRef<NestedCanvasWorkspaceHandle, NestedCanvasWorkspaceProps>(function NestedCanvasWorkspace(
  { initialCollection, theme, nodesOpen = false, animationEnabled = true, onCollectionChange },
  ref,
) {
  const [collection, setCollection] = useState(() => {
    const next = cloneDocumentCollection(initialCollection);
    next.view.animationEnabled = animationEnabled;
    return next;
  });
  const collectionRef = useRef(collection);
  const activeEngineRef = useRef<CanvasEngine | null>(null);
  const [status, setStatus] = useState<ViewportStatus>(initialStatus);
  const [lastModelChange, setLastModelChange] = useState<DocumentModelChange | null>(null);
  const [portalLayouts, setPortalLayouts] = useState<PortalLayout[]>([]);
  const [previewCapacity, setPreviewCapacity] = useState(MAX_LIVE_PORTAL_PREVIEWS);
  const activeFrameOverBudgetCount = useRef(0);
  const [stageRect, setStageRect] = useState<DOMRect>(() => new DOMRect(0, 0, 1, 1));
  const stageRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    collectionRef.current = collection;
    exposeDebugApi();
  }, [collection]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const update = () => setStageRect(stage.getBoundingClientRect());
    update();
    const observer = new ResizeObserver(update);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  const liveLayouts = useMemo(() => livePortalSlotsFor(collection, portalLayouts).slice(0, previewCapacity), [collection, portalLayouts, previewCapacity]);
  const livePortalNodeIds = useMemo(() => new Set(liveLayouts.map((layout) => layout.portalNodeId)), [liveLayouts]);
  const activeDocument = collection.documents[collection.activeCanvasId];
  const parentContext = useMemo(() => buildParentContextField(collection, stageRect), [collection, stageRect]);
  const visibleContextFrames = useMemo(() => visibleStackFrames(collection), [collection]);
  const parentContextCanvasCapacity = Math.max(0, MAX_TOTAL_ENGINES - 1 - visibleContextFrames.length - liveLayouts.length);

  useEffect(() => {
    activeEngineRef.current?.setLivePortalNodeIds(livePortalNodeIds);
  }, [livePortalNodeIds]);

  const commitCollection = useCallback((next: CanvasDocumentCollection, changes: DocumentModelChange[]) => {
    collectionRef.current = next;
    setCollection(next);
    if (changes.length) setLastModelChange(changes[changes.length - 1]);
    onCollectionChange?.(next, changes);
  }, [onCollectionChange]);

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
    executeActiveCanvasCommand,
    executeDocumentCommand,
    collection: () => cloneDocumentCollection(collectionRef.current),
  }), [executeActiveCanvasCommand, executeDocumentCommand]);

  const handleActiveStatus = useCallback((canvasId: CanvasDocumentId, nextStatus: ViewportStatus) => {
    if (collectionRef.current.activeCanvasId !== canvasId) return;
    setStatus(nextStatus);
    const engine = activeEngineRef.current;
    if (!engine) return;
    const base = collectionRef.current;
    const withCamera = setCameraForCanvas(base, base.activeCanvasId, engine.getCamera());
    const withSelection = setSelectionForCanvas(withCamera, base.activeCanvasId, engine.getSelectionState());
    collectionRef.current = withSelection;
    setCollection(withSelection);
  }, []);

  const handleActiveModelChange = useCallback((canvasId: CanvasDocumentId, model: CanvasModel) => {
    const base = collectionRef.current;
    if (base.activeCanvasId !== canvasId) return;
    const next = updateCanvasModel(base, base.activeCanvasId, model);
    commitCollection(next, []);
  }, [commitCollection, activeDocument.model]);

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
      executeDocumentCommand,
      executeActiveCanvasCommand,
      replaceCollection: (next: CanvasDocumentCollection) => commitCollection(cloneDocumentCollection(next), []),
      activeCanvasId: () => collectionRef.current.activeCanvasId,
      engineCount: () => document.querySelectorAll('canvas[data-engine-mode]').length,
    };
  }

  if (!activeDocument) return null;

  return (
    <section className="nested-workspace" aria-label="Nested canvas workspace" data-active-canvas-id={collection.activeCanvasId} onKeyDownCapture={handleWorkspaceKeyDownCapture}>
      <div ref={stageRef} className="nested-stage" data-animation={collection.view.animationEnabled ? 'on' : 'off'}>
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
                style={stackPlaneStyle({ ...frame, depth: index }, stageRect)}
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
          style={activePlaneStyle(stageRect)}
        />

        <div className="portal-overlays" aria-label="Live child canvas previews">
          {liveLayouts.map((layout) => {
            const childCanvasId = layout.childCanvasId;
            if (!childCanvasId) return null;
            const child = collection.documents[childCanvasId];
            if (!child) return null;
            return (
              <div key={`${layout.portalNodeId}:${childCanvasId}`} className="portal-overlay" style={portalOverlayStyle(layout)}>
                <EngineCanvas
                  canvasId={childCanvasId}
                  model={child.model}
                  theme={theme}
                  mode="preview-live"
                  className="canvas-surface portal-preview-canvas"
                  ariaLabel={`${child.title} live preview`}
                />
                <button
                  className="portal-activation"
                  type="button"
                  style={portalActivationOverlayStyle(layout)}
                  aria-label={`Open ${child.title}`}
                  onClick={() => executeDocumentCommand({ type: 'focus-portal-preview', parentCanvasId: collection.activeCanvasId, portalNodeId: layout.portalNodeId, source: 'pointer' })}
                  onDoubleClick={() => executeDocumentCommand({ type: 'enter-child-canvas', parentCanvasId: collection.activeCanvasId, portalNodeId: layout.portalNodeId, source: 'pointer' })}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') executeDocumentCommand({ type: 'enter-child-canvas', parentCanvasId: collection.activeCanvasId, portalNodeId: layout.portalNodeId, source: 'keyboard' });
                  }}
                />
              </div>
            );
          })}
        </div>

        <ParentContextField
          field={parentContext}
          collection={collection}
          theme={theme}
          stageRect={stageRect}
          liveCanvasCapacity={parentContextCanvasCapacity}
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

      {nodesOpen ? (
        <NodeAccessPanel
          collection={collection}
          status={status}
          executeActiveCanvasCommand={executeActiveCanvasCommand}
          executeDocumentCommand={executeDocumentCommand}
        />
      ) : null}

      <div className="statusbar" role="status" aria-live="polite">
        <span>
          {status.selectionCount > 1
            ? `${status.selectionCount} selected`
            : status.selectedNodeId
              ? `Selected ${status.selectedNodeId}`
              : 'No selection'}
        </span>
        <span>
          {status.cursorWorld ? `x ${Math.round(status.cursorWorld.x)} · y ${Math.round(status.cursorWorld.y)}` : 'Move over canvas'}
        </span>
        <span>Drawn {status.renderedNodes}/{status.totalNodes}</span>
        <span>{status.interaction}</span>
        <span>{lastModelChange ? `${lastModelChange.kind} ${lastModelChange.source}` : `Canvas ${collection.activeCanvasId}`}</span>
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
    engine.fit();
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
  mode: 'preview-live' | 'context-live';
  camera?: Camera;
  className: string;
  ariaLabel: string;
};

function EngineCanvas({ canvasId, model, theme, mode, camera, className, ariaLabel }: EngineCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<CanvasEngine | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = new CanvasEngine(canvasRef.current, { canvasId, interactionMode: mode });
    engine.setModel(model);
    engine.setTheme(theme);
    if (camera) engine.setCamera(camera);
    else engine.fit(24);
    engineRef.current = engine;
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, [canvasId, mode]);

  useEffect(() => {
    engineRef.current?.setModel(model, { preserveInteraction: true });
    engineRef.current?.setTheme(theme);
  }, [model, theme]);

  useEffect(() => {
    if (camera) engineRef.current?.setCamera(camera);
  }, [camera]);

  return <canvas ref={canvasRef} className={className} aria-label={ariaLabel} data-engine-mode={mode} />;
}

type NodeAccessPanelProps = {
  collection: CanvasDocumentCollection;
  status: ViewportStatus;
  executeActiveCanvasCommand: (command: CanvasCommand) => boolean;
  executeDocumentCommand: (command: DocumentCommand) => void;
};

function NodeAccessPanel({ collection, status, executeActiveCanvasCommand, executeDocumentCommand }: NodeAccessPanelProps) {
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
  liveCanvasCapacity,
  onActivate,
}: {
  field: ReturnType<typeof buildParentContextField>;
  collection: CanvasDocumentCollection;
  theme: ThemeName;
  stageRect: DOMRect;
  liveCanvasCapacity: number;
  onActivate: (shape: ParentContextFieldShape) => void;
}) {
  if (!field.shapes.length) return null;
  const liveCanvasShapes = field.shapes
    .sort((a, b) => b.detail - a.detail)
    .slice(0, liveCanvasCapacity);
  const liveCanvasShapeIds = new Set(liveCanvasShapes.map((shape) => shape.node.id));
  return (
    <div className="parent-context-layer" aria-label="Parent context field">
      <div className="parent-context-canvas-layer" aria-hidden="true">
        {liveCanvasShapes.map((shape) => {
          const contextCanvas = parentContextCanvasForShape(collection, shape);
          return (
            <div
              key={`context-canvas:${shape.node.id}:${contextCanvas.canvasId}`}
              className="parent-context-canvas-clip"
              data-node-id={shape.node.id}
              data-child-canvas-id={shape.childCanvasId ?? ''}
              data-context-model={contextCanvas.kind}
              style={parentContextCanvasStyle(shape)}
            >
              <EngineCanvas
                canvasId={contextCanvas.canvasId}
                model={contextCanvas.model}
                theme={theme}
                mode="preview-live"
                className="canvas-surface parent-context-canvas"
                ariaLabel={contextCanvas.ariaLabel}
              />
            </div>
          );
        })}
      </div>
      <svg className="parent-context-field" viewBox={`0 0 ${stageRect.width} ${stageRect.height}`} role="group">
        <defs>
          <linearGradient id="parent-context-edge-v" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity="0.28" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0.04" />
          </linearGradient>
        </defs>
        <rect className="parent-context-vignette top" x="0" y="0" width={stageRect.width} height="118" />
        <rect className="parent-context-vignette bottom" x="0" y={Math.max(0, stageRect.height - 118)} width={stageRect.width} height="118" />
        <rect className="parent-context-vignette left" x="0" y="0" width="118" height={stageRect.height} />
        <rect className="parent-context-vignette right" x={Math.max(0, stageRect.width - 118)} y="0" width="118" height={stageRect.height} />
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
                rx={Math.max(1, Math.min(4, 1 + shape.detail * 3))}
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

function parentContextCanvasStyle(shape: ParentContextFieldShape): CSSProperties {
  return {
    left: shape.projectedRect.x,
    top: shape.projectedRect.y,
    width: shape.projectedRect.w,
    height: shape.projectedRect.h,
    opacity: 0.55 + shape.detail * 0.38,
  };
}

function dormantAncestorFrames(collection: CanvasDocumentCollection) {
  const activeIndex = collection.view.stackPath.findIndex((frame) => frame.canvasId === collection.activeCanvasId);
  if (activeIndex <= 2) return [];
  return collection.view.stackPath.slice(0, activeIndex - 2);
}
