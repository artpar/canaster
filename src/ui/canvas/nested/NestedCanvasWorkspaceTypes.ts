import type { CanvasCommand, CanvasModelChange, ScreenRect, ViewportStatus, WorldPoint } from '../../../domain/types';
import type {
  CanvasDocumentCollection,
  CanvasDocumentId,
  CanvasWorkspaceSnapshot,
  DocumentCommand,
  DocumentModelChange,
} from '../../../domain/documentTypes';
import type { WorkspaceUrlState } from '../../../infra/browser/workspaceUrlLocation';
import type { CanasterThemeId } from '../../theme/CanasterTheme';
import type { CanvasNodeAssetService } from '../nodeAssetService';
import type { CanvasNodeMailService } from '../nodeMailService';

export type CanvasViewportControlMenuState = {
  canvasId: CanvasDocumentId;
  control: 'arrange' | 'theme';
} | null;

export type CanvasWorkspacePreviewCapture = {
  blob: Blob;
  width: number;
  height: number;
  canvasId: CanvasDocumentId;
};

export type NestedCanvasWorkspaceProps = {
  initialCollection: CanvasDocumentCollection;
  theme: CanasterThemeId;
  animationEnabled?: boolean;
  fitOnFirstLoad?: boolean;
  nodeAssetService?: CanvasNodeAssetService;
  nodeMailService?: CanvasNodeMailService;
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
