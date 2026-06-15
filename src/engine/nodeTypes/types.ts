import type { CanvasNode, JsonObject, NodeData, NodeTypeId, WorldPoint } from '../types';
import type { CanvasTheme } from '../theme';

export type NodeSize = {
  w: number;
  h: number;
};

export type NodeContentRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type NodeRenderQuality = 'normal' | 'compact';

export type NodeRenderState = {
  selected: boolean;
  primary: boolean;
  hovered: boolean;
  quality: NodeRenderQuality;
};

export type NodeRenderContext<TData extends NodeData = NodeData> = {
  ctx: CanvasRenderingContext2D;
  node: CanvasNode & { data: TData };
  data: TData;
  theme: CanvasTheme;
  contentRect: NodeContentRect;
  state: NodeRenderState;
};

export type NodeHitTarget =
  | { type: 'body' }
  | { type: 'activate'; action: string };

export type NodeHitTestContext<TData extends NodeData = NodeData> = {
  node: CanvasNode & { data: TData };
  data: TData;
  point: WorldPoint;
  contentRect: NodeContentRect;
};

export type NodeDescription = {
  label: string;
  roleDescription: string;
  details: string[];
  state: string[];
  actions: NodeActionDescriptor[];
};

export type NodeActionDescriptor = {
  id: string;
  label: string;
  available: boolean;
  disabledReason?: string;
};

export type NodeDescribeContext<TData extends NodeData = NodeData> = {
  node: CanvasNode & { data: TData };
  data: TData;
};

export type NodeDefinition<TData extends NodeData = NodeData> = {
  type: NodeTypeId;
  displayName: string;
  defaultSize: NodeSize;
  minSize: NodeSize;
  createDefaultData(): TData;
  parseData(raw: JsonObject): TData;
  render(context: NodeRenderContext<TData>): void;
  hitTest?(context: NodeHitTestContext<TData>): NodeHitTarget | null;
  describe(context: NodeDescribeContext<TData>): NodeDescription;
};
