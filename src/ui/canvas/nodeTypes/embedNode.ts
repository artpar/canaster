import {
  embedFrameUrlForUrl,
  embedTitleForUrl,
  normalizeEmbedUrl,
} from '../../../core/embedUrl';
import { defineNodeType } from '../nodeDefinition/defineNodeType';
import { describeEmbedNodeData, embedNodeDataForUrl, embedNodeSemanticDefinition, type EmbedNodeData } from '../../../domain/nodeDefinitions/embedNodeSemanticDefinition';
import { createInlineNodeSurface } from './createInlineNodeSurface';
import { nodeEditInteractionRegion } from './nodeContentInteractionRegion';
import { nodeTypeSpecs } from '../nodeDefinition/nodeTypeSpecs';
import type { NodeContentRect, NodeDefinition } from '../nodeDefinition/nodeDefinitionTypes';
import type { CanvasTheme } from '../theme';

export const embedNodeDefinition: NodeDefinition<EmbedNodeData> = defineNodeType({
  ...nodeTypeSpecs.embed,
  createDefaultData: embedNodeSemanticDefinition.createDefaultData,
  parseData: embedNodeSemanticDefinition.parseData,
  render({ ctx, data, theme, contentRect, state }) {
    if (state.quality === 'compact' && !state.selected && !state.hovered) return;
    drawEmbedPreview(ctx, contentRect, data, theme);
  },
  describe({ data }) {
    return describeEmbedNodeData(data, { allowLocalHttp: allowLocalHttpForCurrentHost() });
  },
  getInteractionRegions({ contentRect }) {
    return nodeEditInteractionRegion(contentRect, 'pointer', 'edit web preview');
  },
  createInteraction(ctx) {
    if (ctx.region.id !== 'edit') return null;
    return createEmbedEditor(ctx.mount, ctx.data, (nextData) => ctx.requestCommit(nextData), ctx.requestClose);
  },
});

function drawEmbedPreview(ctx: CanvasRenderingContext2D, rect: NodeContentRect, data: EmbedNodeData, theme: CanvasTheme) {
  const normalized = normalizeEmbedUrl(data.url, { allowLocalHttp: allowLocalHttpForCurrentHost() });
  ctx.save();
  ctx.strokeStyle = normalized ? theme.selected : theme.nodeBorder;
  ctx.fillStyle = theme.bg;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(rect.x, rect.y, rect.w, rect.h, theme.nodeControlRadius);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function createEmbedEditor(mount: HTMLElement, data: EmbedNodeData, commit: (nextData: EmbedNodeData) => void, close: () => void) {
  let draftUrl = data.url;
  const surface = createInlineNodeSurface({
    mount,
    className: 'node-inline-embed-editor',
    initialData: readEmbedDraft(data, draftUrl),
    readDraft: () => {
      return readEmbedDraft(data, draftUrl);
    },
    commit,
    close,
    focus: (root) => root.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true }),
  });

  const controls = document.createElement('div');
  controls.className = 'node-inline-embed-controls';
  const input = document.createElement('input');
  input.type = 'url';
  input.value = data.url;
  input.placeholder = 'https://example.com';
  input.setAttribute('aria-label', 'Embed URL');
  const message = document.createElement('p');
  message.className = 'embed-editor-message';
  const preview = document.createElement('div');
  preview.className = 'embed-editor-preview';
  input.addEventListener('input', () => {
    draftUrl = input.value;
    renderPreview(draftUrl);
  });
  controls.append(input, message);
  surface.root.append(controls, preview);

  const renderPreview = (rawUrl: string) => {
    preview.replaceChildren();
    const normalized = normalizeEmbedUrl(rawUrl, { allowLocalHttp: allowLocalHttpForCurrentHost() });
    if (!normalized) {
      message.textContent = rawUrl ? 'This link cannot be embedded.' : 'Add a link to preview it here.';
      return;
    }
    message.textContent = 'Preview enabled';
    const iframe = document.createElement('iframe');
    iframe.className = 'embed-editor-frame';
    iframe.title = data.title || embedTitleForUrl(normalized);
    iframe.src = embedFrameUrlForUrl(normalized);
    iframe.loading = 'lazy';
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    iframe.allowFullscreen = true;
    iframe.sandbox.add('allow-same-origin', 'allow-scripts', 'allow-popups', 'allow-forms');
    preview.append(iframe);
  };

  renderPreview(data.url);
  return surface.controller;
}

function readEmbedDraft(data: EmbedNodeData, draftUrl: string): EmbedNodeData {
  return embedNodeDataForUrl(data, draftUrl, { allowLocalHttp: allowLocalHttpForCurrentHost() });
}

function allowLocalHttpForCurrentHost(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}
