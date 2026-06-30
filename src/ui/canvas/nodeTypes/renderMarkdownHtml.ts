import DOMPurify from 'dompurify';
import MarkdownIt from 'markdown-it';

const markdown = new MarkdownIt({
  breaks: false,
  html: true,
  linkify: true,
  typographer: false,
});

export function renderMarkdownHtml(markdownText: string): string {
  const html = markdown.render(markdownText || 'Empty Markdown file');
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
  });
}
