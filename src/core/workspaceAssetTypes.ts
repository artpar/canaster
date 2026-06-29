export type WorkspaceAssetKind = 'image' | 'pdf' | 'markdown' | 'unsupported';

const MARKDOWN_EXTENSIONS = ['.md', '.markdown'] as const;
const MARKDOWN_MIME_TYPES = new Set(['text/markdown', 'text/x-markdown']);

export function workspaceAssetKindForFile(file: File): WorkspaceAssetKind {
  return workspaceAssetKindForMimeName(file.type, file.name);
}

export function workspaceAssetKindForMimeName(mime: string | null | undefined, name: string | null | undefined): WorkspaceAssetKind {
  if (isImageAssetMime(mime)) return 'image';
  if (isPdfAssetMime(mime) || hasExtension(name, '.pdf')) return 'pdf';
  if (isMarkdownAssetMime(mime) || hasMarkdownAssetName(name)) return 'markdown';
  return 'unsupported';
}

export function isSupportedWorkspaceAssetFile(file: File): boolean {
  return workspaceAssetKindForFile(file) !== 'unsupported';
}

export function isImageAssetMime(mime: string | null | undefined): boolean {
  return typeof mime === 'string' && mime.startsWith('image/');
}

export function isPdfAssetMime(mime: string | null | undefined): boolean {
  return typeof mime === 'string' && mime.toLowerCase() === 'application/pdf';
}

export function isMarkdownAssetMime(mime: string | null | undefined): boolean {
  return typeof mime === 'string' && MARKDOWN_MIME_TYPES.has(mime.toLowerCase());
}

export function hasMarkdownAssetName(name: string | null | undefined): boolean {
  return MARKDOWN_EXTENSIONS.some((extension) => hasExtension(name, extension));
}

export function cleanAssetTitle(name: string, fallback: string): string {
  return name.replace(/\.[a-z0-9]+$/i, '').trim() || fallback;
}

function hasExtension(name: string | null | undefined, extension: string): boolean {
  return typeof name === 'string' && name.toLowerCase().endsWith(extension);
}
