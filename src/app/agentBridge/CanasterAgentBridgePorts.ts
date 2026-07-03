import type { Camera, CanvasCommand, CanvasNode } from '../../domain/types';
import type {
  CanvasDocumentCollection,
  CanvasDocumentId,
  DocumentCommand,
  ParentContextRegion,
} from '../../domain/documentTypes';

export type CanasterAgentLiveEvent = {
  topic: string;
  event: string;
  data: unknown;
};

export type CanasterAgentLiveConnection = {
  close: () => void;
  publish: (topicName: string, message: unknown) => void;
};

export type CanasterAgentLiveTransport = {
  connect: (options: {
    ensureTopicName: string;
    topicName: string;
    onEvent: (event: CanasterAgentLiveEvent) => void;
    onError: (error: unknown) => void;
  }) => CanasterAgentLiveConnection;
};

export type CanasterAgentNodeTypeOption = {
  type: string;
  label: string;
  detail: string;
  badge: string;
};

export type CanasterAgentNodeMetadata = {
  listNodeTypes: () => CanasterAgentNodeTypeOption[];
  referencedAssetIdsForNode: (node: CanvasNode) => string[];
};

export type CanasterAgentWorkspacePaneCamera = {
  ownerCanvasId: CanvasDocumentId;
  parentCanvasId: CanvasDocumentId;
  sourceNodeId: string;
  region: ParentContextRegion;
  targetSignature: string;
  camera: Camera;
};

export type CanasterAgentWorkspaceViewState = {
  documentId: string | null;
  shareUsername?: string;
  shareSlug?: string;
  activeCanvasId: CanvasDocumentId;
  activeCamera: Camera;
  paneCameras: CanasterAgentWorkspacePaneCamera[];
};

export type CanasterAgentWorkspacePreview = {
  mime: string;
  width: number;
  height: number;
  canvasId: CanvasDocumentId;
  size: number;
  readDataUri: () => Promise<string>;
};

export type CanasterAgentWorkspace = {
  captureActiveCanvasPreview: () => Promise<CanasterAgentWorkspacePreview | null>;
  collection: () => CanvasDocumentCollection;
  currentViewState: (documentId: string | null) => CanasterAgentWorkspaceViewState | null;
  executeActiveCanvasCommand: (command: CanvasCommand) => boolean;
  executeDocumentCommand: (command: DocumentCommand) => boolean;
  fitActiveCanvas: () => void;
  openViewState: (state: CanasterAgentWorkspaceViewState) => boolean;
  zoomActiveBy: (factor: number) => void;
};

export type CanasterAgentTimer = {
  sleep: (ms: number) => Promise<void>;
};
