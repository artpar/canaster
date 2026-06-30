export function safeDocumentSlug(title: string): string {
  return (title.trim() || 'Untitled').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'Untitled';
}
