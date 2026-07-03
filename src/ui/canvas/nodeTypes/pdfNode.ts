import type { NodeContentViewport } from '../../../core/nodeAppearance';
import { cleanAssetTitle, workspaceAssetKindForFile } from '../../../core/workspaceAssetTypes';
import { defineNodeType } from '../nodeDefinition/defineNodeType';
import { pdfNodeSemanticDefinition, type PdfNodeData } from '../../../domain/nodeDefinitions/pdfNodeSemanticDefinition';
import { drawNodeMeta } from '../nodeRendering';
import { createFilePreviewShell } from './fileAssetPreview';
import { nodeEditInteractionRegion } from './nodeContentInteractionRegion';
import { nodeTypeSpecs } from '../nodeDefinition/nodeTypeSpecs';
import type { NodeContentRect, NodeDefinition } from '../nodeDefinition/nodeDefinitionTypes';
import type { CanvasTheme } from '../theme';
import { drawPdfCanvasPreview } from './pdfCanvasPreview';
import type { CanvasNodeAssetService } from '../nodeAssetService';

export const pdfNodeDefinition: NodeDefinition<PdfNodeData> = defineNodeType({
  ...nodeTypeSpecs.pdf,
  createDefaultData: pdfNodeSemanticDefinition.createDefaultData,
  parseData: pdfNodeSemanticDefinition.parseData,
  render({ ctx, data, theme, contentRect, visibleContentRect, contentViewport, nodeAssetService, requestRender, state }) {
    if (state.quality === 'compact' && !state.selected && !state.hovered) return;
    drawPdfPreview(ctx, contentRect, visibleContentRect, contentViewport, data, theme, nodeAssetService, requestRender);
  },
  describe: pdfNodeSemanticDefinition.describe,
  getInteractionRegions({ contentRect }) {
    return nodeEditInteractionRegion(contentRect, 'pointer', 'open PDF preview');
  },
  createInteraction(ctx) {
    if (ctx.region.id !== 'edit') return null;
    return createPdfPreview(ctx.mount, ctx.data, ctx.nodeAssetService, (nextData) => ctx.requestCommit(nextData), ctx.requestClose);
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
  nodeAssetService: CanvasNodeAssetService,
  requestRender: () => void,
) {
  drawNodeMeta(ctx, rect, data.assetId ? 'PDF document' : 'Add a PDF file', theme, 0);
  drawPdfCanvasPreview(ctx, rect, data.assetId, data.fileName, theme, visibleRect, contentViewport, nodeAssetService, requestRender);
}

function createPdfPreview(mount: HTMLElement, data: PdfNodeData, nodeAssetService: CanvasNodeAssetService, commit: (nextData: PdfNodeData) => void, close: () => void) {
  const shell = createFilePreviewShell(mount, 'node-inline-pdf-preview', data.title || 'PDF');
  let disposed = false;
  let loadedObjectUrlAssetId: string | null = null;
  shell.closeButton.addEventListener('click', close);
  if (!data.assetId) {
    renderPdfAttach(shell.body, data, nodeAssetService, commit, close);
  } else {
    shell.setMessage('Loading PDF');
    void nodeAssetService.loadAssetObject(data.assetId)
      .then((asset) => {
        if (disposed) {
          nodeAssetService.releaseAssetObjectUrl(asset.id);
          return;
        }
        loadedObjectUrlAssetId = asset.id;
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
      if (loadedObjectUrlAssetId) {
        nodeAssetService.releaseAssetObjectUrl(loadedObjectUrlAssetId);
        loadedObjectUrlAssetId = null;
      }
    },
  };
}

function renderPdfAttach(body: HTMLElement, data: PdfNodeData, nodeAssetService: CanvasNodeAssetService, commit: (nextData: PdfNodeData) => void, close: () => void) {
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
    void nodeAssetService.storeWorkspaceFile(file)
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
        message.textContent = nodeAssetService.assetErrorMessage(error, 'Could not attach PDF');
      });
  });

  panel.append(message, input);
  body.append(panel);
}
