import { asString } from '../../../core/nodeData';
import { cleanAssetTitle, workspaceAssetKindForFile } from '../../../core/workspaceAssetTypes';
import { defineNodeType } from '../nodeDefinition/defineNodeType';
import type { JsonObject } from '../../../core/nodePrimitives';
import { drawNodeBodyLines, drawNodeMeta, nodeLayout, wrapText } from '../nodeRendering';
import { createFilePreviewShell, loadFileAssetFile, saveFileAsset } from './fileAssetPreview';
import { nodeTypeSpecs } from '../nodeDefinition/nodeTypeSpecs';
import type { NodeContentRect, NodeDefinition, NodeInteractionRegion } from '../nodeDefinition/nodeDefinitionTypes';
import type { CanvasTheme } from '../theme';

type MarkdownNodeData = {
  assetId: string;
  title: string;
  fileName: string;
  mime: string;
  previewText: string;
} & JsonObject;

export const markdownNodeDefinition: NodeDefinition<MarkdownNodeData> = defineNodeType({
  ...nodeTypeSpecs.md,
  createDefaultData() {
    return { assetId: '', title: 'Markdown', fileName: '', mime: 'text/markdown', previewText: '' };
  },
  parseData(raw) {
    const fileName = asString(raw.fileName, '');
    return {
      assetId: asString(raw.assetId, ''),
      title: asString(raw.title, cleanAssetTitle(fileName, 'Markdown')),
      fileName,
      mime: asString(raw.mime, 'text/markdown'),
      previewText: asString(raw.previewText, ''),
    };
  },
  render({ ctx, data, theme, contentRect, state }) {
    if (state.quality === 'compact' && !state.selected && !state.hovered) return;
    drawMarkdownPreview(ctx, contentRect, data, theme);
  },
  describe({ data }) {
    return {
      label: data.title || cleanAssetTitle(data.fileName, 'Markdown'),
      roleDescription: 'Markdown document',
      details: [data.assetId ? data.fileName || 'Markdown file' : 'No Markdown file'],
      state: [],
      actions: [],
    };
  },
  getInteractionRegions({ contentRect, theme }) {
    return markdownRegions(contentRect, theme);
  },
  createInteraction(ctx) {
    if (ctx.region.id !== 'preview') return null;
    return createMarkdownPreview(ctx.mount, ctx.data, (nextData) => ctx.requestCommit(nextData, 'pointer'), ctx.requestClose);
  },
  referencedAssetIds({ data }) {
    return data.assetId ? [data.assetId] : [];
  },
});

function drawMarkdownPreview(ctx: CanvasRenderingContext2D, rect: NodeContentRect, data: MarkdownNodeData, theme: CanvasTheme) {
  const layout = nodeLayout(theme);
  const bodyY = layout.contentY + layout.labelLineHeight;
  const preview = data.previewText.trim() || (data.assetId ? 'Open Markdown preview' : 'No file attached');
  drawNodeMeta(ctx, rect, data.assetId ? 'Markdown document' : 'Add a Markdown file', theme, 0);
  const lines = wrapText(
    ctx,
    preview,
    Math.max(0, rect.w - layout.insetX * 2),
    Math.max(1, Math.floor((rect.h - bodyY) / layout.bodyLineHeight)),
  );
  drawNodeBodyLines(ctx, rect, lines, theme, { y: rect.y + bodyY });
}

function markdownRegions(contentRect: NodeContentRect, theme: CanvasTheme): NodeInteractionRegion[] {
  const layout = nodeLayout(theme);
  return [{
    id: 'preview',
    rect: {
      x: contentRect.x + layout.insetX,
      y: contentRect.y,
      w: Math.max(0, contentRect.w - layout.insetX * 2),
      h: contentRect.h,
    },
    cursor: 'pointer',
    label: 'open Markdown preview',
  }];
}

function createMarkdownPreview(mount: HTMLElement, data: MarkdownNodeData, commit: (nextData: MarkdownNodeData) => void, close: () => void) {
  const shell = createFilePreviewShell(mount, 'node-inline-markdown-preview', data.title || 'Markdown');
  let disposed = false;
  shell.closeButton.addEventListener('click', close);
  if (!data.assetId) {
    renderMarkdownAttach(shell.body, data, commit);
  } else {
    shell.setMessage('Loading Markdown');
    void loadFileAssetFile(data.assetId)
      .then((file) => file.text())
      .then((text) => {
        if (disposed) return;
        shell.body.replaceChildren();
        const preview = document.createElement('pre');
        preview.className = 'markdown-preview-text';
        preview.textContent = text || 'Empty Markdown file';
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

function renderMarkdownAttach(body: HTMLElement, data: MarkdownNodeData, commit: (nextData: MarkdownNodeData) => void) {
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
    void Promise.all([saveFileAsset(file), file.text()])
      .then(([asset, text]) => {
        const title = cleanAssetTitle(asset.name || file.name, 'Markdown');
        commit({
          ...data,
          assetId: asset.id,
          title,
          fileName: asset.name || file.name || 'note.md',
          mime: asset.mime || file.type || 'text/markdown',
          previewText: markdownPreviewText(text),
        });
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

function markdownPreviewText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/[*_~>#|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1600);
}
