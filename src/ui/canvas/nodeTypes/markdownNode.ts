import { cleanAssetTitle, workspaceAssetKindForFile } from '../../../core/workspaceAssetTypes';
import { defineNodeType } from '../nodeDefinition/defineNodeType';
import { markdownNodeSemanticDefinition, type MarkdownNodeData } from '../../../domain/nodeDefinitions/markdownNodeSemanticDefinition';
import { drawNodeMeta } from '../nodeRendering';
import { createFilePreviewShell, loadFileAssetFile, saveFileAsset } from './fileAssetPreview';
import {
  drawMarkdownCanvasBlocks,
  drawMarkdownCanvasPreview,
  parseMarkdownCanvasBlocks,
  type MarkdownCanvasBlock,
} from './markdownCanvasPreview';
import { nodeEditInteractionRegion } from './nodeContentInteractionRegion';
import { nodeTypeSpecs } from '../nodeDefinition/nodeTypeSpecs';
import type { NodeContentRect, NodeDefinition } from '../nodeDefinition/nodeDefinitionTypes';
import type { CanvasTheme } from '../theme';
import { renderMarkdownHtml } from './renderMarkdownHtml';

export const markdownNodeDefinition: NodeDefinition<MarkdownNodeData> = defineNodeType({
  ...nodeTypeSpecs.md,
  createDefaultData: markdownNodeSemanticDefinition.createDefaultData,
  parseData: markdownNodeSemanticDefinition.parseData,
  render({ ctx, data, theme, contentRect, visibleContentRect, requestRender, state }) {
    if (state.quality === 'compact' && !state.selected && !state.hovered) return;
    drawMarkdownPreview(ctx, contentRect, visibleContentRect, data, theme, requestRender);
  },
  describe: markdownNodeSemanticDefinition.describe,
  getInteractionRegions({ contentRect }) {
    return nodeEditInteractionRegion(contentRect, 'pointer', 'open Markdown preview');
  },
  createInteraction(ctx) {
    if (ctx.region.id !== 'edit') return null;
    return createMarkdownPreview(ctx.mount, ctx.data, (nextData) => ctx.requestCommit(nextData), ctx.requestClose);
  },
  referencedAssetIds({ data }) {
    return data.assetId ? [data.assetId] : [];
  },
});

function drawMarkdownPreview(
  ctx: CanvasRenderingContext2D,
  rect: NodeContentRect,
  visibleRect: NodeContentRect,
  data: MarkdownNodeData,
  theme: CanvasTheme,
  requestRender: () => void,
) {
  drawNodeMeta(ctx, rect, data.assetId ? 'Markdown document' : 'Add a Markdown file', theme, 0);
  const assetBlocks = markdownBlocksForCanvas(data, requestRender);
  if (assetBlocks) {
    drawMarkdownCanvasBlocks(ctx, rect, assetBlocks, theme, visibleRect);
    return;
  }
  drawMarkdownCanvasPreview(ctx, rect, markdownPreviewTextForCanvas(data), theme, visibleRect);
}

function createMarkdownPreview(mount: HTMLElement, data: MarkdownNodeData, commit: (nextData: MarkdownNodeData) => void, close: () => void) {
  const shell = createFilePreviewShell(mount, 'node-inline-markdown-preview', data.title || 'Markdown');
  let disposed = false;
  shell.closeButton.addEventListener('click', close);
  if (!data.assetId) {
    renderMarkdownAttach(shell.body, data, commit, close);
  } else {
    shell.setMessage('Loading Markdown');
    void loadFileAssetFile(data.assetId)
      .then((file) => file.text())
      .then((text) => {
        if (disposed) return;
        shell.body.replaceChildren();
        const preview = document.createElement('article');
        preview.className = 'markdown-preview-document';
        preview.innerHTML = renderMarkdownHtml(text);
        openMarkdownLinksInNewTabs(preview);
        shell.body.append(preview);
      })
      .catch((error) => {
        if (!disposed) shell.setMessage(error instanceof Error ? error.message : 'Could not load Markdown');
      });
  }
  return {
    focus() {
      shell.body.querySelector<HTMLElement>('input, button, a')?.focus({ preventScroll: true });
    },
    dispose() {
      disposed = true;
    },
  };
}

function openMarkdownLinksInNewTabs(root: HTMLElement) {
  for (const anchor of root.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
  }
  root.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest<HTMLAnchorElement>('a[href]');
    if (!anchor || !root.contains(anchor)) return;
    event.preventDefault();
    event.stopPropagation();
    window.open(anchor.href, '_blank', 'noopener,noreferrer');
  });
}

function renderMarkdownAttach(body: HTMLElement, data: MarkdownNodeData, commit: (nextData: MarkdownNodeData) => void, close: () => void) {
  body.replaceChildren();
  const panel = document.createElement('div');
  panel.className = 'file-attach-panel';

  const message = document.createElement('p');
  message.className = 'file-preview-message';
  message.textContent = 'Attach a Markdown file to this panel.';

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.md,.markdown,text/markdown,text/x-markdown';
  input.setAttribute('aria-label', 'Choose Markdown file');
  input.addEventListener('change', () => {
    const file = input.files?.[0] ?? null;
    if (!file) return;
    if (workspaceAssetKindForFile(file) !== 'markdown') {
      message.textContent = 'Choose a Markdown file.';
      input.value = '';
      return;
    }
    message.textContent = 'Attaching Markdown';
    input.disabled = true;
    void saveFileAsset(file)
      .then((asset) => {
        const title = cleanAssetTitle(asset.name || file.name, 'Markdown');
        commit({
          ...data,
          assetId: asset.id,
          title,
          fileName: asset.name || file.name || 'note.md',
          mime: asset.mime || file.type || 'text/markdown',
          markdownText: '',
        });
        close();
      })
      .catch((error) => {
        input.disabled = false;
        input.value = '';
        message.textContent = error instanceof Error ? error.message : 'Could not attach Markdown';
      });
  });

  panel.append(message, input);
  body.append(panel);
}

type MarkdownAssetBlockCacheEntry =
  | { status: 'loading' }
  | { status: 'ready'; blocks: MarkdownCanvasBlock[] }
  | { status: 'error' };

const MAX_MARKDOWN_ASSET_BLOCK_CACHE_ENTRIES = 16;
const markdownAssetBlockCache = new Map<string, MarkdownAssetBlockCacheEntry>();

function markdownBlocksForCanvas(data: MarkdownNodeData, requestRender: () => void): MarkdownCanvasBlock[] | null {
  if (!data.assetId) return null;
  const cached = markdownAssetBlockCache.get(data.assetId);
  if (cached?.status === 'ready') {
    markdownAssetBlockCache.delete(data.assetId);
    markdownAssetBlockCache.set(data.assetId, cached);
    return cached.blocks;
  }
  if (cached?.status === 'loading' || cached?.status === 'error') return null;

  markdownAssetBlockCache.set(data.assetId, { status: 'loading' });
  void loadFileAssetFile(data.assetId)
    .then((file) => file.text())
    .then((text) => {
      markdownAssetBlockCache.set(data.assetId, { status: 'ready', blocks: parseMarkdownCanvasBlocks(text) });
      trimMarkdownAssetBlockCache();
      requestRender();
    })
    .catch(() => {
      markdownAssetBlockCache.set(data.assetId, { status: 'error' });
      requestRender();
    });
  return null;
}

function markdownPreviewTextForCanvas(data: MarkdownNodeData): string {
  if (!data.assetId) return 'No file attached';
  const cached = markdownAssetBlockCache.get(data.assetId);
  if (cached?.status === 'error') return 'Could not load Markdown';
  return 'Loading Markdown';
}

function trimMarkdownAssetBlockCache(): void {
  while (markdownAssetBlockCache.size > MAX_MARKDOWN_ASSET_BLOCK_CACHE_ENTRIES) {
    const oldest = markdownAssetBlockCache.keys().next();
    if (oldest.done) return;
    markdownAssetBlockCache.delete(oldest.value);
  }
}
