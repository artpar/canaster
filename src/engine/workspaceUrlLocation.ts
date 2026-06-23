import type { CanvasDocumentId, ParentContextRegion } from './documentTypes';
import type { Camera } from './types';

export type WorkspaceUrlPaneCamera = {
  ownerCanvasId: CanvasDocumentId;
  parentCanvasId: CanvasDocumentId;
  sourceNodeId: string;
  region: ParentContextRegion;
  targetSignature: string;
  camera: Camera;
};

export type WorkspaceUrlState = {
  documentId: string | null;
  activeCanvasId: CanvasDocumentId;
  activeCamera: Camera;
  paneCameras: WorkspaceUrlPaneCamera[];
};

const STATE_PARAM = 's';
const VERSION = 'v1';

export function readWorkspaceUrlState(search = window.location.search): WorkspaceUrlState | null {
  const params = new URLSearchParams(search);
  return parseWorkspaceUrlState(params.get(STATE_PARAM));
}

export function replaceWorkspaceUrlState(state: WorkspaceUrlState) {
  const url = new URL(window.location.href);
  url.searchParams.delete('doc');
  url.searchParams.delete('view');
  url.searchParams.delete('camera');
  url.searchParams.set(STATE_PARAM, serializeWorkspaceUrlState(state));
  const next = `${url.pathname}${url.search}${url.hash}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next === current) return;
  window.history.replaceState(window.history.state, '', next);
}

export function serializeWorkspaceUrlState(state: WorkspaceUrlState): string {
  return [
    VERSION,
    encodePart(state.documentId ?? ''),
    encodePart(state.activeCanvasId),
    serializeCamera(state.activeCamera),
    state.paneCameras.map(serializePaneCamera).join(';'),
  ].join('~');
}

export function parseWorkspaceUrlState(value: string | null): WorkspaceUrlState | null {
  if (!value) return null;
  const [version, rawDocumentId = '', rawActiveCanvasId = '', rawActiveCamera = '', rawPaneCameras = ''] = value.split('~');
  if (version !== VERSION) return null;
  const activeCanvasId = decodePart(rawActiveCanvasId);
  const activeCamera = parseCamera(rawActiveCamera);
  if (!activeCanvasId || !activeCamera) return null;
  return {
    documentId: decodePart(rawDocumentId) || null,
    activeCanvasId,
    activeCamera,
    paneCameras: parsePaneCameras(rawPaneCameras),
  };
}

function serializePaneCamera(pane: WorkspaceUrlPaneCamera): string {
  return [
    encodePart(pane.ownerCanvasId),
    encodePart(pane.parentCanvasId),
    encodePart(pane.sourceNodeId),
    pane.region,
    encodePart(pane.targetSignature),
    serializeCamera(pane.camera),
  ].join(':');
}

function parsePaneCameras(value: string): WorkspaceUrlPaneCamera[] {
  if (!value) return [];
  return value
    .split(';')
    .map((entry) => {
      const [
        rawOwnerCanvasId = '',
        rawParentCanvasId = '',
        rawSourceNodeId = '',
        rawRegion = '',
        rawTargetSignature = '',
        rawCamera = '',
      ] = entry.split(':');
      const ownerCanvasId = decodePart(rawOwnerCanvasId);
      const parentCanvasId = decodePart(rawParentCanvasId);
      const sourceNodeId = decodePart(rawSourceNodeId);
      const region = parseParentContextRegion(rawRegion);
      const targetSignature = decodePart(rawTargetSignature);
      const camera = parseCamera(rawCamera);
      if (!ownerCanvasId || !parentCanvasId || !sourceNodeId || !region || !targetSignature || !camera) return null;
      return { ownerCanvasId, parentCanvasId, sourceNodeId, region, targetSignature, camera };
    })
    .filter((pane): pane is WorkspaceUrlPaneCamera => Boolean(pane));
}

function parseParentContextRegion(value: string): ParentContextRegion | null {
  if (
    value === 'top' ||
    value === 'top-right' ||
    value === 'right' ||
    value === 'bottom-right' ||
    value === 'bottom' ||
    value === 'bottom-left' ||
    value === 'left' ||
    value === 'top-left'
  ) {
    return value;
  }
  return null;
}

function encodePart(value: string): string {
  return encodeURIComponent(value).replace(/~/g, '%7E');
}

function decodePart(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return '';
  }
}

function parseCamera(value: string | null): Camera | null {
  if (!value) return null;
  const parts = value.split(',').map((part) => Number(part));
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return null;
  const [x, y, scale] = parts;
  if (scale <= 0) return null;
  return { x, y, scale };
}

function serializeCamera(camera: Camera): string {
  return [
    formatNumber(camera.x, 2),
    formatNumber(camera.y, 2),
    formatNumber(camera.scale, 4),
  ].join(',');
}

function formatNumber(value: number, fractionDigits: number): string {
  return Number(value.toFixed(fractionDigits)).toString();
}
