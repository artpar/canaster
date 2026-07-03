import type { CanvasNode, JsonObject, NodeData, NodeTypeId } from '../types';

export type NodeActionDescriptor = {
  id: string;
  label: string;
  available: boolean;
  disabledReason?: string;
};

export type NodeDescription = {
  label: string;
  roleDescription: string;
  details: string[];
  state: string[];
  actions: NodeActionDescriptor[];
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

export type NodeSemanticContext<TData extends NodeData = NodeData> = {
  node: CanvasNode<TData>;
  data: TData;
};

export type NodeSemanticDefinition<TData extends NodeData = NodeData> = {
  type: NodeTypeId;
  createDefaultData(): TData;
  parseData(raw: JsonObject): TData;
  describe(context: NodeSemanticContext<TData>): NodeDescription;
  referencedAssetIds?(context: NodeSemanticContext<TData>): string[];
  portalInfo?(context: NodeSemanticContext<TData>): NodePortalInfo | null;
  createPortalData?(info: NodePortalInfo): TData;
  updatePortalSummary?(context: NodeSemanticContext<TData>, summary: NodePortalSummary): TData;
  stripForPaste?(context: NodeSemanticContext<TData>): CanvasNode<TData>;
};
