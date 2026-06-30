export const CANASTER_AGENT_PROTOCOL = 'v1';

export type AgentMessageKind = 'request' | 'response' | 'event';

export type AgentRequest = {
  canasterAgentProtocol: typeof CANASTER_AGENT_PROTOCOL;
  kind: 'request';
  requestId: string;
  documentId: string;
  resource: string;
  action: string;
  params?: Record<string, unknown>;
  expectedStateVersion?: number;
};

export type AgentResponse = {
  canasterAgentProtocol: typeof CANASTER_AGENT_PROTOCOL;
  kind: 'response';
  requestId: string;
  documentId: string;
  ok: boolean;
  result?: unknown;
  error?: AgentError;
  stateVersion: number;
};

export type AgentEvent = {
  canasterAgentProtocol: typeof CANASTER_AGENT_PROTOCOL;
  kind: 'event';
  documentId: string;
  event: string;
  data: unknown;
  stateVersion: number;
};

export type AgentErrorCode =
  | 'BAD_REQUEST'
  | 'CANVAS_NOT_FOUND'
  | 'DOCUMENT_MISMATCH'
  | 'NODE_NOT_FOUND'
  | 'NOT_READY'
  | 'PAYLOAD_TOO_LARGE'
  | 'STATE_CONFLICT'
  | 'UNSUPPORTED_ACTION';

export type AgentError = {
  code: AgentErrorCode;
  message: string;
  recoverable: boolean;
};

export type AgentCapability = {
  resource: string;
  actions: string[];
};

export type AgentCommandSchema = {
  resource: string;
  action: string;
  params: Record<string, string>;
  result: string;
  notes?: string[];
};

export const AGENT_CAPABILITIES: AgentCapability[] = [
  { resource: 'agent', actions: ['describe'] },
  { resource: 'account', actions: ['get'] },
  { resource: 'sync', actions: ['get', 'wait'] },
  { resource: 'workspace', actions: ['get'] },
  { resource: 'asset', actions: ['list'] },
  { resource: 'nodeType', actions: ['list'] },
  { resource: 'canvas', actions: ['list', 'get', 'open', 'arrange'] },
  { resource: 'node', actions: ['list', 'get', 'create', 'update', 'move', 'resize', 'delete'] },
  { resource: 'selection', actions: ['get', 'set', 'clear'] },
  { resource: 'view', actions: ['get', 'set', 'fit', 'zoom'] },
  { resource: 'preview', actions: ['capture'] },
  { resource: 'document', actions: ['save', 'reload'] },
  { resource: 'events', actions: ['subscribe'] },
];

export const AGENT_COMMAND_SCHEMAS: AgentCommandSchema[] = [
  {
    resource: 'agent',
    action: 'describe',
    params: {},
    result: 'Protocol metadata, capabilities, command schemas, limits, current sync state, and current stateVersion.',
  },
  {
    resource: 'sync',
    action: 'get',
    params: {},
    result: '{ status, message, signedIn }',
  },
  {
    resource: 'sync',
    action: 'wait',
    params: { status: '"clean" | "dirty" | "error" | "saving" | "loading"', timeoutMs: 'optional number' },
    result: '{ status, message, signedIn } after the requested status or a terminal dirty/error state is observed.',
  },
  {
    resource: 'workspace',
    action: 'get',
    params: {},
    result: 'Workspace title, sync, stateVersion, activeCanvasId, previewImage, canvases, and view.',
  },
  {
    resource: 'asset',
    action: 'list',
    params: {},
    result: 'Referenced asset ids, including the saved workspace preview asset when available.',
    notes: ['Asset upload is not supported by this protocol version. Use existing asset ids only.'],
  },
  {
    resource: 'canvas',
    action: 'get',
    params: { canvasId: 'required string' },
    result: 'Canvas document including model.nodes, selection, and camera.',
  },
  {
    resource: 'node',
    action: 'create',
    params: { canvasId: 'optional string, defaults to active canvas', nodeType: 'required string', data: 'optional object', at: 'optional { x, y } center point' },
    result: '{ canvasId, createdNodeId, node, selection }',
    notes: ['Creation snaps the node origin to the canvas grid. Verify final x/y/w/h from result.node or canvas.get.'],
  },
  {
    resource: 'node',
    action: 'update',
    params: { canvasId: 'required string', nodeId: 'required string', data: 'optional object', themeId: 'optional string|null', x: 'optional number', y: 'optional number', w: 'optional number', h: 'optional number' },
    result: '{ canvasId, nodeId, node, requestedGeometry, appliedGeometry }',
    notes: ['Use node.update for absolute x/y/w/h. Applied geometry may be grid-snapped or constrained by node minimum size.'],
  },
  {
    resource: 'node',
    action: 'move',
    params: { canvasId: 'required string', nodeId: 'string or nodeIds array', dx: 'required number', dy: 'required number' },
    result: '{ canvasId, nodeIds, nodes, requestedDelta }',
    notes: ['Use node.move for deltas. Applied x/y may be grid-snapped.'],
  },
  {
    resource: 'node',
    action: 'resize',
    params: { canvasId: 'required string', nodeId: 'string or nodeIds array', dw: 'required number', dh: 'required number' },
    result: '{ canvasId, nodeIds, nodes, requestedDelta }',
    notes: ['Use node.resize for deltas. Applied w/h may be grid-snapped or constrained by node minimum size.'],
  },
  {
    resource: 'selection',
    action: 'clear',
    params: { canvasId: 'optional string, defaults to active canvas' },
    result: '{ canvasId, selection }',
  },
  {
    resource: 'preview',
    action: 'capture',
    params: { maxBytes: 'optional number' },
    result: '{ mime, width, height, canvasId, size, dataUri }',
    notes: ['Captures the active canvas view. Open the desired canvas first; canvasId and fit options are not currently accepted.'],
  },
  {
    resource: 'document',
    action: 'save',
    params: { waitFor: 'optional "clean"', timeoutMs: 'optional number' },
    result: 'Workspace state after save. With waitFor:"clean", waits for sync.status clean, dirty, or error before returning.',
  },
  {
    resource: 'events',
    action: 'subscribe',
    params: { events: 'array of supported event names' },
    result: '{ subscribed }',
  },
];

export const AGENT_EVENT_NAMES = [
  'workspace.changed',
  'selection.changed',
  'view.changed',
  'sync.changed',
  'document.saved',
  'error',
] as const;

export type AgentEventName = typeof AGENT_EVENT_NAMES[number];

export function agentTopicName(documentId: string, pageId: string): string {
  return `canaster.agent.${documentId}.${pageId}`;
}

export function isAgentRequest(value: unknown): value is AgentRequest {
  if (!isRecord(value)) return false;
  return value.canasterAgentProtocol === CANASTER_AGENT_PROTOCOL &&
    value.kind === 'request' &&
    typeof value.requestId === 'string' &&
    typeof value.documentId === 'string' &&
    typeof value.resource === 'string' &&
    typeof value.action === 'string';
}

export function agentError(code: AgentErrorCode, message: string, recoverable = true): AgentError {
  return { code, message, recoverable };
}

export function requestParams(request: AgentRequest): Record<string, unknown> {
  return isRecord(request.params) ? request.params : {};
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
