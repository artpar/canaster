import { cloneNodeData } from '../../core/nodeData';
import {
  contentScaleForNode,
  contentViewportForNode,
  DEFAULT_NODE_CONTENT_SCALE,
  nodeAppearanceWithContentOffset,
  nodeAppearanceWithContentScale,
} from '../../core/nodeAppearance';
import type {
  CanvasCommand,
  CanvasEditSource,
  CanvasModel,
  CanvasModelChange,
  CanvasNode,
  CanvasNodeContentPan,
  CanvasNodeGeometry,
  CanvasOperation,
  CanvasSelectionState,
  NodeData,
  WorldPoint,
} from '../../domain/types';
import { nodeDefinitionFor, nodeDefinitionForType, parseNodeData } from './nodeRegistry';

const SNAP_STEP = 32;

export type CanvasCommandPlan = {
  operations: CanvasOperation[];
  change?: CanvasModelChange;
  interaction: string;
};

export type CanvasCommandPlannerContext = {
  model: CanvasModel;
  selectionState: CanvasSelectionState;
  selectedNodes: CanvasNode[];
  selectionIds: string[];
  clipboard: CanvasNode[];
  pasteCounter: number;
  primarySelectedNodeId: string | null;
  cursorWorld: WorldPoint | null;
  fallbackCreatePoint: WorldPoint;
  isNodeVisible(node: CanvasNode): boolean;
  contentZoomTargetNodes(nodeIds?: string[]): CanvasNode[];
  transformPastedNode?: (node: CanvasNode) => CanvasNode;
  pasteInteractionForNodes?: (nodes: CanvasNode[]) => string | null;
};

export function planCanvasCommand(context: CanvasCommandPlannerContext, command: CanvasCommand): CanvasCommandPlan {
  switch (command.type) {
    case 'create-node':
      return planCreateNode(context, command.nodeType, command.source, command.at, command.data);
    case 'select-node':
      return planSelectNode(context, command.nodeId, command.source, command.mode ?? 'replace');
    case 'select-nodes':
      return planSelectNodes(context, command.nodeIds, command.source);
    case 'select-all-nodes':
      return planSelectAllNodes(context, command.source);
    case 'clear-selection':
      return planClearSelection(context, command.source);
    case 'move-selection':
      return planMoveSelection(context, command.dx, command.dy, command.source);
    case 'resize-selection':
      return planResizeSelection(context, command.dw, command.dh, command.source);
    case 'scale-selection-content':
      return planScaleSelectionContent(context, command.factor, command.source, command.nodeIds);
    case 'pan-selection-content':
      return planPanSelectionContent(context, command.dx, command.dy, command.source, command.nodeIds);
    case 'reset-selection-content-pan':
      return planResetSelectionContentPan(context, command.source, command.nodeIds);
    case 'reset-selection-content-scale':
      return planResetSelectionContentScale(context, command.source, command.nodeIds);
    case 'delete-selection':
      return planDeleteSelection(context, command.source);
    case 'copy-selection':
      return planCopySelection(context, command.source);
    case 'paste-clipboard':
      return planPasteClipboard(context, command.source);
  }
}

export function sameSelectionState(a: CanvasSelectionState, b: CanvasSelectionState): boolean {
  return a.primarySelectedNodeId === b.primarySelectedNodeId && a.resizeMode === b.resizeMode && arraysEqual(a.selectedNodeIds, b.selectedNodeIds);
}

function planCreateNode(context: CanvasCommandPlannerContext, nodeType: string, source: CanvasEditSource, at?: WorldPoint, data?: NodeData): CanvasCommandPlan {
  const definition = nodeDefinitionForType(nodeType);
  if (!definition) return { operations: [], interaction: 'Panel type unavailable' };
  const existingIds = new Set(context.model.nodes.map((node) => node.id));
  const id = uniqueNodeId(definition.type, existingIds);
  const { w, h } = definition.defaultSize;
  const center = at ?? context.cursorWorld ?? context.fallbackCreatePoint;
  const node: CanvasNode = {
    id,
    type: definition.type,
    x: snapCoordinate(center.x - w / 2),
    y: snapCoordinate(center.y - h / 2),
    w,
    h,
    data: cloneNodeData(data ?? definition.createDefaultData()),
  };
  node.data = parseNodeData(node);
  const selection = {
    selectedNodeIds: [id],
    primarySelectedNodeId: id,
    resizeMode: false,
  };
  return {
    operations: [
      { type: 'create-nodes', nodes: [node] },
      { type: 'set-selection', from: context.selectionState, to: selection },
    ],
    change: { kind: 'node-create', nodeId: id, nodeIds: [id], source },
    interaction: `Added ${definition.displayName}`,
  };
}

function planSelectNode(context: CanvasCommandPlannerContext, nodeId: string, source: CanvasEditSource, mode: 'replace' | 'toggle' | 'add'): CanvasCommandPlan {
  if (!context.model.nodes.some((node) => node.id === nodeId && context.isNodeVisible(node))) return { operations: [], interaction: 'Selection unchanged' };
  const from = context.selectionState;
  const to = selectInState(from, nodeId, mode);
  return {
    operations: sameSelectionState(from, to) ? [] : [{ type: 'set-selection', from, to }],
    interaction: sourceInteraction(source, 'selection'),
  };
}

function planSelectNodes(context: CanvasCommandPlannerContext, nodeIds: string[], source: CanvasEditSource): CanvasCommandPlan {
  const requested = new Set(nodeIds);
  const selectedNodeIds = context.model.nodes
    .filter((node) => requested.has(node.id) && context.isNodeVisible(node))
    .map((node) => node.id);
  const from = context.selectionState;
  const to = {
    selectedNodeIds,
    primarySelectedNodeId: selectedNodeIds[0] ?? null,
    resizeMode: false,
  };
  const count = selectedNodeIds.length;
  const selectedLabel = source === 'ai' ? 'AI selected' : 'Selected';
  return {
    operations: sameSelectionState(from, to) ? [] : [{ type: 'set-selection', from, to }],
    interaction: count > 1 ? `${selectedLabel} ${count} panes` : count === 1 ? `${selectedLabel} pane` : 'Selection cleared',
  };
}

function planSelectAllNodes(context: CanvasCommandPlannerContext, source: CanvasEditSource): CanvasCommandPlan {
  const selectedNodeIds = context.model.nodes.filter((node) => context.isNodeVisible(node)).map((node) => node.id);
  const from = context.selectionState;
  const to = {
    selectedNodeIds,
    primarySelectedNodeId: selectedNodeIds[0] ?? null,
    resizeMode: false,
  };
  const count = selectedNodeIds.length;
  const selectedLabel = source === 'ai' ? 'AI selected' : 'Selected';
  return {
    operations: sameSelectionState(from, to) ? [] : [{ type: 'set-selection', from, to }],
    interaction: count > 1 ? `${selectedLabel} ${count} panes` : count === 1 ? `${selectedLabel} pane` : 'Select all no panes',
  };
}

function planClearSelection(context: CanvasCommandPlannerContext, source: CanvasEditSource): CanvasCommandPlan {
  const from = context.selectionState;
  const to = emptySelectionState();
  return {
    operations: sameSelectionState(from, to) ? [] : [{ type: 'set-selection', from, to }],
    interaction: source === 'keyboard' ? 'Selection cleared' : sourceInteraction(source, 'selection'),
  };
}

function planMoveSelection(context: CanvasCommandPlannerContext, dx: number, dy: number, source: CanvasEditSource): CanvasCommandPlan {
  const nodes = context.selectedNodes;
  if (!nodes.length) return { operations: [], interaction: 'Move no selection' };
  if (dx === 0 && dy === 0) return { operations: [], interaction: 'Move unchanged' };
  const operations: CanvasOperation[] = [];
  for (const node of nodes) {
    const from = nodeGeometry(node);
    const to = { ...from, x: snapCoordinate(node.x + dx), y: snapCoordinate(node.y + dy) };
    if (!sameGeometry(from, to)) operations.push({ type: 'set-node-geometry', nodeId: node.id, from, to });
  }
  return {
    operations,
    change: operations.length ? { kind: 'node-move', nodeId: context.primarySelectedNodeId ?? nodes[0].id, nodeIds: nodes.map((node) => node.id), source } : undefined,
    interaction: operations.length ? sourceInteraction(source, 'move') : 'Move unchanged',
  };
}

function planResizeSelection(context: CanvasCommandPlannerContext, dw: number, dh: number, source: CanvasEditSource): CanvasCommandPlan {
  const nodes = context.selectedNodes;
  if (!nodes.length) return { operations: [], interaction: 'Resize no selection' };
  if (dw === 0 && dh === 0) return { operations: [], interaction: 'Resize unchanged' };
  const operations: CanvasOperation[] = [];
  for (const node of nodes) {
    const from = nodeGeometry(node);
    const to = {
      ...from,
      w: dw === 0 ? node.w : snapNodeWidth(node, node.w + dw),
      h: dh === 0 ? node.h : snapNodeHeight(node, node.h + dh),
    };
    if (!sameGeometry(from, to)) operations.push({ type: 'set-node-geometry', nodeId: node.id, from, to });
  }
  const nodeIds = operations.map((operation) => operation.type === 'set-node-geometry' ? operation.nodeId : '').filter(Boolean);
  return {
    operations,
    change: operations.length ? { kind: 'node-resize', nodeId: context.primarySelectedNodeId ?? nodeIds[0] ?? nodes[0].id, nodeIds, source } : undefined,
    interaction: operations.length ? sourceInteraction(source, 'resize') : 'Resize unchanged',
  };
}

function planScaleSelectionContent(context: CanvasCommandPlannerContext, factor: number, source: CanvasEditSource, nodeIds?: string[]): CanvasCommandPlan {
  if (!Number.isFinite(factor) || factor <= 0 || factor === 1) return { operations: [], interaction: 'Panel zoom unchanged' };
  return planSetSelectionContentScale(context, (node) => contentScaleForNode(node) * factor, source, nodeIds);
}

function planResetSelectionContentScale(context: CanvasCommandPlannerContext, source: CanvasEditSource, nodeIds?: string[]): CanvasCommandPlan {
  return planSetSelectionContentScale(context, () => DEFAULT_NODE_CONTENT_SCALE, source, nodeIds);
}

function planPanSelectionContent(context: CanvasCommandPlannerContext, dx: number, dy: number, source: CanvasEditSource, nodeIds?: string[]): CanvasCommandPlan {
  if ((!Number.isFinite(dx) || dx === 0) && (!Number.isFinite(dy) || dy === 0)) return { operations: [], interaction: 'Panel pan unchanged' };
  return planSetSelectionContentPan(context, (node) => {
    const viewport = contentViewportForNode(node);
    return { x: viewport.offsetX + (Number.isFinite(dx) ? dx : 0), y: viewport.offsetY + (Number.isFinite(dy) ? dy : 0) };
  }, source, nodeIds);
}

function planResetSelectionContentPan(context: CanvasCommandPlannerContext, source: CanvasEditSource, nodeIds?: string[]): CanvasCommandPlan {
  return planSetSelectionContentPan(context, () => ({ x: 0, y: 0 }), source, nodeIds);
}

function planSetSelectionContentScale(
  context: CanvasCommandPlannerContext,
  nextScaleForNode: (node: CanvasNode) => number,
  source: CanvasEditSource,
  nodeIds?: string[],
): CanvasCommandPlan {
  const nodes = context.contentZoomTargetNodes(nodeIds);
  if (!nodes.length) return { operations: [], interaction: 'Panel zoom no target' };
  const operations: CanvasOperation[] = [];
  for (const node of nodes) {
    const from = contentScaleForNode(node);
    const to = contentScaleForNode({ ...node, appearance: nodeAppearanceWithContentScale(node.appearance, nextScaleForNode(node)) });
    if (from !== to) operations.push({ type: 'set-node-content-scale', nodeId: node.id, from, to });
  }
  const changedNodeIds = operations.map((operation) => operation.type === 'set-node-content-scale' ? operation.nodeId : '').filter(Boolean);
  return {
    operations,
    change: operations.length ? { kind: 'node-content-scale', nodeId: context.primarySelectedNodeId ?? changedNodeIds[0] ?? nodes[0].id, nodeIds: changedNodeIds, source } : undefined,
    interaction: operations.length ? (changedNodeIds.length > 1 ? 'Panel contents zoomed' : 'Panel content zoomed') : 'Panel zoom unchanged',
  };
}

function planSetSelectionContentPan(
  context: CanvasCommandPlannerContext,
  nextPanForNode: (node: CanvasNode) => CanvasNodeContentPan,
  source: CanvasEditSource,
  nodeIds?: string[],
): CanvasCommandPlan {
  const nodes = context.contentZoomTargetNodes(nodeIds);
  if (!nodes.length) return { operations: [], interaction: 'Panel pan no target' };
  const operations: CanvasOperation[] = [];
  for (const node of nodes) {
    const viewport = contentViewportForNode(node);
    const from = { x: viewport.offsetX, y: viewport.offsetY };
    const next = nextPanForNode(node);
    const toAppearance = nodeAppearanceWithContentOffset(node.appearance, next.x, next.y);
    const toViewport = contentViewportForNode({ ...node, appearance: toAppearance });
    const to = { x: toViewport.offsetX, y: toViewport.offsetY };
    if (!sameContentPan(from, to)) operations.push({ type: 'set-node-content-pan', nodeId: node.id, from, to });
  }
  const changedNodeIds = operations.map((operation) => operation.type === 'set-node-content-pan' ? operation.nodeId : '').filter(Boolean);
  return {
    operations,
    change: operations.length ? { kind: 'node-content-pan', nodeId: context.primarySelectedNodeId ?? changedNodeIds[0] ?? nodes[0].id, nodeIds: changedNodeIds, source } : undefined,
    interaction: operations.length ? (changedNodeIds.length > 1 ? 'Panel contents panned' : 'Panel content panned') : 'Panel pan unchanged',
  };
}

function planDeleteSelection(context: CanvasCommandPlannerContext, source: CanvasEditSource): CanvasCommandPlan {
  const ids = context.selectionIds;
  if (!ids.length) return { operations: [], interaction: 'Delete no selection' };
  const nodes = context.selectedNodes.map(cloneNode);
  return {
    operations: [{ type: 'delete-nodes', nodes }, { type: 'set-selection', from: context.selectionState, to: emptySelectionState() }],
    change: { kind: 'node-delete', nodeId: ids[0] ?? null, nodeIds: ids, source },
    interaction: ids.length > 1 ? `Deleted ${ids.length} nodes` : 'Deleted node',
  };
}

function planCopySelection(context: CanvasCommandPlannerContext, source: CanvasEditSource): CanvasCommandPlan {
  const nodes = context.selectedNodes;
  if (!nodes.length) return { operations: [], interaction: 'Copy no selection' };
  const to = nodes.map(cloneNode);
  return {
    operations: [{ type: 'set-clipboard', from: context.clipboard.map(cloneNode), to }],
    interaction: source === 'ai' ? (nodes.length > 1 ? `AI copied ${nodes.length} nodes` : 'AI copied node') : nodes.length > 1 ? `Copied ${nodes.length} nodes` : 'Copied node',
  };
}

function planPasteClipboard(context: CanvasCommandPlannerContext, source: CanvasEditSource): CanvasCommandPlan {
  if (!context.clipboard.length) return { operations: [], interaction: 'Paste no clipboard' };
  const existingIds = new Set(context.model.nodes.map((node) => node.id));
  const offset = SNAP_STEP * context.pasteCounter;
  const pasted = context.clipboard.map((node) => {
    const id = uniqueNodeId(`${node.id}-copy`, existingIds);
    existingIds.add(id);
    const transformed = context.transformPastedNode?.(node) ?? cloneNode(node);
    return { ...transformed, id, x: snapCoordinate(node.x + offset), y: snapCoordinate(node.y + offset) };
  });
  const selection = {
    selectedNodeIds: pasted.map((node) => node.id),
    primarySelectedNodeId: pasted[0]?.id ?? null,
    resizeMode: false,
  };
  return {
    operations: [
      { type: 'create-nodes', nodes: pasted },
      { type: 'set-selection', from: context.selectionState, to: selection },
      { type: 'set-paste-counter', from: context.pasteCounter, to: context.pasteCounter + 1 },
    ],
    change: { kind: 'node-create', nodeId: pasted[0]?.id ?? null, nodeIds: pasted.map((node) => node.id), source },
    interaction: context.pasteInteractionForNodes?.(pasted) ?? (pasted.length > 1 ? `Pasted ${pasted.length} nodes` : 'Pasted node'),
  };
}

function cloneNode(node: CanvasNode): CanvasNode {
  return {
    ...node,
    data: cloneNodeData(node.data),
  };
}

function nodeGeometry(node: CanvasNode): CanvasNodeGeometry {
  return { x: node.x, y: node.y, w: node.w, h: node.h };
}

function sameGeometry(a: CanvasNodeGeometry, b: CanvasNodeGeometry) {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

function sameContentPan(a: CanvasNodeContentPan, b: CanvasNodeContentPan) {
  return a.x === b.x && a.y === b.y;
}

function emptySelectionState(): CanvasSelectionState {
  return { selectedNodeIds: [], primarySelectedNodeId: null, resizeMode: false };
}

function selectInState(state: CanvasSelectionState, nodeId: string, mode: 'replace' | 'toggle' | 'add'): CanvasSelectionState {
  if (mode === 'replace') return { selectedNodeIds: [nodeId], primarySelectedNodeId: nodeId, resizeMode: false };

  const ids = new Set(state.selectedNodeIds);
  if (mode === 'toggle' && ids.has(nodeId)) {
    ids.delete(nodeId);
    const selectedNodeIds = [...ids];
    return {
      selectedNodeIds,
      primarySelectedNodeId: state.primarySelectedNodeId === nodeId ? (selectedNodeIds[0] ?? null) : state.primarySelectedNodeId,
      resizeMode: false,
    };
  }

  ids.add(nodeId);
  return { selectedNodeIds: [...ids], primarySelectedNodeId: nodeId, resizeMode: false };
}

function arraysEqual(a: string[], b: string[]) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function snapCoordinate(value: number) {
  return Math.round(value / SNAP_STEP) * SNAP_STEP;
}

function snapNodeWidth(node: CanvasNode, value: number) {
  return Math.max(nodeDefinitionFor(node).minSize.w, snapCoordinate(value));
}

function snapNodeHeight(node: CanvasNode, value: number) {
  return Math.max(nodeDefinitionFor(node).minSize.h, snapCoordinate(value));
}

function sourceInteraction(source: CanvasEditSource, action: 'selection' | 'move' | 'resize') {
  const label = source === 'ai' ? 'AI' : source.charAt(0).toUpperCase() + source.slice(1);
  return `${label} ${action}`;
}

function uniqueNodeId(base: string, existingIds: Set<string>) {
  const normalized = base.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase() || 'node-copy';
  let candidate = normalized;
  let suffix = 2;
  while (existingIds.has(candidate)) {
    candidate = `${normalized}-${suffix++}`;
  }
  return candidate;
}
