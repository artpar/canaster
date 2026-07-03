import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import { cloneDocumentCollection } from '../../../domain/documentModel';
import type { ViewportStatus } from '../../../domain/types';
import { createWorkspaceHistory, createWorkspaceSnapshot } from '../../../domain/workspaceHistory';
import { NativeNestedCanvasController } from './NativeNestedCanvasController';
import type { NestedCanvasWorkspaceHandle, NestedCanvasWorkspaceProps } from './NestedCanvasWorkspaceTypes';

export type {
  ArrangeCanvasMenuRequest,
  CanvasAddPanelMenuRequest,
  CanvasThemeMenuRequest,
  CanvasViewportControlMenuState,
  CanvasWorkspacePreviewCapture,
  NestedCanvasWorkspaceChromeState,
  NestedCanvasWorkspaceHandle,
  NestedCanvasWorkspaceProps,
  WorkspaceFileDropRequest,
  WorkspaceTextPasteRequest,
} from './NestedCanvasWorkspaceTypes';

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
    nodeAssetService,
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
      nodeAssetService,
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
  }, [fitOnFirstLoad, nodeAssetService]);

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
    executeActiveCanvasCommand: (command) => controllerRef.current?.executeActiveCanvasCommand(command) ?? false,
    executeDocumentCommand: (command) => controllerRef.current?.executeDocumentCommand(command) ?? false,
    setWorkspaceTheme: (themeId) => controllerRef.current?.setWorkspaceTheme(themeId) ?? false,
    collection: () => controllerRef.current?.collection() ?? cloneDocumentCollection(initialCollection),
    openWorkspaceUrlState: (state) => controllerRef.current?.openWorkspaceUrlState(state) ?? false,
    currentWorkspaceUrlState: (documentId: string | null) => controllerRef.current?.currentWorkspaceUrlState(documentId) ?? null,
    getWorkspaceSnapshot: () => controllerRef.current?.getWorkspaceSnapshot() ?? createWorkspaceSnapshot(createWorkspaceHistory(initialCollection), null),
    loadWorkspaceSnapshot: (snapshot, interaction) => controllerRef.current?.loadWorkspaceSnapshot(snapshot, interaction),
    replaceWorkspaceSnapshot: (snapshot, options) => controllerRef.current?.replaceWorkspaceSnapshot(snapshot, options),
    setParentContextVisible: (visible: boolean) => controllerRef.current?.setParentContextVisible(visible),
    setStorageKey: (nextStorageKey: string) => controllerRef.current?.setStorageKey(nextStorageKey),
    flushWorkspaceSnapshot: () => controllerRef.current?.flushWorkspaceSnapshot() ?? Promise.resolve(),
    captureActiveCanvasPreview: () => controllerRef.current?.captureActiveCanvasPreview() ?? Promise.resolve(null),
  }), [initialCollection]);

  return <div ref={hostRef} className="nested-workspace" aria-label="Workspace map" />;
});
