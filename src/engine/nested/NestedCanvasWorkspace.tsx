import { Clipboard, Copy, Maximize2, MoveRight, Trash2 } from 'lucide-react';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import { cloneDocumentCollection } from '../documentModel';
import { describeNode } from '../nodeTypes/registry';
import type { CanvasCommand, ThemeName, ViewportStatus } from '../types';
import type {
  CanvasDocumentCollection,
  CanvasWorkspaceSnapshot,
  DocumentCommand,
  DocumentModelChange,
} from '../documentTypes';
import { createWorkspaceHistory, createWorkspaceSnapshot } from '../workspaceHistory';
import { NativeNestedCanvasController } from './NativeNestedCanvasController';

export type NestedCanvasWorkspaceProps = {
  initialCollection: CanvasDocumentCollection;
  theme: ThemeName;
  parentContextVisible?: boolean;
  animationEnabled?: boolean;
  fitOnFirstLoad?: boolean;
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
  getWorkspaceSnapshot(): CanvasWorkspaceSnapshot;
  loadWorkspaceSnapshot(snapshot: CanvasWorkspaceSnapshot, interaction?: string): void;
  flushWorkspaceSnapshot(): Promise<void>;
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

export const NestedCanvasWorkspace = forwardRef<NestedCanvasWorkspaceHandle, NestedCanvasWorkspaceProps>(function NestedCanvasWorkspace(
  {
    initialCollection,
    theme,
    parentContextVisible = true,
    fitOnFirstLoad = true,
    storageKey,
    onCollectionChange,
    onChromeStateChange,
  },
  ref,
) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<NativeNestedCanvasController | null>(null);
  const callbacksRef = useRef({ onCollectionChange, onChromeStateChange });
  const initialCollectionRef = useRef(initialCollection);

  useEffect(() => {
    callbacksRef.current = { onCollectionChange, onChromeStateChange };
  }, [onCollectionChange, onChromeStateChange]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const controller = new NativeNestedCanvasController({
      root: host,
      initialCollection: initialCollectionRef.current,
      theme,
      parentContextVisible,
      fitOnFirstLoad,
      storageKey,
      onCollectionChange: (collection, changes) => callbacksRef.current.onCollectionChange?.(collection, changes),
      onChromeStateChange: (state) => callbacksRef.current.onChromeStateChange?.(state),
    });
    controllerRef.current = controller;
    return () => {
      controller.dispose();
      controllerRef.current = null;
    };
  }, [fitOnFirstLoad, storageKey]);

  useEffect(() => {
    controllerRef.current?.setTheme(theme);
  }, [theme]);

  useEffect(() => {
    controllerRef.current?.setParentContextVisible(parentContextVisible);
  }, [parentContextVisible]);

  useImperativeHandle(ref, () => ({
    fitActiveCanvas: () => controllerRef.current?.fitActiveCanvas(),
    resetActiveZoom: () => controllerRef.current?.resetActiveZoom(),
    zoomActiveBy: (factor: number) => controllerRef.current?.zoomActiveBy(factor),
    undoWorkspace: () => controllerRef.current?.undoWorkspace() ?? false,
    redoWorkspace: () => controllerRef.current?.redoWorkspace() ?? false,
    executeActiveCanvasCommand: (command: CanvasCommand) => controllerRef.current?.executeActiveCanvasCommand(command) ?? false,
    executeDocumentCommand: (command: DocumentCommand) => controllerRef.current?.executeDocumentCommand(command),
    collection: () => controllerRef.current?.collection() ?? cloneDocumentCollection(initialCollection),
    getWorkspaceSnapshot: () => controllerRef.current?.getWorkspaceSnapshot() ?? createWorkspaceSnapshot(createWorkspaceHistory(initialCollection), null),
    loadWorkspaceSnapshot: (snapshot: CanvasWorkspaceSnapshot, interaction?: string) => controllerRef.current?.loadWorkspaceSnapshot(snapshot, interaction),
    flushWorkspaceSnapshot: () => controllerRef.current?.flushWorkspaceSnapshot() ?? Promise.resolve(),
  }), [initialCollection]);

  return <div ref={hostRef} className="nested-workspace" aria-label="Workspace map" />;
});

export type NodeAccessPanelProps = {
  collection: CanvasDocumentCollection;
  status: ViewportStatus;
  executeActiveCanvasCommand: (command: CanvasCommand) => boolean;
  executeDocumentCommand: (command: DocumentCommand) => void;
};

export function NodeAccessPanel({ collection, status, executeActiveCanvasCommand, executeDocumentCommand }: NodeAccessPanelProps) {
  const model = collection.documents[collection.activeCanvasId].model;
  return (
    <aside className="node-access-panel" aria-label="Work items in this view">
      <div className="node-access-header">
        <span>Work items</span>
        <span>{status.selectionCount ? `${status.selectionCount} selected` : 'Choose an item'}</span>
      </div>
      <div className="node-access-actions" aria-label="Work item editing commands">
        <IconButton label="Move selected item right" onClick={() => executeActiveCanvasCommand({ type: 'move-selection', dx: 32, dy: 0, source: 'nonvisual' })}>
          <MoveRight size={16} />
        </IconButton>
        <IconButton label="Make selected item wider" onClick={() => executeActiveCanvasCommand({ type: 'resize-primary', dw: 32, dh: 0, source: 'nonvisual' })}>
          <Maximize2 size={16} />
        </IconButton>
        <IconButton label="Copy selected item" onClick={() => executeActiveCanvasCommand({ type: 'copy-selection', source: 'nonvisual' })}>
          <Copy size={16} />
        </IconButton>
        <IconButton label="Paste copied item" onClick={() => executeActiveCanvasCommand({ type: 'paste-clipboard', source: 'nonvisual' })}>
          <Clipboard size={16} />
        </IconButton>
        <IconButton label="Delete selected item" onClick={() => executeActiveCanvasCommand({ type: 'delete-selection', source: 'nonvisual' })}>
          <Trash2 size={16} />
        </IconButton>
      </div>
      <ul className="node-access-list" aria-label="Work items in this view">
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
                aria-label={`${selected ? 'Selected' : 'Select'} ${description.label}, ${description.roleDescription}`}
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
                {description.roleDescription}
              </span>
              {description.details.length ? <span className="node-access-detail">{description.details.join(' · ')}</span> : null}
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
