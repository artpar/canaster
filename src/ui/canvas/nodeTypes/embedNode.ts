import { asEnum, asString } from '../../../core/nodeData';
import {
  embedProviderForUrl,
  embedFrameUrlForUrl,
  embedTitleForUrl,
  normalizeEmbedUrl,
  type EmbedAspectRatio,
  type EmbedProvider,
} from '../../../core/embedUrl';
import { defineNodeType } from '../nodeDefinition/defineNodeType';
import type { JsonObject } from '../../../core/nodePrimitives';
import { createInlineNodeSurface } from './createInlineNodeSurface';
import { nodeEditInteractionRegion } from './nodeContentInteractionRegion';
import { nodeTypeSpecs } from '../nodeDefinition/nodeTypeSpecs';
import type { NodeContentRect, NodeDefinition } from '../nodeDefinition/nodeDefinitionTypes';
import type { CanvasTheme } from '../theme';

type EmbedNodeData = {
  url: string;
  title: string;
  provider: EmbedProvider;
  aspectRatio: EmbedAspectRatio;
} & JsonObject;

const EMBED_ASPECT_RATIOS: readonly EmbedAspectRatio[] = ['16:9', '4:3', 'auto'];
const EMBED_PROVIDERS: readonly EmbedProvider[] = ['web', 'video', 'map', 'doc'];

export const embedNodeDefinition: NodeDefinition<EmbedNodeData> = defineNodeType({
  ...nodeTypeSpecs.embed,
  createDefaultData() {
    return { url: '', title: 'Web preview', provider: 'web', aspectRatio: '16:9' };
  },
  parseData(raw) {
    const url = asString(raw.url, '');
    return {
      url,
      title: asString(raw.title, url ? embedTitleForUrl(url) : 'Web preview'),
      provider: asEnum(raw.provider, EMBED_PROVIDERS, 'web'),
      aspectRatio: asEnum(raw.aspectRatio, EMBED_ASPECT_RATIOS, '16:9'),
    };
  },
  render({ ctx, data, theme, contentRect, state }) {
    if (state.quality === 'compact' && !state.selected && !state.hovered) return;
    drawEmbedPreview(ctx, contentRect, data, theme);
  },
  describe({ data }) {
    const normalized = normalizeEmbedUrl(data.url, { allowLocalHttp: allowLocalHttpForCurrentHost() });
    return {
      label: data.title || (normalized ? embedTitleForUrl(normalized) : 'Web preview'),
      roleDescription: 'Web preview',
      details: [normalized ? embedTitleForUrl(normalized) : 'No web link'],
      state: normalized ? [] : ['Needs a safe HTTPS link'],
      actions: [],
    };
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
  const normalized = normalizeEmbedUrl(draftUrl, { allowLocalHttp: allowLocalHttpForCurrentHost() });
  if (!normalized) return data;
  return {
    ...data,
    url: normalized,
    title: data.title && data.title !== 'Web preview' ? data.title : embedTitleForUrl(normalized),
    provider: embedProviderForUrl(normalized),
  };
}

function allowLocalHttpForCurrentHost(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}
