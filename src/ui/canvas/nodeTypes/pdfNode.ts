import { asString } from '../../../core/nodeData';
import type { NodeContentViewport } from '../../../core/nodeAppearance';
import { cleanAssetTitle, workspaceAssetKindForFile } from '../../../core/workspaceAssetTypes';
import { defineNodeType } from '../nodeDefinition/defineNodeType';
import type { JsonObject } from '../../../core/nodePrimitives';
import { drawNodeMeta } from '../nodeRendering';
import { createFilePreviewShell, loadFileAssetObject, saveFileAsset } from './fileAssetPreview';
import { nodeEditInteractionRegion } from './nodeContentInteractionRegion';
import { nodeTypeSpecs } from '../nodeDefinition/nodeTypeSpecs';
import type { NodeContentRect, NodeDefinition } from '../nodeDefinition/nodeDefinitionTypes';
import type { CanvasTheme } from '../theme';
import { drawPdfCanvasPreview } from './pdfCanvasPreview';

type PdfNodeData = {
  assetId: string;
  title: string;
  fileName: string;
  mime: string;
} & JsonObject;

export const pdfNodeDefinition: NodeDefinition<PdfNodeData> = defineNodeType({
  ...nodeTypeSpecs.pdf,
  createDefaultData() {
    return { assetId: '', title: 'PDF', fileName: '', mime: 'application/pdf' };
  },
  parseData(raw) {
    const fileName = asString(raw.fileName, '');
    return {
      assetId: asString(raw.assetId, ''),
      title: asString(raw.title, cleanAssetTitle(fileName, 'PDF')),
      fileName,
      mime: asString(raw.mime, 'application/pdf'),
    };
  },
  render({ ctx, data, theme, contentRect, visibleContentRect, contentViewport, requestRender, state }) {
    if (state.quality === 'compact' && !state.selected && !state.hovered) return;
    drawPdfPreview(ctx, contentRect, visibleContentRect, contentViewport, data, theme, requestRender);
  },
  describe({ data }) {
    return {
      label: data.title || cleanAssetTitle(data.fileName, 'PDF'),
      roleDescription: 'PDF document',
      details: [data.assetId ? data.fileName || 'PDF file' : 'No PDF file'],
      state: [],
      actions: [],
    };
  },
  getInteractionRegions({ contentRect }) {
    return nodeEditInteractionRegion(contentRect, 'pointer', 'open PDF preview');
  },
  createInteraction(ctx) {
    if (ctx.region.id !== 'edit') return null;
    return createPdfPreview(ctx.mount, ctx.data, (nextData) => ctx.requestCommit(nextData), ctx.requestClose);
  },
  referencedAssetIds({ data }) {
    return data.assetId ? [data.assetId] : [];
  },
});

function drawPdfPreview(
  ctx: CanvasRenderingContext2D,
  rect: NodeContentRect,
  visibleRect: NodeContentRect,
  contentViewport: NodeContentViewport,
  data: PdfNodeData,
  theme: CanvasTheme,
  requestRender: () => void,
) {
  drawNodeMeta(ctx, rect, data.assetId ? 'PDF document' : 'Add a PDF file', theme, 0);
  drawPdfCanvasPreview(ctx, rect, data.assetId, data.fileName, theme, visibleRect, contentViewport, requestRender);
}

function createPdfPreview(mount: HTMLElement, data: PdfNodeData, commit: (nextData: PdfNodeData) => void, close: () => void) {
  const shell = createFilePreviewShell(mount, 'node-inline-pdf-preview', data.title || 'PDF');
  let disposed = false;
  shell.closeButton.addEventListener('click', close);
  if (!data.assetId) {
    renderPdfAttach(shell.body, data, commit, close);
  } else {
    shell.setMessage('Loading PDF');
    void loadFileAssetObject(data.assetId)
      .then((asset) => {
        if (disposed) return;
        shell.body.replaceChildren();
        const iframe = document.createElement('iframe');
        iframe.className = 'file-preview-frame';
        iframe.title = data.title || asset.name || 'PDF preview';
        iframe.src = asset.objectUrl;
        const link = document.createElement('a');
        link.className = 'file-preview-open';
        link.href = asset.objectUrl;
        link.target = '_blank';
        link.rel = 'noreferrer';
        link.textContent = 'Open original';
        shell.body.append(iframe, link);
      })
      .catch((error) => {
        if (!disposed) shell.setMessage(error instanceof Error ? error.message : 'Could not load PDF');
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

function renderPdfAttach(body: HTMLElement, data: PdfNodeData, commit: (nextData: PdfNodeData) => void, close: () => void) {
  body.replaceChildren();
  const panel = document.createElement('div');
  panel.className = 'file-attach-panel';

  const message = document.createElement('p');
  message.className = 'file-preview-message';
  message.textContent = 'Attach a PDF file to this panel.';

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/pdf,.pdf';
  input.setAttribute('aria-label', 'Choose PDF file');
  input.addEventListener('change', () => {
    const file = input.files?.[0] ?? null;
    if (!file) return;
    if (workspaceAssetKindForFile(file) !== 'pdf') {
      message.textContent = 'Choose a PDF file.';
      input.value = '';
      return;
    }
    message.textContent = 'Attaching PDF';
    input.disabled = true;
    void saveFileAsset(file)
      .then((asset) => {
        const title = cleanAssetTitle(asset.name || file.name, 'PDF');
        commit({
          ...data,
          assetId: asset.id,
          title,
          fileName: asset.name || file.name || 'document.pdf',
          mime: asset.mime || file.type || 'application/pdf',
        });
        close();
      })
      .catch((error) => {
        input.disabled = false;
        input.value = '';
        message.textContent = error instanceof Error ? error.message : 'Could not attach PDF';
      });
  });

  panel.append(message, input);
  body.append(panel);
}
