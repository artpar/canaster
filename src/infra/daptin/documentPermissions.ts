export type DocumentVisibility = 'private' | 'public';

export const PRIVATE_DOCUMENT_PERMISSION = 16256;
export const PUBLIC_DOCUMENT_PERMISSION = 16259;

export function documentVisibilityFromPermission(permission: number): DocumentVisibility {
  return permission === PUBLIC_DOCUMENT_PERMISSION ? 'public' : 'private';
}
