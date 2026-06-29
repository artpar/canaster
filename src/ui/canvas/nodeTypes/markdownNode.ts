import { asString } from '../../../core/nodeData';
import { cleanAssetTitle } from '../../../core/workspaceAssetTypes';
import { defineNodeType } from '../nodeDefinition/defineNodeType';
import type { JsonObject } from '../../../core/nodePrimitives';
import { drawNodeBodyLines, drawNodeMeta, nodeLayout, wrapText } from '../nodeRendering';
import { createFilePreviewShell, loadFileAssetFile } from './fileAssetPreview';
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
    return createMarkdownPreview(ctx.mount, ctx.data, ctx.requestClose);
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

function createMarkdownPreview(mount: HTMLElement, data: MarkdownNodeData, close: () => void) {
  const shell = createFilePreviewShell(mount, 'node-inline-markdown-preview', data.title || 'Markdown');
  let disposed = false;
  shell.closeButton.addEventListener('click', close);
  if (!data.assetId) {
    shell.setMessage('No Markdown file attached.');
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
      shell.closeButton.focus({ preventScroll: true });
    },
    dispose() {
      disposed = true;
    },
  };
}
