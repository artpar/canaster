import type { CanvasDocumentId, ParentContextRegion } from '../../domain/documentTypes';
import type { Camera } from '../../domain/types';

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
  shareUsername?: string;
  shareSlug?: string;
  activeCanvasId: CanvasDocumentId;
  activeCamera: Camera;
  paneCameras: WorkspaceUrlPaneCamera[];
};

const STATE_PARAM = 's';
const SHARE_PATH_PREFIX = '/d/';
const VERSION = 'v1';
const ROOT_CANVAS_ID = 'root';
const DEFAULT_CAMERA: Camera = { x: 0, y: 0, scale: 1 };

export function readWorkspaceUrlState(search = window.location.search, pathname = window.location.pathname): WorkspaceUrlState | null {
  const params = new URLSearchParams(search);
  return parseWorkspaceUrlState(params.get(STATE_PARAM)) ?? workspaceUrlStateFromSharePath(pathname);
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

export function shareDocumentUrl(username: string, slug: string, baseUrl = window.location.href): string {
  const url = new URL(baseUrl);
  url.pathname = `${SHARE_PATH_PREFIX}${encodeURIComponent(username.trim())}/${encodeURIComponent(slug.trim())}`;
  url.search = '';
  url.hash = '';
  return url.toString();
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

function workspaceUrlStateFromSharePath(pathname: string): WorkspaceUrlState | null {
  const sharePath = sharePathParts(pathname);
  if (!sharePath) return null;
  return {
    documentId: null,
    shareUsername: sharePath.username,
    shareSlug: sharePath.slug,
    activeCanvasId: ROOT_CANVAS_ID,
    activeCamera: DEFAULT_CAMERA,
    paneCameras: [],
  };
}

function sharePathParts(pathname: string): { username: string; slug: string } | null {
  if (!pathname.startsWith(SHARE_PATH_PREFIX)) return null;
  const [rawUsername = '', rawSlug = ''] = pathname.slice(SHARE_PATH_PREFIX.length).split('/');
  const username = decodePart(rawUsername).trim();
  const slug = decodePart(rawSlug).trim();
  return username && slug ? { username, slug } : null;
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
