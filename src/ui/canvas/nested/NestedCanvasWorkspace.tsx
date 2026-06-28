import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import { cloneDocumentCollection } from '../../../domain/documentModel';
import { type CanvasCommand, type CanvasModelChange, type ScreenRect, type ThemeName, type ViewportStatus } from '../../../domain/types';
import type {
  CanvasDocumentCollection,
  CanvasWorkspaceSnapshot,
  DocumentCommand,
  DocumentModelChange,
} from '../../../domain/documentTypes';
import { createWorkspaceHistory, createWorkspaceSnapshot } from '../../../domain/workspaceHistory';
import type { WorkspaceUrlState } from '../../../infra/browser/workspaceUrlLocation';
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
  onArrangeCanvasMenuRequest?: (request: ArrangeCanvasMenuRequest) => void;
};

export type ArrangeCanvasMenuRequest = {
  canvasId: string;
  anchor?: ScreenRect;
  recursive?: boolean;
};

export type NestedCanvasWorkspaceChromeState = {
  collection: CanvasDocumentCollection;
  status: ViewportStatus;
  lastModelChange: DocumentModelChange | null;
  lastCanvasModelChange: CanvasModelChange | null;
  lastCanvasModelChangeId: number;
  canUndo: boolean;
  canRedo: boolean;
  storageReady: boolean;
};

export type NestedCanvasWorkspaceHandle = {
  fitActiveCanvas(): void;
  refreshActiveCanvas(): void;
  resetActiveZoom(): void;
  zoomActiveBy(factor: number): void;
  undoWorkspace(): boolean;
  redoWorkspace(): boolean;
  executeActiveCanvasCommand(command: CanvasCommand): boolean;
  executeDocumentCommand(command: DocumentCommand): boolean;
  collection(): CanvasDocumentCollection;
  openWorkspaceUrlState(state: WorkspaceUrlState): boolean;
  currentWorkspaceUrlState(documentId: string | null): WorkspaceUrlState | null;
  getWorkspaceSnapshot(): CanvasWorkspaceSnapshot;
  loadWorkspaceSnapshot(snapshot: CanvasWorkspaceSnapshot, interaction?: string): void;
  replaceWorkspaceSnapshot(snapshot: CanvasWorkspaceSnapshot, options?: { storageKey?: string; interaction?: string; persist?: boolean }): void;
  setStorageKey(storageKey: string): void;
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
    onArrangeCanvasMenuRequest,
  },
  ref,
) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<NativeNestedCanvasController | null>(null);
  const callbacksRef = useRef({ onCollectionChange, onChromeStateChange, onArrangeCanvasMenuRequest });
  const initialCollectionRef = useRef(initialCollection);

  useEffect(() => {
    callbacksRef.current = { onCollectionChange, onChromeStateChange, onArrangeCanvasMenuRequest };
  }, [onCollectionChange, onChromeStateChange, onArrangeCanvasMenuRequest]);

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
      onArrangeCanvasMenuRequest: (request) => callbacksRef.current.onArrangeCanvasMenuRequest?.(request),
    });
    controllerRef.current = controller;
    return () => {
      controller.dispose();
      controllerRef.current = null;
    };
  }, [fitOnFirstLoad]);

  useEffect(() => {
    if (storageKey) controllerRef.current?.setStorageKey(storageKey);
  }, [storageKey]);

  useEffect(() => {
    controllerRef.current?.setTheme(theme);
  }, [theme]);

  useEffect(() => {
    controllerRef.current?.setParentContextVisible(parentContextVisible);
  }, [parentContextVisible]);

  useImperativeHandle(ref, () => ({
    fitActiveCanvas: () => controllerRef.current?.fitActiveCanvas(),
    refreshActiveCanvas: () => controllerRef.current?.refreshActiveCanvas(),
    resetActiveZoom: () => controllerRef.current?.resetActiveZoom(),
    zoomActiveBy: (factor: number) => controllerRef.current?.zoomActiveBy(factor),
    undoWorkspace: () => controllerRef.current?.undoWorkspace() ?? false,
    redoWorkspace: () => controllerRef.current?.redoWorkspace() ?? false,
    executeActiveCanvasCommand: (command: CanvasCommand) => controllerRef.current?.executeActiveCanvasCommand(command) ?? false,
    executeDocumentCommand: (command: DocumentCommand) => controllerRef.current?.executeDocumentCommand(command) ?? false,
    collection: () => controllerRef.current?.collection() ?? cloneDocumentCollection(initialCollection),
    openWorkspaceUrlState: (state: WorkspaceUrlState) => controllerRef.current?.openWorkspaceUrlState(state) ?? false,
    currentWorkspaceUrlState: (documentId: string | null) => controllerRef.current?.currentWorkspaceUrlState(documentId) ?? null,
    getWorkspaceSnapshot: () => controllerRef.current?.getWorkspaceSnapshot() ?? createWorkspaceSnapshot(createWorkspaceHistory(initialCollection), null),
    loadWorkspaceSnapshot: (snapshot: CanvasWorkspaceSnapshot, interaction?: string) => controllerRef.current?.loadWorkspaceSnapshot(snapshot, interaction),
    replaceWorkspaceSnapshot: (snapshot: CanvasWorkspaceSnapshot, options?: { storageKey?: string; interaction?: string; persist?: boolean }) => controllerRef.current?.replaceWorkspaceSnapshot(snapshot, options),
    setStorageKey: (nextStorageKey: string) => controllerRef.current?.setStorageKey(nextStorageKey),
    flushWorkspaceSnapshot: () => controllerRef.current?.flushWorkspaceSnapshot() ?? Promise.resolve(),
  }), [initialCollection]);

  return <div ref={hostRef} className="nested-workspace" aria-label="Workspace map" />;
});
