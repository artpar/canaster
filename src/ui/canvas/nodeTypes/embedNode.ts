import { asEnum, asString } from '../../../core/nodeData';
import {
  embedProviderForUrl,
  embedTitleForUrl,
  normalizeEmbedUrl,
  type EmbedAspectRatio,
  type EmbedProvider,
} from '../../../core/embedUrl';
import { defineNodeType } from '../nodeDefinition/defineNodeType';
import type { JsonObject } from '../../../core/nodePrimitives';
import { drawNodeBodyLines, drawNodeMeta, nodeLayout, wrapText } from '../nodeRendering';
import { prepareInlineEditorMount, stopEvent } from '../inlineEditorDom';
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
  const layout = nodeLayout(theme);
  const normalized = normalizeEmbedUrl(data.url, { allowLocalHttp: allowLocalHttpForCurrentHost() });
  const title = data.title || (normalized ? embedTitleForUrl(normalized) : 'Web preview');
  const status = normalized ? `${data.provider.toUpperCase()} preview` : 'Add a safe web link';
  drawNodeMeta(ctx, rect, status, theme, layout.labelLineHeight * 0.35);

  const frame = {
    x: rect.x + layout.insetX,
    y: rect.y + layout.contentY + layout.labelLineHeight,
    w: Math.max(0, rect.w - layout.insetX * 2),
    h: Math.max(0, rect.h - layout.contentY - layout.labelLineHeight * 2),
  };
  ctx.save();
  ctx.strokeStyle = normalized ? theme.selected : theme.nodeBorder;
  ctx.fillStyle = theme.bg;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(frame.x, frame.y, frame.w, frame.h, theme.nodeControlRadius);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  const lines = wrapText(ctx, normalized ? title : 'Paste or enter an HTTPS link', Math.max(0, frame.w - layout.insetX * 2), 3);
  drawNodeBodyLines(ctx, frame, lines, theme, { y: frame.y + layout.contentY });
}

function createEmbedEditor(mount: HTMLElement, data: EmbedNodeData, commit: (nextData: EmbedNodeData) => void, close: () => void) {
  prepareInlineEditorMount(mount, 'node-inline-embed-editor');
  const panel = document.createElement('div');
  panel.className = 'embed-editor-panel';
  panel.addEventListener('pointerdown', stopEvent);
  mount.append(panel);

  const form = document.createElement('form');
  form.className = 'embed-editor-form';
  const input = document.createElement('input');
  input.type = 'url';
  input.value = data.url;
  input.placeholder = 'https://example.com';
  input.setAttribute('aria-label', 'Embed URL');
  const save = document.createElement('button');
  save.type = 'submit';
  save.textContent = 'Save';
  const done = document.createElement('button');
  done.type = 'button';
  done.textContent = 'Cancel';
  form.append(input, save, done);

  const message = document.createElement('p');
  message.className = 'embed-editor-message';
  const preview = document.createElement('div');
  preview.className = 'embed-editor-preview';
  panel.append(form, message, preview);

  const commitInput = () => {
    const normalized = normalizeEmbedUrl(input.value, { allowLocalHttp: allowLocalHttpForCurrentHost() });
    if (!normalized) {
      message.textContent = 'Use an HTTPS link.';
      renderPreview(data.url);
      return;
    }
    const title = data.title && data.title !== 'Web preview' ? data.title : embedTitleForUrl(normalized);
    const nextData: EmbedNodeData = {
      ...data,
      url: normalized,
      title,
      provider: embedProviderForUrl(normalized),
    };
    commit(nextData);
    close();
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    commitInput();
  });
  form.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  });
  done.addEventListener('click', close);

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
    iframe.src = normalized;
    iframe.loading = 'lazy';
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    iframe.sandbox.add('allow-same-origin', 'allow-scripts', 'allow-popups', 'allow-forms');
    preview.append(iframe);
  };

  renderPreview(data.url);
  return {
    focus() {
      input.focus({ preventScroll: true });
      input.select();
    },
    dispose() {},
  };
}

function allowLocalHttpForCurrentHost(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}
