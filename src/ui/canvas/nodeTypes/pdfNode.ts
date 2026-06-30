import { asString } from '../../../core/nodeData';
import { cleanAssetTitle, workspaceAssetKindForFile } from '../../../core/workspaceAssetTypes';
import { defineNodeType } from '../nodeDefinition/defineNodeType';
import type { JsonObject } from '../../../core/nodePrimitives';
import { clipText, drawNodeBodyLines, drawNodeMeta, nodeLayout, nodeText, wrapText } from '../nodeRendering';
import { createFilePreviewShell, loadFileAssetObject, saveFileAsset } from './fileAssetPreview';
import { nodeTypeSpecs } from '../nodeDefinition/nodeTypeSpecs';
import type { NodeContentRect, NodeDefinition, NodeInteractionRegion } from '../nodeDefinition/nodeDefinitionTypes';
import type { CanvasTheme } from '../theme';

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
  render({ ctx, data, theme, contentRect, state }) {
    if (state.quality === 'compact' && !state.selected && !state.hovered) return;
    drawPdfShell(ctx, contentRect, data, theme);
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
  getInteractionRegions({ contentRect, theme }) {
    return pdfRegions(contentRect, theme);
  },
  createInteraction(ctx) {
    if (ctx.region.id !== 'preview') return null;
    return createPdfPreview(ctx.mount, ctx.data, (nextData) => ctx.requestCommit(nextData, 'pointer'), ctx.requestClose);
  },
  referencedAssetIds({ data }) {
    return data.assetId ? [data.assetId] : [];
  },
});

function drawPdfShell(ctx: CanvasRenderingContext2D, rect: NodeContentRect, data: PdfNodeData, theme: CanvasTheme) {
  const layout = nodeLayout(theme);
  const text = nodeText(theme);
  const title = data.title || cleanAssetTitle(data.fileName, 'PDF');
  const previewRect = {
    x: rect.x + layout.insetX,
    y: rect.y + layout.labelLineHeight,
    w: Math.max(0, rect.w - layout.insetX * 2),
    h: Math.max(0, rect.h - layout.labelLineHeight * 2),
  };

  ctx.save();
  ctx.strokeStyle = theme.nodeBorder;
  ctx.fillStyle = theme.bg;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(previewRect.x, previewRect.y, previewRect.w, previewRect.h, theme.nodeControlRadius);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  const folded = Math.min(24, previewRect.w * 0.2, previewRect.h * 0.22);
  ctx.save();
  ctx.strokeStyle = theme.mutedText;
  ctx.beginPath();
  ctx.moveTo(previewRect.x + previewRect.w - folded, previewRect.y);
  ctx.lineTo(previewRect.x + previewRect.w, previewRect.y + folded);
  ctx.lineTo(previewRect.x + previewRect.w - folded, previewRect.y + folded);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();

  drawNodeMeta(ctx, rect, data.assetId ? 'PDF document' : 'Add a PDF file', theme, 0);
  ctx.fillStyle = theme.headerText;
  ctx.font = text.titleSmall;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(clipText(ctx, title, Math.max(0, previewRect.w - layout.insetX * 2)), previewRect.x + layout.insetX, previewRect.y + layout.contentY);

  const detail = data.fileName && data.fileName !== title ? data.fileName : data.assetId ? 'Open PDF preview' : 'No file attached';
  const lines = wrapText(ctx, detail, Math.max(0, previewRect.w - layout.insetX * 2), 2);
  drawNodeBodyLines(ctx, previewRect, lines, theme, {
    y: previewRect.y + layout.contentY + layout.bodyLineHeight,
    color: theme.mutedText,
    font: text.label,
  });
}

function pdfRegions(contentRect: NodeContentRect, theme: CanvasTheme): NodeInteractionRegion[] {
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
    label: 'open PDF preview',
  }];
}

function createPdfPreview(mount: HTMLElement, data: PdfNodeData, commit: (nextData: PdfNodeData) => void, close: () => void) {
  const shell = createFilePreviewShell(mount, 'node-inline-pdf-preview', data.title || 'PDF');
  let disposed = false;
  shell.closeButton.addEventListener('click', close);
  if (!data.assetId) {
    renderPdfAttach(shell.body, data, commit);
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

function renderPdfAttach(body: HTMLElement, data: PdfNodeData, commit: (nextData: PdfNodeData) => void) {
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
