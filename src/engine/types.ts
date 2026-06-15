export type ThemeName = 'dark' | 'light';

export type Camera = {
  x: number;
  y: number;
  scale: number;
};

export const BuiltInNodeTypes = {
  card: 'card',
  text: 'text',
  image: 'image',
  canvas: 'canvas',
} as const;

export type BuiltInNodeType = (typeof BuiltInNodeTypes)[keyof typeof BuiltInNodeTypes];
export type NodeTypeId = string;

export type JsonPrimitive = null | boolean | number | string;
export type JsonObject = { [key: string]: JsonValue };
export type JsonArray = JsonValue[];
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

export type NodeData = JsonObject;

export type CanvasNode<TData extends NodeData = NodeData> = {
  id: string;
  type: NodeTypeId;
  x: number;
  y: number;
  w: number;
  h: number;
  data: TData;
};

export type CanvasModel = {
  schemaVersion: 2;
  nodes: CanvasNode[];
};

export type CardAccent = 'task' | 'data' | 'system';

export type CardNodeData = {
  title: string;
  detail: string;
  accent: CardAccent;
} & JsonObject;

export type TextNodeData = {
  text: string;
} & JsonObject;

export type ImageNodeData = {
  src: string | null;
  alt: string;
  fit: 'contain' | 'cover';
} & JsonObject;

export type CanvasPortalNodeData = {
  childCanvasId: string | null;
  title: string;
  nodeCount: number;
} & JsonObject;

export type CanvasEditSource = 'pointer' | 'keyboard' | 'nonvisual' | 'ai';

export type CanvasCommand =
  | { type: 'select-node'; nodeId: string; mode?: 'replace' | 'toggle' | 'add'; source: CanvasEditSource }
  | { type: 'clear-selection'; source: CanvasEditSource }
  | { type: 'move-selection'; dx: number; dy: number; source: CanvasEditSource }
  | { type: 'resize-primary'; dw: number; dh: number; source: CanvasEditSource }
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

export type WorldPoint = {
  x: number;
  y: number;
};

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

export type EngineOptions = {
  onStatus?: (status: ViewportStatus) => void;
  onModelChange?: (model: CanvasModel, change: CanvasModelChange) => void;
};
