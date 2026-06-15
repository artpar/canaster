export type ThemeName = 'dark' | 'light';

export type Camera = {
  x: number;
  y: number;
  scale: number;
};

export type CanvasNodeKind = 'task' | 'data' | 'system';

export type CanvasNode = {
  id: string;
  label: string;
  detail: string;
  kind: CanvasNodeKind;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type CanvasModel = {
  nodes: CanvasNode[];
};

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
