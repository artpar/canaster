import type {
  Camera,
  CanvasEditSource,
  CanvasModel,
  CanvasNode,
  CanvasPortalNodeData,
  CanvasSelectionState,
  NodeData,
} from './types';

export type CanvasDocumentId = string;

export type CanvasDocumentCollection = {
  schemaVersion: 1;
  rootCanvasId: CanvasDocumentId;
  activeCanvasId: CanvasDocumentId;
  documents: Record<CanvasDocumentId, CanvasDocument>;
  view: NestedCanvasViewState;
};

export type CanvasWorkspaceSnapshot = {
  schemaVersion: 1;
  history: CanvasWorkspaceHistory;
  lastModelChange: DocumentModelChange | null;
};

export type CanvasWorkspaceHistory = {
  present: CanvasDocumentCollection;
  undoStack: CanvasDocumentCollection[];
  redoStack: CanvasDocumentCollection[];
};

export type CanvasDocument = {
  id: CanvasDocumentId;
  title: string;
  parentCanvasId: CanvasDocumentId | null;
  parentNodeId: string | null;
  model: CanvasModel;
};

export type NestedCanvasViewState = {
  cameras: Record<CanvasDocumentId, Camera>;
  selections: Record<CanvasDocumentId, CanvasSelectionState>;
  paneLayouts: Record<CanvasDocumentId, ParentContextPaneLayout>;
  activeCanvasId: CanvasDocumentId;
  focusedEngineId: EngineSlotId;
  previewFocus: PortalPreviewFocus | null;
  stackPath: StackFrame[];
  parentContext: ParentContextFieldState;
  animationEnabled: boolean;
  deleteConfirmation: DeleteConfirmationState | null;
};

export type ParentContextPaneLayout = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type EngineSlotId = string;

export type EngineMode = 'active' | 'embedded-live' | 'preview-live' | 'context-live' | 'dormant';

export type PortalPreviewFocus = {
  parentCanvasId: CanvasDocumentId;
  portalNodeId: string;
  childCanvasId: CanvasDocumentId;
};

export type StackFrame = {
  canvasId: CanvasDocumentId;
  parentCanvasId: CanvasDocumentId | null;
  parentNodeId: string | null;
  depth: number;
};

export type ParentContextRegion =
  | 'top'
  | 'top-right'
  | 'right'
  | 'bottom-right'
  | 'bottom'
  | 'bottom-left'
  | 'left'
  | 'top-left';

export type ParentContextFieldShape = {
  region: ParentContextRegion;
  parentCanvasId: CanvasDocumentId;
  node: CanvasNode;
  distance: number;
  projectedRect: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  childCanvasId: CanvasDocumentId | null;
  opacity: number;
  detail: number;
  portal: boolean;
};

export type ParentContextFieldState = {
  sourceCanvasId: CanvasDocumentId | null;
  sourcePortalNodeId: string | null;
  shapes: ParentContextFieldShape[];
};

export type DeleteConfirmationState = {
  canvasId: CanvasDocumentId;
  nodeIds: string[];
};

export type DocumentCommand =
  | { type: 'select-canvas'; canvasId: CanvasDocumentId; source: CanvasEditSource }
  | { type: 'enter-child-canvas'; parentCanvasId: CanvasDocumentId; portalNodeId: string; source: CanvasEditSource }
  | { type: 'go-to-parent-canvas'; source: CanvasEditSource }
  | { type: 'activate-neighbor-portal'; parentCanvasId: CanvasDocumentId; portalNodeId: string; source: CanvasEditSource }
  | { type: 'focus-portal-preview'; parentCanvasId: CanvasDocumentId; portalNodeId: string; source: CanvasEditSource }
  | { type: 'create-child-canvas'; parentCanvasId: CanvasDocumentId; nodeId: string; source: CanvasEditSource }
  | { type: 'create-canvas-portal'; parentCanvasId: CanvasDocumentId; nodeId: string; source: CanvasEditSource }
  | { type: 'set-node-data'; canvasId: CanvasDocumentId; nodeId: string; from: NodeData; to: NodeData; source: CanvasEditSource }
  | { type: 'confirm-delete-selection'; canvasId: CanvasDocumentId; source: CanvasEditSource }
  | { type: 'cancel-delete-confirmation'; source: CanvasEditSource }
  | { type: 'execute-node-action'; canvasId: CanvasDocumentId; nodeId: string; actionId: string; source: CanvasEditSource };

export type DocumentModelChange =
  | { kind: 'active-canvas-change'; from: CanvasDocumentId; to: CanvasDocumentId; source: CanvasEditSource }
  | { kind: 'canvas-create'; canvasId: CanvasDocumentId; parentCanvasId: CanvasDocumentId; parentNodeId: string; source: CanvasEditSource }
  | { kind: 'node-data-change'; canvasId: CanvasDocumentId; nodeId: string; source: CanvasEditSource }
  | { kind: 'portal-preview-focus'; canvasId: CanvasDocumentId; nodeId: string; source: CanvasEditSource }
  | { kind: 'delete-confirmation-open'; canvasId: CanvasDocumentId; nodeIds: string[]; source: CanvasEditSource }
  | { kind: 'delete-confirmation-close'; source: CanvasEditSource }
  | { kind: 'document-delete'; canvasIds: CanvasDocumentId[]; source: CanvasEditSource };

export type PortalNode = CanvasNode<CanvasPortalNodeData>;
