import { safeDocumentSlug } from './documentSlug';

export function publicAccountSlugFromEmail(email: string): string {
  const localPart = email.trim().toLowerCase().split('@')[0] ?? '';
  return safeDocumentSlug(localPart || email).toLowerCase();
}

export function publicAccountSlugFromName(name: string): string {
  return safeDocumentSlug(name).toLowerCase();
}

export function publicAccountSlugFromIdentity(name: string, email: string): string {
  return publicAccountSlugFromName(name) || publicAccountSlugFromEmail(email);
}
