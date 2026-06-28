export type {
  CanvasEditSource,
  CanvasNode,
  JsonArray,
  JsonObject,
  JsonPrimitive,
  JsonValue,
  NodeData,
  NodeTypeId,
  WorldPoint,
} from '../core/nodePrimitives';
export { BuiltInNodeTypes } from '../ui/canvas/nodeDefinition/nodeTypeSpecs';
export type { BuiltInNodeType } from '../ui/canvas/nodeDefinition/nodeTypeSpecs';
import type { CanvasEditSource, CanvasNode, NodeData, NodeTypeId, WorldPoint } from '../core/nodePrimitives';

export type ThemeName = 'dark' | 'light';

export type Camera = {
  x: number;
  y: number;
  scale: number;
};

export type CanvasModel = {
  schemaVersion: 2;
  nodes: CanvasNode[];
};

export type CanvasNodeVisibilityFilter = (node: CanvasNode) => boolean;

export type CanvasArrangeLayout = 'grid' | 'rows' | 'columns' | 'list';

export type CanvasCommand =
  | { type: 'create-node'; nodeType: NodeTypeId; source: CanvasEditSource; at?: WorldPoint }
  | { type: 'select-node'; nodeId: string; mode?: 'replace' | 'toggle' | 'add'; source: CanvasEditSource }
  | { type: 'clear-selection'; source: CanvasEditSource }
  | { type: 'move-selection'; dx: number; dy: number; source: CanvasEditSource }
  | { type: 'resize-selection'; dw: number; dh: number; source: CanvasEditSource }
  | { type: 'delete-selection'; source: CanvasEditSource }
  | { type: 'copy-selection'; source: CanvasEditSource }
  | { type: 'paste-clipboard'; source: CanvasEditSource };

export type CanvasNodeGeometry = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type CanvasSelectionState = {
  selectedNodeIds: string[];
  primarySelectedNodeId: string | null;
  resizeMode: boolean;
};

export type CanvasOperation =
  | { type: 'set-selection'; from: CanvasSelectionState; to: CanvasSelectionState }
  | { type: 'set-node-geometry'; nodeId: string; from: CanvasNodeGeometry; to: CanvasNodeGeometry }
  | { type: 'delete-nodes'; nodes: CanvasNode[] }
  | { type: 'create-nodes'; nodes: CanvasNode[] }
  | { type: 'set-paste-counter'; from: number; to: number }
  | { type: 'set-clipboard'; from: CanvasNode[]; to: CanvasNode[] };

export type CanvasModelChange =
  | { kind: 'node-move'; nodeId: string; nodeIds: string[]; source: CanvasEditSource }
  | { kind: 'node-resize'; nodeId: string; nodeIds: string[]; source: CanvasEditSource }
  | { kind: 'node-delete'; nodeId: string | null; nodeIds: string[]; source: CanvasEditSource }
  | { kind: 'node-create'; nodeId: string | null; nodeIds: string[]; source: CanvasEditSource };

export type ViewportStatus = {
  zoom: number;
  selectedNodeId: string | null;
  selectedNodeIds: string[];
  selectionCount: number;
  cursorWorld: WorldPoint | null;
  renderedNodes: number;
  totalNodes: number;
  interaction: string;
};

export type EngineInteractionMode = 'active' | 'embedded-live' | 'preview-live' | 'context-live' | 'dormant';

export type ScreenRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type PortalLayout = {
  parentCanvasId: string;
  portalNodeId: string;
  childCanvasId: string | null;
  worldRect: CanvasNodeGeometry;
  screenRect: ScreenRect;
  visible: boolean;
};

export type CanvasFrameMetrics = {
  canvasId: string;
  mode: EngineInteractionMode;
  renderedNodes: number;
  totalNodes: number;
  frameMs: number;
};

export type EngineOptions = {
  canvasId?: string;
  interactionMode?: EngineInteractionMode;
  beforeCommand?: (command: CanvasCommand) => CanvasCommand | false;
  onNodeAction?: (nodeId: string, actionId: string, source: CanvasEditSource) => boolean;
  onCanvasDoubleClick?: (canvasId: string, event: MouseEvent) => boolean;
  onNodeDataChange?: (nodeId: string, from: NodeData, to: NodeData, source: CanvasEditSource) => boolean;
  onStatus?: (status: ViewportStatus) => void;
  onModelChange?: (model: CanvasModel, change: CanvasModelChange) => void;
  onPortalLayout?: (layouts: PortalLayout[]) => void;
  onFrameMetrics?: (metrics: CanvasFrameMetrics) => void;
  nodeVisibilityFilter?: CanvasNodeVisibilityFilter | null;
  nodeVisibilitySignature?: string;
  livePortalNodeIds?: Set<string>;
  highlightNodeIds?: string[];
  transformPastedNode?: (node: CanvasNode) => CanvasNode;
  pasteInteractionForNodes?: (nodes: CanvasNode[]) => string | null;
};
