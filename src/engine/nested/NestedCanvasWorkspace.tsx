import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import { cloneDocumentCollection } from '../documentModel';
import { type CanvasCommand, type CanvasModelChange, type ThemeName, type ViewportStatus } from '../types';
import type {
  CanvasDocumentCollection,
  CanvasWorkspaceSnapshot,
  DocumentCommand,
  DocumentModelChange,
} from '../documentTypes';
import { createWorkspaceHistory, createWorkspaceSnapshot } from '../workspaceHistory';
import type { WorkspaceUrlState } from '../workspaceUrlLocation';
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
  executeDocumentCommand(command: DocumentCommand): void;
  collection(): CanvasDocumentCollection;
  openWorkspaceUrlState(state: WorkspaceUrlState): boolean;
  currentWorkspaceUrlState(documentId: string | null): WorkspaceUrlState | null;
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
    refreshActiveCanvas: () => controllerRef.current?.refreshActiveCanvas(),
    resetActiveZoom: () => controllerRef.current?.resetActiveZoom(),
    zoomActiveBy: (factor: number) => controllerRef.current?.zoomActiveBy(factor),
    undoWorkspace: () => controllerRef.current?.undoWorkspace() ?? false,
    redoWorkspace: () => controllerRef.current?.redoWorkspace() ?? false,
    executeActiveCanvasCommand: (command: CanvasCommand) => controllerRef.current?.executeActiveCanvasCommand(command) ?? false,
    executeDocumentCommand: (command: DocumentCommand) => controllerRef.current?.executeDocumentCommand(command),
    collection: () => controllerRef.current?.collection() ?? cloneDocumentCollection(initialCollection),
    openWorkspaceUrlState: (state: WorkspaceUrlState) => controllerRef.current?.openWorkspaceUrlState(state) ?? false,
    currentWorkspaceUrlState: (documentId: string | null) => controllerRef.current?.currentWorkspaceUrlState(documentId) ?? null,
    getWorkspaceSnapshot: () => controllerRef.current?.getWorkspaceSnapshot() ?? createWorkspaceSnapshot(createWorkspaceHistory(initialCollection), null),
    loadWorkspaceSnapshot: (snapshot: CanvasWorkspaceSnapshot, interaction?: string) => controllerRef.current?.loadWorkspaceSnapshot(snapshot, interaction),
    flushWorkspaceSnapshot: () => controllerRef.current?.flushWorkspaceSnapshot() ?? Promise.resolve(),
  }), [initialCollection]);

  return <div ref={hostRef} className="nested-workspace" aria-label="Workspace map" />;
});
