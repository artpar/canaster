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

export type CanvasEditSource = 'pointer' | 'keyboard' | 'nonvisual';

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
