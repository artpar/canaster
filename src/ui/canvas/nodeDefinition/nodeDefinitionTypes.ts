import type { CanvasTheme } from '../theme';
import type { NodeContentViewport } from '../../../core/nodeAppearance';
import type { CanvasEditSource, CanvasNode, JsonObject, NodeData, NodeTypeId, WorldPoint } from '../../../core/nodePrimitives';
import type { CanvasNodeAssetService } from '../nodeAssetService';
import type { CanvasNodeMailService } from '../nodeMailService';

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
  portalPreview: 'none' | 'live';
};

export type NodeRenderContext<TData extends NodeData = NodeData> = {
  ctx: CanvasRenderingContext2D;
  node: CanvasNode & { data: TData };
  data: TData;
  theme: CanvasTheme;
  contentRect: NodeContentRect;
  contentViewport: NodeContentViewport;
  visibleContentRect: NodeContentRect;
  state: NodeRenderState;
  nodeAssetService: CanvasNodeAssetService;
  nodeMailService: CanvasNodeMailService;
  requestRender(): void;
};

export type NodeHitTarget =
  | { type: 'body' }
  | { type: 'activate'; action: string };

export type NodeHitTestContext<TData extends NodeData = NodeData> = {
  node: CanvasNode & { data: TData };
  data: TData;
  point: WorldPoint;
  contentRect: NodeContentRect;
  theme: CanvasTheme;
};

export type NodeInteractionRegion = {
  id: string;
  rect: NodeContentRect;
  cursor?: string;
  label?: string;
  activation?: 'double' | 'single';
};

export type NodeInteractionRegionContext<TData extends NodeData = NodeData> = {
  node: CanvasNode & { data: TData };
  data: TData;
  contentRect: NodeContentRect;
  theme: CanvasTheme;
};

export type NodeInteractionContext<TData extends NodeData = NodeData> = {
  node: CanvasNode & { data: TData };
  data: TData;
  contentRect: NodeContentRect;
  theme: CanvasTheme;
  region: NodeInteractionRegion;
  mount: HTMLElement;
  nodeAssetService: CanvasNodeAssetService;
  nodeMailService: CanvasNodeMailService;
  requestCommit(nextData: TData, source?: CanvasEditSource): void;
  requestClose(): void;
};

export type NodeInteractionController = {
  focus?(): void;
  dispose(): void;
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

export type NodeAddMenuMetadata = {
  label: string;
  detail: string;
  badge: string;
};

export type BuiltInNodeActionId =
  | 'enter-child-canvas'
  | 'create-child-canvas'
  | 'focus-portal-preview';

export type NodeDescribeContext<TData extends NodeData = NodeData> = {
  node: CanvasNode & { data: TData };
  data: TData;
};

export type NodePortalInfo = {
  childCanvasId: string | null;
  title: string;
  nodeCount: number;
};

export type NodePortalSummary = {
  title: string;
  nodeCount: number;
};

export type NodeCapabilityContext<TData extends NodeData = NodeData> = {
  node: CanvasNode & { data: TData };
  data: TData;
};

export type NodeDefinition<TData extends NodeData = NodeData> = {
  type: NodeTypeId;
  displayName: string;
  roleDescription: string;
  typeBadge: string;
  addMenu: NodeAddMenuMetadata;
  defaultSize: NodeSize;
  minSize: NodeSize;
  contentPadding?: number;
  createDefaultData(): TData;
  parseData(raw: JsonObject): TData;
  render(context: NodeRenderContext<TData>): void;
  hitTest?(context: NodeHitTestContext<TData>): NodeHitTarget | null;
  getInteractionRegions?(context: NodeInteractionRegionContext<TData>): NodeInteractionRegion[];
  createInteraction?(context: NodeInteractionContext<TData>): NodeInteractionController | null;
  describe(context: NodeDescribeContext<TData>): NodeDescription;
  portalInfo?(context: NodeCapabilityContext<TData>): NodePortalInfo | null;
  createPortalData?(info: NodePortalInfo): TData;
  updatePortalSummary?(context: NodeCapabilityContext<TData>, summary: NodePortalSummary): TData;
  stripForPaste?(context: NodeCapabilityContext<TData>): CanvasNode<TData>;
  referencedAssetIds?(context: NodeCapabilityContext<TData>): string[];
};
