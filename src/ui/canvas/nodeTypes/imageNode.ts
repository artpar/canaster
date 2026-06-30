import { listImageAssets, loadAssetObject, uploadImageAsset, type CanasterAssetSummary } from '../../../infra/daptin/assets';
import { hasUsableStoredToken, normalizeDaptinError } from '../../../infra/daptin/daptinClient';
import { asEnum, asNullableString, asString } from '../../../core/nodeData';
import { defineNodeType } from '../nodeDefinition/defineNodeType';
import { cachedAssetImage, cacheAssetImage } from '../imageAssets';
import { prepareInlineEditorMount, stopEvent } from '../inlineEditorDom';
import type { JsonObject } from '../../../core/nodePrimitives';
import { drawPlaceholderIcon } from '../nodeRendering';
import { nodeTypeSpecs } from '../nodeDefinition/nodeTypeSpecs';
import type { NodeContentRect, NodeDefinition, NodeInteractionRegion } from '../nodeDefinition/nodeDefinitionTypes';
import type { CanvasTheme } from '../theme';

const IMAGE_FITS = ['contain', 'cover'] as const;
type ImageFit = (typeof IMAGE_FITS)[number];
type ImageNodeData = {
  assetId: string | null;
  alt: string;
  fit: ImageFit;
  caption?: string;
} & JsonObject;

export const imageNodeDefinition: NodeDefinition<ImageNodeData> = defineNodeType<ImageNodeData>({
  ...nodeTypeSpecs.image,
  createDefaultData() {
    return { assetId: null, alt: '', fit: 'cover', caption: '' };
  },
  parseData(raw) {
    return {
      assetId: asNullableString(raw.assetId),
      alt: asString(raw.alt, ''),
      fit: asEnum(raw.fit, IMAGE_FITS, 'cover'),
      caption: asString(raw.caption, ''),
    };
  },
  render({ ctx, data, theme, contentRect, state }) {
    ctx.fillStyle = theme.mutedText;

    if (state.quality === 'compact' && !state.selected && !state.hovered) return;

    const frame = imageFrame(contentRect, theme);
    const cached = cachedAssetImage(data.assetId);
    if (cached) {
      drawImage(ctx, cached, frame, data.fit);
    } else {
      drawPlaceholderIcon(ctx, frame, data.assetId ? 'LOADING' : 'IMAGE', theme);
    }
  },
  describe({ data }) {
    return {
      label: data.alt || 'Image',
      roleDescription: 'Image',
      details: [
        data.assetId ? 'Image added' : 'No image source',
        data.fit === 'cover' ? 'Fills the frame' : 'Fits inside the frame',
      ],
      state: [],
      actions: [],
    };
  },
  getInteractionRegions({ contentRect, theme }) {
    return imageRegions(contentRect, theme);
  },
  createInteraction(ctx) {
    if (ctx.region.id !== 'image-frame') return null;
    return createImagePicker(ctx.mount, ctx.data, (nextData) => ctx.requestCommit(nextData, 'pointer'), ctx.requestClose);
  },
  referencedAssetIds({ data }) {
    return data.assetId ? [data.assetId] : [];
  },
});

function imageRegions(contentRect: NodeContentRect, theme: CanvasTheme): NodeInteractionRegion[] {
  const frame = imageFrame(contentRect, theme);
  return [{ id: 'image-frame', rect: frame, cursor: 'pointer', label: 'image' }];
}

function imageFrame(contentRect: NodeContentRect, theme: CanvasTheme) {
  void theme;
  return {
    x: contentRect.x,
    y: contentRect.y,
    w: contentRect.w,
    h: contentRect.h,
  };
}

function createImagePicker(mount: HTMLElement, data: ImageNodeData, commit: (nextData: ImageNodeData) => void, close: () => void) {
  prepareInlineEditorMount(mount, 'node-inline-image-picker');
  const panel = document.createElement('div');
  panel.className = 'image-picker-panel';
  panel.addEventListener('pointerdown', stopEvent);
  mount.append(panel);

  let disposed = false;
  let altDraft = data.alt;
  const render = (state: { assets: CanasterAssetSummary[]; busy: boolean; message: string }) => {
    panel.replaceChildren();
    const actions = document.createElement('div');
    actions.className = 'image-picker-actions';

    const uploadLabel = document.createElement('label');
    uploadLabel.className = 'image-picker-upload';
    uploadLabel.textContent = state.busy ? 'Working...' : 'Upload';
    const uploadInput = document.createElement('input');
    uploadInput.type = 'file';
    uploadInput.accept = 'image/*';
    uploadInput.disabled = state.busy || !hasUsableStoredToken();
    uploadInput.addEventListener('change', () => {
      void uploadSelectedImage(uploadInput.files?.[0] ?? null);
      uploadInput.value = '';
    });
    uploadLabel.append(uploadInput);

    const select = document.createElement('select');
    select.disabled = state.busy || !hasUsableStoredToken();
    select.setAttribute('aria-label', 'Select saved image');
    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = 'No image';
    select.append(emptyOption);
    for (const asset of state.assets) {
      const option = document.createElement('option');
      option.value = asset.id;
      option.textContent = asset.name;
      select.append(option);
    }
    select.value = data.assetId ?? '';
    select.addEventListener('change', () => {
      const selectedName = selectedAssetName(state.assets, select.value);
      commit({ ...data, assetId: select.value || null, alt: altDraft || selectedName || data.alt });
      close();
    });

    actions.append(uploadLabel, select);
    panel.append(actions);
    const altInput = document.createElement('input');
    altInput.className = 'image-picker-alt';
    altInput.type = 'text';
    altInput.value = altDraft;
    altInput.placeholder = 'Alt text';
    altInput.setAttribute('aria-label', 'Image alt text');
    altInput.addEventListener('input', () => {
      altDraft = altInput.value;
    });
    altInput.addEventListener('change', () => {
      commit({ ...data, alt: altInput.value });
    });
    altInput.addEventListener('keydown', stopEvent);
    panel.append(altInput);
    if (state.message) {
      const message = document.createElement('p');
      message.className = 'image-picker-message';
      message.textContent = state.message;
      panel.append(message);
    }
  };

  const setState = (state: { assets: CanasterAssetSummary[]; busy: boolean; message: string }) => {
    if (!disposed) render(state);
  };

  async function uploadSelectedImage(file: File | null) {
    if (!file) return;
    setState({ assets: [], busy: true, message: 'Uploading image' });
    try {
      const asset = await uploadImageAsset(file);
      const object = await loadAssetObject(asset.id);
      await cacheAssetImage(object.id, object.objectUrl);
      commit({ ...data, assetId: asset.id, alt: altDraft || data.alt || cleanImageName(asset.name) });
      close();
    } catch (error) {
      setState({ assets: [], busy: false, message: imageErrorMessage(error, 'Could not upload image') });
    }
  }

  if (!hasUsableStoredToken()) {
    render({ assets: [], busy: false, message: 'Sign in to upload images.' });
  } else {
    render({ assets: [], busy: true, message: 'Loading images' });
    void listImageAssets()
      .then((assets) => setState({ assets, busy: false, message: assets.length ? '' : 'No saved images yet.' }))
      .catch((error) => setState({ assets: [], busy: false, message: imageErrorMessage(error, 'Could not list images') }));
  }

  return {
    focus() {
      panel.querySelector<HTMLElement>('select, input, button')?.focus({ preventScroll: true });
    },
    dispose() {
      disposed = true;
    },
  };
}

function selectedAssetName(assets: CanasterAssetSummary[], assetId: string) {
  return cleanImageName(assets.find((asset) => asset.id === assetId)?.name ?? '');
}

function cleanImageName(name: string) {
  return name.replace(/\.[a-z0-9]+$/i, '').trim();
}

function imageErrorMessage(error: unknown, fallback: string) {
  const apiError = normalizeDaptinError(error, fallback);
  if (apiError.kind === 'session' || apiError.kind === 'permission') return 'Sign in to upload images.';
  return error instanceof Error ? error.message : fallback;
}

function drawImage(ctx: CanvasRenderingContext2D, image: HTMLImageElement, frame: { x: number; y: number; w: number; h: number }, fit: 'contain' | 'cover') {
  if (frame.w <= 0 || frame.h <= 0 || image.naturalWidth <= 0 || image.naturalHeight <= 0) return;
  const scale = fit === 'cover'
    ? Math.max(frame.w / image.naturalWidth, frame.h / image.naturalHeight)
    : Math.min(frame.w / image.naturalWidth, frame.h / image.naturalHeight);
  const w = image.naturalWidth * scale;
  const h = image.naturalHeight * scale;
  const x = frame.x + (frame.w - w) / 2;
  const y = frame.y + (frame.h - h) / 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(frame.x, frame.y, frame.w, frame.h);
  ctx.clip();
  ctx.drawImage(image, x, y, w, h);
  ctx.restore();
}
