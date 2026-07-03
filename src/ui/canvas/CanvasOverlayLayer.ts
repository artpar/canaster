import type { CanvasEditSource, CanvasNode, NodeData, ScreenRect } from '../../domain/types';
import type { CanvasNodeAssetService } from './nodeAssetService';
import type { CanvasTheme } from './theme';
import { createNodeInteraction, nodeDefinitionFor, parseNodeData } from './nodeRegistry';
import type { NodeContentRect, NodeInteractionController, NodeInteractionRegion } from './nodeDefinition/nodeDefinitionTypes';

type ActiveNodeInteraction = {
  nodeId: string;
  regionId: string;
  region: NodeInteractionRegion;
  mount: HTMLDivElement;
  controller: NodeInteractionController;
};

export type CanvasOverlayLayerHost = {
  nodeAssetService: CanvasNodeAssetService;
  currentNode(nodeId: string): CanvasNode | null;
  isNodeVisible(node: CanvasNode): boolean;
  primarySelectedNodeId(): string | null;
  themeForNode(node: CanvasNode): CanvasTheme;
  nodeContentRect(node: CanvasNode, theme: CanvasTheme): NodeContentRect;
  interactionRegionsFor(node: CanvasNode): NodeInteractionRegion[];
  worldToScreenRect(rect: { x: number; y: number; w: number; h: number }): ScreenRect;
  commitNodeData(nodeId: string, from: NodeData, to: NodeData, source: CanvasEditSource): boolean;
  setInteraction(interaction: string): void;
  markDirty(): void;
  emitStatus(): void;
  syncNodeContentToolbar(): void;
};

export class CanvasOverlayLayer {
  readonly root: HTMLDivElement;

  private activeNodeInteraction: ActiveNodeInteraction | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly host: CanvasOverlayLayerHost,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'node-inline-editor-layer';
    this.root.setAttribute('aria-label', 'Inline panel editor');
    canvas.insertAdjacentElement('afterend', this.root);
  }

  get activeNodeId(): string | null {
    return this.activeNodeInteraction?.nodeId ?? null;
  }

  hasActiveNodeInteraction(): boolean {
    return Boolean(this.activeNodeInteraction);
  }

  startNodeInteraction(node: CanvasNode, region: NodeInteractionRegion, source: CanvasEditSource): boolean {
    this.closeNodeInteraction();
    const definition = nodeDefinitionFor(node);
    const data = parseNodeData(node);
    const theme = this.host.themeForNode(node);
    const mount = document.createElement('div');
    mount.className = 'node-inline-editor-mount';
    mount.dataset.nodeId = node.id;
    mount.dataset.regionId = region.id;
    this.root.append(mount);
    const controller = createNodeInteraction({
      definition,
      node,
      data,
      theme,
      contentRect: this.host.nodeContentRect(node, theme),
      region,
      mount,
      nodeAssetService: this.host.nodeAssetService,
      requestCommit: (nextData, commitSource = source) => {
        const current = this.host.currentNode(node.id);
        if (!current) return;
        const committed = this.host.commitNodeData(node.id, current.data, nextData, commitSource);
        this.host.setInteraction(committed ? 'Edited panel' : 'Panel edit unchanged');
        if (committed) this.host.markDirty();
        this.host.emitStatus();
      },
      requestClose: () => this.closeNodeInteraction(),
    });
    if (!controller) {
      mount.remove();
      return false;
    }
    this.activeNodeInteraction = { nodeId: node.id, regionId: region.id, region, mount, controller };
    this.positionNodeInteraction();
    this.host.syncNodeContentToolbar();
    this.host.setInteraction(region.label ? `Editing ${region.label}` : 'Editing panel');
    this.host.emitStatus();
    requestAnimationFrame(() => {
      if (this.activeNodeInteraction?.controller === controller) controller.focus?.();
    });
    return true;
  }

  closeNodeInteraction(): void {
    const active = this.activeNodeInteraction;
    if (!active) return;
    this.activeNodeInteraction = null;
    active.controller.dispose();
    active.mount.remove();
    this.host.syncNodeContentToolbar();
    this.host.emitStatus();
  }

  reconcileNodeInteraction(): void {
    const active = this.activeNodeInteraction;
    if (!active) return;
    const node = this.host.currentNode(active.nodeId);
    if (!node || !this.host.isNodeVisible(node) || this.host.primarySelectedNodeId() !== active.nodeId) {
      this.closeNodeInteraction();
      return;
    }
    const region = this.host.interactionRegionsFor(node).find((candidate) => candidate.id === active.regionId);
    if (!region) {
      this.closeNodeInteraction();
      return;
    }
    active.region = region;
    this.positionNodeInteraction();
  }

  positionNodeInteraction(): void {
    const active = this.activeNodeInteraction;
    if (!active) return;
    const rect = this.host.worldToScreenRect(active.region.rect);
    active.mount.style.left = `${rect.x}px`;
    active.mount.style.top = `${rect.y}px`;
    active.mount.style.width = `${Math.max(1, rect.w)}px`;
    active.mount.style.height = `${Math.max(1, rect.h)}px`;
  }

  dispose(): void {
    this.closeNodeInteraction();
    this.root.remove();
  }
}
