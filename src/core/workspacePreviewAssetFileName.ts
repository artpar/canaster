const INTERNAL_WORKSPACE_PREVIEW_ASSET_PREFIX = '__canaster_internal_workspace_preview_v1__';

export function workspacePreviewAssetFileName(params: {
  documentTitle: string;
  canvasId: string;
  capturedAt: string;
}): string {
  const slug = fileNamePart(params.documentTitle, 'workspace');
  const canvas = fileNamePart(params.canvasId, 'canvas');
  const captured = fileNamePart(params.capturedAt, 'capture');
  return `${INTERNAL_WORKSPACE_PREVIEW_ASSET_PREFIX}${slug}__${canvas}__${captured}.png`;
}

export function isWorkspacePreviewAssetFileName(name: string | null | undefined): boolean {
  return typeof name === 'string' &&
    name.startsWith(INTERNAL_WORKSPACE_PREVIEW_ASSET_PREFIX) &&
    name.toLowerCase().endsWith('.png');
}

function fileNamePart(value: string, fallback: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || fallback;
}
