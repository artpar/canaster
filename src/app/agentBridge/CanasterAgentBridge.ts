import { assertJsonValue } from '../../core/nodeData';
import type { Camera, CanvasArrangeLayout, CanvasNodeGeometry, NodeData, WorldPoint } from '../../domain/types';
import type { CanvasDocumentCollection, CanvasDocumentId } from '../../domain/documentTypes';
import type { WorkspaceUrlState } from '../../infra/browser/workspaceUrlLocation';
import { connectDaptinLive, type DaptinLiveEvent } from '../../infra/daptin/daptinLive';
import type { NestedCanvasWorkspaceHandle } from '../../ui/canvas/nested/NestedCanvasWorkspace';
import { referencedAssetIdsForNode, registeredNodeAddOptions } from '../../ui/canvas/nodeRegistry';
import {
  AGENT_CAPABILITIES,
  AGENT_COMMAND_SCHEMAS,
  AGENT_EVENT_NAMES,
  type AgentError,
  type AgentEventName,
  type AgentRequest,
  CANASTER_AGENT_PROTOCOL,
  agentError,
  isAgentRequest,
  isRecord,
  requestParams,
} from './AgentProtocol';

export type CanasterAgentBridgeInput = {
  appUrl: () => string;
  documentId: string;
  documentTitle: () => string;
  topicName: string;
  bumpStateVersion: () => number;
  reloadDocument: () => Promise<void>;
  saveOnline: () => Promise<void>;
  stateVersion: () => number;
  syncState: () => { status: string; message: string; signedIn: boolean };
  workspace: () => NestedCanvasWorkspaceHandle | null;
};

export type CanasterAgentBridgeConnection = {
  close: () => void;
  emitEvent: (event: AgentEventName, data: unknown) => void;
  topicName: string;
};

type AgentHandlerContext = CanasterAgentBridgeInput & {
  eventSubscriptions: Set<AgentEventName>;
};

class AgentBridgeError extends Error {
  readonly agentError: AgentError;

  constructor(error: AgentError) {
    super(error.message);
    this.agentError = error;
  }
}

const DEFAULT_PREVIEW_MAX_BYTES = 2_000_000;
const DEFAULT_SYNC_WAIT_TIMEOUT_MS = 20_000;
const SYNC_WAIT_POLL_MS = 250;

export function connectCanasterAgentBridge(input: CanasterAgentBridgeInput): CanasterAgentBridgeConnection {
  const topicName = input.topicName;
  const eventSubscriptions = new Set<AgentEventName>();
  const context: AgentHandlerContext = { ...input, eventSubscriptions };
  const live = connectDaptinLive({
    ensureTopicName: topicName,
    topicName,
    onEvent: (event) => {
      void handleAgentLiveEvent(context, live.publish, event).catch((error) => {
        try {
          publishAgentEvent(input.documentId, input.stateVersion(), live.publish, topicName, 'error', {
            message: error instanceof Error ? error.message : String(error),
          });
        } catch {
        }
      });
    },
    onError: (error) => {
      try {
        publishAgentEvent(input.documentId, input.stateVersion(), live.publish, topicName, 'error', {
          message: error instanceof Error ? error.message : String(error),
        });
      } catch {
      }
    },
  });

  return {
    close: live.close,
    topicName,
    emitEvent: (event, data) => {
      if (!eventSubscriptions.has(event)) return;
      try {
        publishAgentEvent(input.documentId, input.stateVersion(), live.publish, topicName, event, data);
      } catch {
      }
    },
  };
}

async function handleAgentLiveEvent(
  context: AgentHandlerContext,
  publish: (topicName: string, message: unknown) => void,
  event: DaptinLiveEvent,
) {
  if (event.topic !== context.topicName || event.event !== 'new-message' || !isAgentRequest(event.data)) return;
  const request = event.data;
  const response = await agentResponseForRequest(context, request);
  publish(context.topicName, response);
}

async function agentResponseForRequest(context: AgentHandlerContext, request: AgentRequest) {
  try {
    if (request.documentId !== context.documentId) {
      throw new AgentBridgeError(agentError('DOCUMENT_MISMATCH', 'This Canaster page has a different document open.'));
    }
    if (typeof request.expectedStateVersion === 'number' && request.expectedStateVersion !== context.stateVersion()) {
      throw new AgentBridgeError(agentError('STATE_CONFLICT', 'The page state changed before this command ran.'));
    }
    const result = await handleAgentRequest(context, request);
    const stateVersion = isMutatingRequest(request) ? context.bumpStateVersion() : context.stateVersion();
    return {
      canasterAgentProtocol: CANASTER_AGENT_PROTOCOL,
      kind: 'response',
      requestId: request.requestId,
      documentId: context.documentId,
      ok: true,
      result,
      stateVersion,
    };
  } catch (error) {
    const bridgeError = error instanceof AgentBridgeError ?
      error.agentError :
      agentError('BAD_REQUEST', error instanceof Error ? error.message : 'Agent command failed.');
    return {
      canasterAgentProtocol: CANASTER_AGENT_PROTOCOL,
      kind: 'response',
      requestId: request.requestId,
      documentId: context.documentId,
      ok: false,
      error: bridgeError,
      stateVersion: context.stateVersion(),
    };
  }
}

async function handleAgentRequest(context: AgentHandlerContext, request: AgentRequest): Promise<unknown> {
  const key = `${request.resource}.${request.action}`;
  switch (key) {
    case 'agent.describe':
      return describeAgent(context);
    case 'account.get':
      return context.syncState();
    case 'sync.get':
      return context.syncState();
    case 'sync.wait':
      return waitForSyncState(context, request);
    case 'workspace.get':
      return workspaceState(context);
    case 'asset.list':
      return assetList(collectionFor(context));
    case 'nodeType.list':
      return registeredNodeAddOptions();
    case 'canvas.list':
      return canvasList(collectionFor(context));
    case 'canvas.get':
      return canvasGet(collectionFor(context), stringParam(request, 'canvasId'));
    case 'canvas.open':
      return openCanvas(context, stringParam(request, 'canvasId'));
    case 'canvas.arrange':
      return arrangeCanvas(context, stringParam(request, 'canvasId'), arrangeLayoutParam(request));
    case 'node.list':
      return nodeList(collectionFor(context), optionalStringParam(request, 'canvasId'));
    case 'node.get':
      return nodeGet(collectionFor(context), stringParam(request, 'canvasId'), stringParam(request, 'nodeId'));
    case 'node.create':
      return nodeCreate(context, request);
    case 'node.update':
      return nodeUpdate(context, request);
    case 'node.move':
      return nodeMove(context, request);
    case 'node.resize':
      return nodeResize(context, request);
    case 'node.delete':
      return nodeDelete(context, request);
    case 'selection.get':
      return selectionGet(collectionFor(context), optionalStringParam(request, 'canvasId'));
    case 'selection.set':
      return selectionSet(context, request);
    case 'selection.clear':
      return selectionClear(context, optionalStringParam(request, 'canvasId'));
    case 'view.get':
      return viewGet(context);
    case 'view.set':
      return viewSet(context, request);
    case 'view.fit':
      return viewFit(context);
    case 'view.zoom':
      return viewZoom(context, numberParam(request, 'factor'));
    case 'preview.capture':
      return previewCapture(context, request);
    case 'document.save':
      await context.saveOnline();
      if (optionalString(requestParams(request).waitFor) === 'clean') await waitForSyncState(context, request, 'clean');
      return workspaceState(context);
    case 'document.reload':
      await context.reloadDocument();
      return workspaceState(context);
    case 'events.subscribe':
      return eventsSubscribe(context, request);
    default:
      throw new AgentBridgeError(agentError('UNSUPPORTED_ACTION', `Unsupported agent action: ${key}`));
  }
}

function describeAgent(context: AgentHandlerContext) {
  return {
    protocol: CANASTER_AGENT_PROTOCOL,
    documentId: context.documentId,
    topicName: context.topicName,
    appUrl: context.appUrl(),
    capabilities: AGENT_CAPABILITIES,
    schemas: AGENT_COMMAND_SCHEMAS,
    events: AGENT_EVENT_NAMES,
    limits: {
      assetUpload: false,
      previewMaxBytesDefault: DEFAULT_PREVIEW_MAX_BYTES,
      syncWaitTimeoutDefaultMs: DEFAULT_SYNC_WAIT_TIMEOUT_MS,
      gridSnapStep: 32,
    },
    envelope: {
      required: ['canasterAgentProtocol', 'kind', 'requestId', 'documentId', 'resource', 'action'],
      kind: 'request',
      params: 'resource-specific JSON object',
    },
    sync: context.syncState(),
    stateVersion: context.stateVersion(),
  };
}

function isMutatingRequest(request: AgentRequest): boolean {
  const key = `${request.resource}.${request.action}`;
  return key === 'canvas.open' ||
    key === 'canvas.arrange' ||
    key === 'node.create' ||
    key === 'node.update' ||
    key === 'node.move' ||
    key === 'node.resize' ||
    key === 'node.delete' ||
    key === 'selection.set' ||
    key === 'selection.clear' ||
    key === 'view.set' ||
    key === 'view.fit' ||
    key === 'view.zoom' ||
    key === 'document.save' ||
    key === 'document.reload';
}

function workspaceState(context: AgentHandlerContext) {
  const collection = collectionFor(context);
  return {
    title: context.documentTitle(),
    documentId: context.documentId,
    sync: context.syncState(),
    stateVersion: context.stateVersion(),
    rootCanvasId: collection.rootCanvasId,
    activeCanvasId: collection.activeCanvasId,
    themeId: collection.appearance.themeId,
    previewImage: collection.appearance.previewImage ?? null,
    canvases: canvasList(collection),
    view: viewGet(context),
  };
}

function canvasList(collection: CanvasDocumentCollection) {
  return Object.values(collection.documents).map((document) => ({
    id: document.id,
    title: document.title,
    parentCanvasId: document.parentCanvasId,
    parentNodeId: document.parentNodeId,
    nodeCount: document.model.nodes.length,
    active: document.id === collection.activeCanvasId,
  }));
}

function assetList(collection: CanvasDocumentCollection) {
  const assetIds = new Set<string>();
  const preview = collection.appearance.previewImage;
  if (preview?.assetId) assetIds.add(preview.assetId);
  for (const document of Object.values(collection.documents)) {
    for (const node of document.model.nodes) {
      for (const assetId of referencedAssetIdsForNode(node)) assetIds.add(assetId);
    }
  }
  return [...assetIds].map((assetId) => ({
    id: assetId,
    preview: preview?.assetId === assetId,
  }));
}

function canvasGet(collection: CanvasDocumentCollection, canvasId: string) {
  const document = collection.documents[canvasId];
  if (!document) throw new AgentBridgeError(agentError('CANVAS_NOT_FOUND', 'Canvas does not exist.'));
  return {
    ...document,
    selection: collection.view.selections[canvasId] ?? emptySelection(),
    camera: collection.view.cameras[canvasId] ?? null,
  };
}

function openCanvas(context: AgentHandlerContext, canvasId: string) {
  const workspace = readyWorkspace(context);
  if (!collectionFor(context).documents[canvasId]) throw new AgentBridgeError(agentError('CANVAS_NOT_FOUND', 'Canvas does not exist.'));
  workspace.executeDocumentCommand({ type: 'select-canvas', canvasId, source: 'ai' });
  return canvasGet(collectionFor(context), canvasId);
}

function arrangeCanvas(context: AgentHandlerContext, canvasId: string, layout: CanvasArrangeLayout) {
  const workspace = readyWorkspace(context);
  if (!collectionFor(context).documents[canvasId]) throw new AgentBridgeError(agentError('CANVAS_NOT_FOUND', 'Canvas does not exist.'));
  workspace.executeDocumentCommand({ type: 'arrange-canvas', canvasId, layout, source: 'ai' });
  return canvasGet(collectionFor(context), canvasId);
}

function nodeList(collection: CanvasDocumentCollection, canvasId: string | null) {
  const id = canvasId || collection.activeCanvasId;
  return canvasGet(collection, id).model.nodes;
}

function nodeGet(collection: CanvasDocumentCollection, canvasId: string, nodeId: string) {
  const node = canvasGet(collection, canvasId).model.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) throw new AgentBridgeError(agentError('NODE_NOT_FOUND', 'Node does not exist in the requested canvas.'));
  return node;
}

function nodeCreate(context: AgentHandlerContext, request: AgentRequest) {
  const params = requestParams(request);
  const canvasId = optionalString(params.canvasId) || collectionFor(context).activeCanvasId;
  const nodeType = stringValue(params.nodeType, 'nodeType');
  const data = params.data === undefined ? undefined : jsonObjectValue(params.data, 'data');
  const at = optionalWorldPoint(params.at);
  const workspace = readyWorkspace(context);
  openCanvas(context, canvasId);
  const beforeIds = new Set(canvasGet(collectionFor(context), canvasId).model.nodes.map((node) => node.id));
  if (!workspace.executeActiveCanvasCommand({ type: 'create-node', nodeType, data, at, source: 'ai' })) {
    throw new AgentBridgeError(agentError('BAD_REQUEST', 'Node could not be created.'));
  }
  const afterCanvas = canvasGet(collectionFor(context), canvasId);
  const createdNode = afterCanvas.model.nodes.find((node) => !beforeIds.has(node.id)) ?? null;
  const selection = selectionGet(collectionFor(context), canvasId);
  if (!createdNode) throw new AgentBridgeError(agentError('BAD_REQUEST', 'Node command completed but no created node was found.'));
  return {
    canvasId,
    createdNodeId: createdNode.id,
    node: createdNode,
    selection,
  };
}

function nodeUpdate(context: AgentHandlerContext, request: AgentRequest) {
  const params = requestParams(request);
  const canvasId = stringValue(params.canvasId, 'canvasId');
  const nodeId = stringValue(params.nodeId, 'nodeId');
  const before = nodeGet(collectionFor(context), canvasId, nodeId);
  const workspace = readyWorkspace(context);
  openCanvas(context, canvasId);
  workspace.executeActiveCanvasCommand({ type: 'select-node', nodeId, mode: 'replace', source: 'ai' });
  if (params.data !== undefined) {
    const to = jsonObjectValue(params.data, 'data');
    workspace.executeDocumentCommand({ type: 'set-node-data', canvasId, nodeId, from: before.data, to, source: 'ai' });
  }
  if (params.themeId !== undefined) {
    workspace.executeDocumentCommand({ type: 'set-node-theme', canvasId, nodeIds: [nodeId], themeId: nullableString(params.themeId, 'themeId'), source: 'ai' });
  }
  const next = nodeGet(collectionFor(context), canvasId, nodeId);
  const requestedX = optionalNumber(params.x);
  const requestedY = optionalNumber(params.y);
  const requestedW = optionalNumber(params.w);
  const requestedH = optionalNumber(params.h);
  const dx = requestedX === null ? 0 : requestedX - next.x;
  const dy = requestedY === null ? 0 : requestedY - next.y;
  if (dx || dy) workspace.executeActiveCanvasCommand({ type: 'move-selection', dx, dy, source: 'ai' });
  const afterMove = nodeGet(collectionFor(context), canvasId, nodeId);
  const dw = requestedW === null ? 0 : requestedW - afterMove.w;
  const dh = requestedH === null ? 0 : requestedH - afterMove.h;
  if (dw || dh) workspace.executeActiveCanvasCommand({ type: 'resize-selection', dw, dh, source: 'ai' });
  const node = nodeGet(collectionFor(context), canvasId, nodeId);
  return {
    canvasId,
    nodeId,
    node,
    requestedGeometry: requestedGeometry(params),
    appliedGeometry: nodeGeometry(node),
  };
}

function nodeMove(context: AgentHandlerContext, request: AgentRequest) {
  const params = requestParams(request);
  const canvasId = stringValue(params.canvasId, 'canvasId');
  const nodeIds = nodeIdsParam(params);
  const dx = numberValue(params.dx, 'dx');
  const dy = numberValue(params.dy, 'dy');
  selectNodes(context, canvasId, nodeIds);
  readyWorkspace(context).executeActiveCanvasCommand({ type: 'move-selection', dx, dy, source: 'ai' });
  return {
    canvasId,
    nodeIds,
    nodes: nodeIds.map((nodeId) => nodeGet(collectionFor(context), canvasId, nodeId)),
    requestedDelta: { dx, dy },
  };
}

function nodeResize(context: AgentHandlerContext, request: AgentRequest) {
  const params = requestParams(request);
  const canvasId = stringValue(params.canvasId, 'canvasId');
  const nodeIds = nodeIdsParam(params);
  const dw = numberValue(params.dw, 'dw');
  const dh = numberValue(params.dh, 'dh');
  selectNodes(context, canvasId, nodeIds);
  readyWorkspace(context).executeActiveCanvasCommand({ type: 'resize-selection', dw, dh, source: 'ai' });
  return {
    canvasId,
    nodeIds,
    nodes: nodeIds.map((nodeId) => nodeGet(collectionFor(context), canvasId, nodeId)),
    requestedDelta: { dw, dh },
  };
}

function nodeDelete(context: AgentHandlerContext, request: AgentRequest) {
  const params = requestParams(request);
  const canvasId = stringValue(params.canvasId, 'canvasId');
  const nodeIds = nodeIdsParam(params);
  const collection = collectionFor(context);
  assertNodeIds(collection, canvasId, nodeIds);
  if (params.confirmDescendants !== true && hasChildCanvasInSelection(collection, canvasId, nodeIds)) {
    throw new AgentBridgeError(agentError('BAD_REQUEST', 'Delete requires confirmDescendants=true because the selection contains child canvases.'));
  }
  const workspace = readyWorkspace(context);
  selectNodes(context, canvasId, nodeIds);
  const deleted = workspace.executeActiveCanvasCommand({ type: 'delete-selection', source: 'ai' });
  const confirmation = collectionFor(context).view.deleteConfirmation;
  if (!deleted && confirmation?.canvasId === canvasId && params.confirmDescendants !== true) {
    throw new AgentBridgeError(agentError('BAD_REQUEST', 'Delete requires confirmDescendants=true because the selection contains child canvases.'));
  }
  if (!deleted && confirmation?.canvasId === canvasId && params.confirmDescendants === true) {
    workspace.executeDocumentCommand({ type: 'confirm-delete-selection', canvasId, source: 'ai' });
  }
  return { deletedNodeIds: nodeIds, canvasId };
}

function selectionGet(collection: CanvasDocumentCollection, canvasId: string | null) {
  const id = canvasId || collection.activeCanvasId;
  if (!collection.documents[id]) throw new AgentBridgeError(agentError('CANVAS_NOT_FOUND', 'Canvas does not exist.'));
  return collection.view.selections[id] ?? emptySelection();
}

function selectionSet(context: AgentHandlerContext, request: AgentRequest) {
  const params = requestParams(request);
  const canvasId = stringValue(params.canvasId, 'canvasId');
  const nodeIds = nodeIdsParam(params);
  selectNodes(context, canvasId, nodeIds);
  return selectionGet(collectionFor(context), canvasId);
}

function selectionClear(context: AgentHandlerContext, canvasId: string | null) {
  const id = canvasId || collectionFor(context).activeCanvasId;
  openCanvas(context, id);
  readyWorkspace(context).executeActiveCanvasCommand({ type: 'clear-selection', source: 'ai' });
  return {
    canvasId: id,
    selection: selectionGet(collectionFor(context), id),
  };
}

function viewGet(context: AgentHandlerContext) {
  return readyWorkspace(context).currentWorkspaceUrlState(context.documentId);
}

function viewSet(context: AgentHandlerContext, request: AgentRequest) {
  const state = workspaceUrlStateParam(requestParams(request), context);
  if (!readyWorkspace(context).openWorkspaceUrlState(state)) {
    throw new AgentBridgeError(agentError('CANVAS_NOT_FOUND', 'View target canvas does not exist.'));
  }
  return viewGet(context);
}

function viewFit(context: AgentHandlerContext) {
  readyWorkspace(context).fitActiveCanvas();
  return viewGet(context);
}

function viewZoom(context: AgentHandlerContext, factor: number) {
  readyWorkspace(context).zoomActiveBy(factor);
  return viewGet(context);
}

async function previewCapture(context: AgentHandlerContext, request: AgentRequest) {
  const params = requestParams(request);
  if (params.canvasId !== undefined || params.fit !== undefined) {
    throw new AgentBridgeError(agentError('BAD_REQUEST', 'preview.capture captures the active canvas only. Open the target canvas first.'));
  }
  const maxBytes = optionalNumber(params.maxBytes) ?? DEFAULT_PREVIEW_MAX_BYTES;
  const capture = await readyWorkspace(context).captureActiveCanvasPreview();
  if (!capture) throw new AgentBridgeError(agentError('NOT_READY', 'Workspace preview is not ready yet.'));
  if (capture.blob.size > maxBytes) {
    throw new AgentBridgeError(agentError('PAYLOAD_TOO_LARGE', `Preview is ${capture.blob.size} bytes, above maxBytes ${maxBytes}.`));
  }
  return {
    mime: capture.blob.type || 'image/png',
    width: capture.width,
    height: capture.height,
    canvasId: capture.canvasId,
    size: capture.blob.size,
    dataUri: await blobToDataUri(capture.blob),
  };
}

function eventsSubscribe(context: AgentHandlerContext, request: AgentRequest) {
  const events = arrayParam(requestParams(request).events, 'events')
    .map((event) => stringValue(event, 'event'))
    .filter((event): event is AgentEventName => (AGENT_EVENT_NAMES as readonly string[]).includes(event));
  if (!events.length) throw new AgentBridgeError(agentError('BAD_REQUEST', 'events must contain at least one supported event name.'));
  for (const event of events) context.eventSubscriptions.add(event);
  return { subscribed: [...context.eventSubscriptions] };
}

async function waitForSyncState(context: AgentHandlerContext, request: AgentRequest, fallbackStatus?: string) {
  const params = requestParams(request);
  const target = fallbackStatus ?? optionalString(params.status) ?? 'clean';
  const timeoutMs = optionalNumber(params.timeoutMs) ?? DEFAULT_SYNC_WAIT_TIMEOUT_MS;
  const started = Date.now();
  while (Date.now() - started <= timeoutMs) {
    const sync = context.syncState();
    if (sync.status === target || sync.status === 'dirty' || sync.status === 'error') return sync;
    await sleep(SYNC_WAIT_POLL_MS);
  }
  return context.syncState();
}

function selectNodes(context: AgentHandlerContext, canvasId: string, nodeIds: string[]) {
  assertNodeIds(collectionFor(context), canvasId, nodeIds);
  const workspace = readyWorkspace(context);
  openCanvas(context, canvasId);
  workspace.executeActiveCanvasCommand({ type: 'clear-selection', source: 'ai' });
  nodeIds.forEach((nodeId, index) => {
    nodeGet(collectionFor(context), canvasId, nodeId);
    workspace.executeActiveCanvasCommand({ type: 'select-node', nodeId, mode: index === 0 ? 'replace' : 'add', source: 'ai' });
  });
}

function assertNodeIds(collection: CanvasDocumentCollection, canvasId: string, nodeIds: string[]) {
  const canvas = canvasGet(collection, canvasId);
  const availableIds = new Set(canvas.model.nodes.map((node) => node.id));
  const missingId = nodeIds.find((nodeId) => !availableIds.has(nodeId));
  if (missingId) throw new AgentBridgeError(agentError('NODE_NOT_FOUND', `Node ${missingId} does not exist in the requested canvas.`));
}

function hasChildCanvasInSelection(collection: CanvasDocumentCollection, canvasId: string, nodeIds: string[]) {
  const selectedIds = new Set(nodeIds);
  return Object.values(collection.documents).some((document) =>
    document.parentCanvasId === canvasId &&
    typeof document.parentNodeId === 'string' &&
    selectedIds.has(document.parentNodeId));
}

function collectionFor(context: AgentHandlerContext): CanvasDocumentCollection {
  return readyWorkspace(context).collection();
}

function readyWorkspace(context: AgentHandlerContext): NestedCanvasWorkspaceHandle {
  const workspace = context.workspace();
  if (!workspace) throw new AgentBridgeError(agentError('NOT_READY', 'Canaster workspace is not ready yet.'));
  return workspace;
}

function publishAgentEvent(
  documentId: string,
  stateVersion: number,
  publish: (topicName: string, message: unknown) => void,
  topicName: string,
  event: AgentEventName,
  data: unknown,
) {
  publish(topicName, {
    canasterAgentProtocol: CANASTER_AGENT_PROTOCOL,
    kind: 'event',
    documentId,
    event,
    data,
    stateVersion,
  });
}

function stringParam(request: AgentRequest, key: string): string {
  return stringValue(requestParams(request)[key], key);
}

function optionalStringParam(request: AgentRequest, key: string): string | null {
  return optionalString(requestParams(request)[key]);
}

function numberParam(request: AgentRequest, key: string): number {
  return numberValue(requestParams(request)[key], key);
}

function arrangeLayoutParam(request: AgentRequest): CanvasArrangeLayout {
  const value = stringParam(request, 'layout');
  if (value === 'grid' || value === 'rows' || value === 'columns' || value === 'list') return value;
  throw new AgentBridgeError(agentError('BAD_REQUEST', 'layout must be grid, rows, columns, or list.'));
}

function nodeIdsParam(params: Record<string, unknown>): string[] {
  if (typeof params.nodeId === 'string') return [params.nodeId];
  return arrayParam(params.nodeIds, 'nodeIds').map((value) => stringValue(value, 'nodeId'));
}

function workspaceUrlStateParam(params: Record<string, unknown>, context: AgentHandlerContext): WorkspaceUrlState {
  const current = viewGet(context);
  if (!current) throw new AgentBridgeError(agentError('NOT_READY', 'Current view state is not ready.'));
  const activeCanvasId = optionalString(params.activeCanvasId) || current.activeCanvasId;
  return {
    documentId: context.documentId,
    activeCanvasId,
    activeCamera: cameraParam(params.activeCamera ?? params.camera, current.activeCamera),
    paneCameras: current.paneCameras,
  };
}

function cameraParam(value: unknown, fallback: Camera): Camera {
  if (value === undefined || value === null) return fallback;
  if (!isRecord(value)) throw new AgentBridgeError(agentError('BAD_REQUEST', 'camera must be an object.'));
  return {
    x: numberValue(value.x, 'camera.x'),
    y: numberValue(value.y, 'camera.y'),
    scale: positiveNumberValue(value.scale, 'camera.scale'),
  };
}

function optionalWorldPoint(value: unknown): WorldPoint | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value)) throw new AgentBridgeError(agentError('BAD_REQUEST', 'at must be an object.'));
  return { x: numberValue(value.x, 'at.x'), y: numberValue(value.y, 'at.y') };
}

function jsonObjectValue(value: unknown, key: string): NodeData {
  if (!isRecord(value)) throw new AgentBridgeError(agentError('BAD_REQUEST', `${key} must be a JSON object.`));
  assertJsonValue(value);
  return value;
}

function nullableString(value: unknown, key: string): string | null {
  if (value === null) return null;
  return stringValue(value, key);
}

function stringValue(value: unknown, key: string): string {
  if (typeof value === 'string' && value) return value;
  throw new AgentBridgeError(agentError('BAD_REQUEST', `${key} must be a non-empty string.`));
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function numberValue(value: unknown, key: string): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  throw new AgentBridgeError(agentError('BAD_REQUEST', `${key} must be a finite number.`));
}

function positiveNumberValue(value: unknown, key: string): number {
  const number = numberValue(value, key);
  if (number <= 0) throw new AgentBridgeError(agentError('BAD_REQUEST', `${key} must be positive.`));
  return number;
}

function optionalNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function arrayParam(value: unknown, key: string): unknown[] {
  if (Array.isArray(value)) return value;
  throw new AgentBridgeError(agentError('BAD_REQUEST', `${key} must be an array.`));
}

function emptySelection() {
  return { selectedNodeIds: [], primarySelectedNodeId: null, resizeMode: false };
}

function nodeGeometry(node: CanvasNodeGeometry): CanvasNodeGeometry {
  return {
    x: node.x,
    y: node.y,
    w: node.w,
    h: node.h,
  };
}

function requestedGeometry(params: Record<string, unknown>): Partial<CanvasNodeGeometry> {
  const geometry: Partial<CanvasNodeGeometry> = {};
  const x = optionalNumber(params.x);
  const y = optionalNumber(params.y);
  const w = optionalNumber(params.w);
  const h = optionalNumber(params.h);
  if (x !== null) geometry.x = x;
  if (y !== null) geometry.y = y;
  if (w !== null) geometry.w = w;
  if (h !== null) geometry.h = h;
  return geometry;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result ?? '')));
    reader.addEventListener('error', () => reject(reader.error ?? new Error('Could not read preview image.')));
    reader.readAsDataURL(blob);
  });
}
