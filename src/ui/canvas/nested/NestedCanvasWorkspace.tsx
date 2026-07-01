import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import { cloneDocumentCollection } from '../../../domain/documentModel';
import { type CanvasCommand, type CanvasModelChange, type ScreenRect, type ViewportStatus, type WorldPoint } from '../../../domain/types';
import type {
  CanvasDocumentCollection,
  CanvasWorkspaceSnapshot,
  DocumentCommand,
  DocumentModelChange,
} from '../../../domain/documentTypes';
import { createWorkspaceHistory, createWorkspaceSnapshot } from '../../../domain/workspaceHistory';
import type { WorkspaceUrlState } from '../../../infra/browser/workspaceUrlLocation';
import type {CanasterThemeId} from '../../theme/CanasterTheme';
import { NativeNestedCanvasController, type CanvasViewportControlMenuState, type CanvasWorkspacePreviewCapture } from './NativeNestedCanvasController';

export type NestedCanvasWorkspaceProps = {
  initialCollection: CanvasDocumentCollection;
  theme: CanasterThemeId;
  animationEnabled?: boolean;
  fitOnFirstLoad?: boolean;
  storageKey?: string;
  viewportControlMenuState?: CanvasViewportControlMenuState;
  onCollectionChange?: (collection: CanvasDocumentCollection, changes: DocumentModelChange[]) => void;
  onChromeStateChange?: (state: NestedCanvasWorkspaceChromeState) => void;
  onCanvasAddPanelMenuRequest?: (request: CanvasAddPanelMenuRequest) => void;
  onArrangeCanvasMenuRequest?: (request: ArrangeCanvasMenuRequest) => void;
  onCanvasThemeMenuRequest?: (request: CanvasThemeMenuRequest) => void;
  onFileDrop?: (request: WorkspaceFileDropRequest) => void;
  onTextPaste?: (request: WorkspaceTextPasteRequest) => boolean;
};

export type ArrangeCanvasMenuRequest = {
  canvasId: string;
  anchor?: ScreenRect;
  metaOrCtrl?: boolean;
};

export type CanvasThemeMenuRequest = {
  canvasId: string;
  anchor?: ScreenRect;
  metaOrCtrl?: boolean;
};

export type CanvasAddPanelMenuRequest = {
  canvasId: string;
  anchor: ScreenRect;
  at: WorldPoint;
};

export type WorkspaceFileDropRequest = {
  canvasId: string;
  at: WorldPoint;
  files: File[];
  source?: 'drop' | 'paste';
};

export type WorkspaceTextPasteRequest = {
  canvasId: string;
  at: WorldPoint;
  text: string;
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
  setWorkspaceTheme(themeId: CanasterThemeId): boolean;
  collection(): CanvasDocumentCollection;
  openWorkspaceUrlState(state: WorkspaceUrlState): boolean;
  currentWorkspaceUrlState(documentId: string | null): WorkspaceUrlState | null;
  getWorkspaceSnapshot(): CanvasWorkspaceSnapshot;
  loadWorkspaceSnapshot(snapshot: CanvasWorkspaceSnapshot, interaction?: string): void;
  replaceWorkspaceSnapshot(snapshot: CanvasWorkspaceSnapshot, options?: { storageKey?: string; interaction?: string; persist?: boolean }): void;
  setParentContextVisible(visible: boolean): void;
  setStorageKey(storageKey: string): void;
  flushWorkspaceSnapshot(): Promise<void>;
  captureActiveCanvasPreview(): Promise<CanvasWorkspacePreviewCapture | null>;
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
    fitOnFirstLoad = true,
    storageKey,
    viewportControlMenuState = null,
    onCollectionChange,
    onChromeStateChange,
    onCanvasAddPanelMenuRequest,
    onArrangeCanvasMenuRequest,
    onCanvasThemeMenuRequest,
    onFileDrop,
    onTextPaste,
  },
  ref,
) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<NativeNestedCanvasController | null>(null);
  const callbacksRef = useRef({ onCollectionChange, onChromeStateChange, onCanvasAddPanelMenuRequest, onArrangeCanvasMenuRequest, onCanvasThemeMenuRequest, onFileDrop, onTextPaste });
  const initialCollectionRef = useRef(initialCollection);

  useEffect(() => {
    callbacksRef.current = { onCollectionChange, onChromeStateChange, onCanvasAddPanelMenuRequest, onArrangeCanvasMenuRequest, onCanvasThemeMenuRequest, onFileDrop, onTextPaste };
  }, [onCollectionChange, onChromeStateChange, onCanvasAddPanelMenuRequest, onArrangeCanvasMenuRequest, onCanvasThemeMenuRequest, onFileDrop, onTextPaste]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const controller = new NativeNestedCanvasController({
      root: host,
      initialCollection: initialCollectionRef.current,
      theme,
      fitOnFirstLoad,
      storageKey,
      onCollectionChange: (collection, changes) => callbacksRef.current.onCollectionChange?.(collection, changes),
      onChromeStateChange: (state) => callbacksRef.current.onChromeStateChange?.(state),
      onCanvasAddPanelMenuRequest: (request) => callbacksRef.current.onCanvasAddPanelMenuRequest?.(request),
      onArrangeCanvasMenuRequest: (request) => callbacksRef.current.onArrangeCanvasMenuRequest?.(request),
      onCanvasThemeMenuRequest: (request) => callbacksRef.current.onCanvasThemeMenuRequest?.(request),
      onFileDrop: (request) => callbacksRef.current.onFileDrop?.(request),
      onTextPaste: (request) => callbacksRef.current.onTextPaste?.(request) ?? false,
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
    controllerRef.current?.setViewportControlMenuState(viewportControlMenuState);
  }, [viewportControlMenuState]);

  useImperativeHandle(ref, () => ({
    fitActiveCanvas: () => controllerRef.current?.fitActiveCanvas(),
    refreshActiveCanvas: () => controllerRef.current?.refreshActiveCanvas(),
    resetActiveZoom: () => controllerRef.current?.resetActiveZoom(),
    zoomActiveBy: (factor: number) => controllerRef.current?.zoomActiveBy(factor),
    undoWorkspace: () => controllerRef.current?.undoWorkspace() ?? false,
    redoWorkspace: () => controllerRef.current?.redoWorkspace() ?? false,
    executeActiveCanvasCommand: (command: CanvasCommand) => controllerRef.current?.executeActiveCanvasCommand(command) ?? false,
    executeDocumentCommand: (command: DocumentCommand) => controllerRef.current?.executeDocumentCommand(command) ?? false,
    setWorkspaceTheme: (themeId: CanasterThemeId) => controllerRef.current?.setWorkspaceTheme(themeId) ?? false,
    collection: () => controllerRef.current?.collection() ?? cloneDocumentCollection(initialCollection),
    openWorkspaceUrlState: (state: WorkspaceUrlState) => controllerRef.current?.openWorkspaceUrlState(state) ?? false,
    currentWorkspaceUrlState: (documentId: string | null) => controllerRef.current?.currentWorkspaceUrlState(documentId) ?? null,
    getWorkspaceSnapshot: () => controllerRef.current?.getWorkspaceSnapshot() ?? createWorkspaceSnapshot(createWorkspaceHistory(initialCollection), null),
    loadWorkspaceSnapshot: (snapshot: CanvasWorkspaceSnapshot, interaction?: string) => controllerRef.current?.loadWorkspaceSnapshot(snapshot, interaction),
    replaceWorkspaceSnapshot: (snapshot: CanvasWorkspaceSnapshot, options?: { storageKey?: string; interaction?: string; persist?: boolean }) => controllerRef.current?.replaceWorkspaceSnapshot(snapshot, options),
    setParentContextVisible: (visible: boolean) => controllerRef.current?.setParentContextVisible(visible),
    setStorageKey: (nextStorageKey: string) => controllerRef.current?.setStorageKey(nextStorageKey),
    flushWorkspaceSnapshot: () => controllerRef.current?.flushWorkspaceSnapshot() ?? Promise.resolve(),
    captureActiveCanvasPreview: () => controllerRef.current?.captureActiveCanvasPreview() ?? Promise.resolve(null),
  }), [initialCollection]);

  return <div ref={hostRef} className="nested-workspace" aria-label="Workspace map" />;
});
