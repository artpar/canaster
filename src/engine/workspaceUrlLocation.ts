import type { CanvasDocumentId } from './documentTypes';
import type { Camera } from './types';

export type WorkspaceUrlLocation = {
  documentId: string | null;
  viewId: CanvasDocumentId | null;
  camera: Camera | null;
};

const DOCUMENT_PARAM = 'doc';
const VIEW_PARAM = 'view';
const CAMERA_PARAM = 'camera';

export function readWorkspaceUrlLocation(search = window.location.search): WorkspaceUrlLocation {
  const params = new URLSearchParams(search);
  return {
    documentId: cleanParam(params.get(DOCUMENT_PARAM)),
    viewId: cleanParam(params.get(VIEW_PARAM)),
    camera: parseCamera(params.get(CAMERA_PARAM)),
  };
}

export function replaceWorkspaceUrlLocation(location: WorkspaceUrlLocation) {
  const url = new URL(window.location.href);
  setParam(url.searchParams, DOCUMENT_PARAM, location.documentId);
  setParam(url.searchParams, VIEW_PARAM, location.viewId);
  setParam(url.searchParams, CAMERA_PARAM, location.camera ? serializeCamera(location.camera) : null);
  const next = `${url.pathname}${url.search}${url.hash}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next === current) return;
  window.history.replaceState(window.history.state, '', next);
}

function setParam(params: URLSearchParams, key: string, value: string | null) {
  if (value) params.set(key, value);
  else params.delete(key);
}

function cleanParam(value: string | null): string | null {
  const next = value?.trim() ?? '';
  return next ? next : null;
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
