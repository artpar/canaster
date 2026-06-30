export const MAX_MARKDOWN_NODE_TEXT_CHARS = 20000;

export function boundedMarkdownNodeText(value: string): string {
  return value.trim().slice(0, MAX_MARKDOWN_NODE_TEXT_CHARS);
}
