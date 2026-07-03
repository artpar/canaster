import { listImageAssets, loadAssetObject, uploadImageAsset, type CanasterAssetSummary } from '../../../infra/daptin/assets';
import { hasUsableStoredToken, normalizeDaptinError } from '../../../infra/daptin/daptinClient';
import { defineNodeType } from '../nodeDefinition/defineNodeType';
import { cachedAssetImage, cacheAssetImage } from '../imageAssets';
import { createInlineNodeSurface } from './createInlineNodeSurface';
import { imageNodeSemanticDefinition, type ImageNodeData } from '../../../domain/nodeDefinitions/imageNodeSemanticDefinition';
import { drawPlaceholderIcon } from '../nodeRendering';
import { nodeEditInteractionRegion } from './nodeContentInteractionRegion';
import { nodeTypeSpecs } from '../nodeDefinition/nodeTypeSpecs';
import type { NodeContentRect, NodeDefinition } from '../nodeDefinition/nodeDefinitionTypes';
import type { CanvasTheme } from '../theme';

const IMAGE_FITS: readonly ImageNodeData['fit'][] = ['contain', 'cover'];

export const imageNodeDefinition: NodeDefinition<ImageNodeData> = defineNodeType<ImageNodeData>({
  ...nodeTypeSpecs.image,
  createDefaultData: imageNodeSemanticDefinition.createDefaultData,
  parseData: imageNodeSemanticDefinition.parseData,
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
  describe: imageNodeSemanticDefinition.describe,
  getInteractionRegions({ contentRect }) {
    return nodeEditInteractionRegion(contentRect, 'pointer', 'edit image');
  },
  createInteraction(ctx) {
    if (ctx.region.id !== 'edit') return null;
    return createImagePicker(ctx.mount, ctx.data, (nextData) => ctx.requestCommit(nextData), ctx.requestClose);
  },
  referencedAssetIds({ data }) {
    return data.assetId ? [data.assetId] : [];
  },
});

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
  let disposed = false;
  let assetIdDraft = data.assetId;
  let altDraft = data.alt;
  let fitDraft = data.fit;
  let directPickOpen = !data.assetId && hasUsableStoredToken();
  const surface = createInlineNodeSurface({
    mount,
    className: 'node-inline-image-editor',
    initialData: { ...data, assetId: assetIdDraft, alt: altDraft, fit: fitDraft },
    readDraft: () => ({ ...data, assetId: assetIdDraft, alt: altDraft, fit: fitDraft }),
    commit,
    close,
    focus: (root) => {
      if (directPickOpen) return;
      root.querySelector<HTMLElement>('select, input, button')?.focus({ preventScroll: true });
    },
  });

  const render = (state: { assets: CanasterAssetSummary[]; busy: boolean; message: string }) => {
    surface.root.replaceChildren();
    if (directPickOpen) {
      const input = createUploadInput({ disabled: false, onPick: uploadSelectedImage, onCancel: close });
      const message = document.createElement('p');
      message.className = 'image-picker-message';
      message.textContent = state.message || 'Choose an image from this device.';
      surface.root.append(input, message);
      input.click();
      return;
    }

    const actions = document.createElement('div');
    actions.className = 'image-picker-actions';

    const uploadInput = createUploadInput({ disabled: state.busy || !hasUsableStoredToken(), onPick: uploadSelectedImage });
    const uploadButton = document.createElement('button');
    uploadButton.type = 'button';
    uploadButton.className = 'image-picker-upload';
    uploadButton.textContent = state.busy ? 'Working...' : 'Upload';
    uploadButton.disabled = uploadInput.disabled;
    uploadButton.addEventListener('click', () => {
      uploadInput.click();
    });

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
    select.value = assetIdDraft ?? '';
    select.addEventListener('change', () => {
      const selectedName = selectedAssetName(state.assets, select.value);
      assetIdDraft = select.value || null;
      if (!altDraft && selectedName) {
        altDraft = selectedName;
      }
      altInput.value = altDraft;
      surface.commitAndClose();
    });

    actions.append(uploadButton, select, uploadInput);
    surface.root.append(actions);

    const fitControls = document.createElement('div');
    fitControls.className = 'node-inline-segmented image-picker-fit';
    fitControls.setAttribute('role', 'toolbar');
    fitControls.setAttribute('aria-label', 'Image fit');
    for (const fit of IMAGE_FITS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = fit === 'cover' ? 'Fill' : 'Fit';
      button.setAttribute('aria-pressed', String(fitDraft === fit));
      button.addEventListener('click', () => {
        fitDraft = fit;
        for (const item of fitControls.querySelectorAll<HTMLButtonElement>('button')) {
          item.setAttribute('aria-pressed', String(item === button));
        }
      });
      fitControls.append(button);
    }
    surface.root.append(fitControls);

    const altInput = document.createElement('input');
    altInput.className = 'image-picker-alt';
    altInput.type = 'text';
    altInput.value = altDraft;
    altInput.placeholder = 'Alt text';
    altInput.setAttribute('aria-label', 'Image alt text');
    altInput.addEventListener('input', () => {
      altDraft = altInput.value;
    });
    surface.root.append(altInput);
    if (state.message) {
      const message = document.createElement('p');
      message.className = 'image-picker-message';
      message.textContent = state.message;
      surface.root.append(message);
    }
  };

  const setState = (state: { assets: CanasterAssetSummary[]; busy: boolean; message: string }) => {
    if (!disposed) render(state);
  };

  async function uploadSelectedImage(file: File | null) {
    if (!file) {
      if (directPickOpen) close();
      return;
    }
    directPickOpen = false;
    setState({ assets: [], busy: true, message: 'Uploading image' });
    try {
      const asset = await uploadImageAsset(file);
      const object = await loadAssetObject(asset.id);
      await cacheAssetImage(object.id, object.objectUrl);
      assetIdDraft = asset.id;
      altDraft = altDraft || data.alt || cleanImageName(asset.name);
      surface.commitAndClose();
    } catch (error) {
      setState({ assets: [], busy: false, message: imageErrorMessage(error, 'Could not upload image') });
    }
  }

  if (!hasUsableStoredToken()) {
    render({ assets: [], busy: false, message: 'Sign in to upload images.' });
  } else if (directPickOpen) {
    render({ assets: [], busy: false, message: 'Choose an image from this device.' });
  } else {
    render({ assets: [], busy: true, message: 'Loading images' });
    void listImageAssets()
      .then((assets) => setState({ assets, busy: false, message: assets.length ? '' : 'No saved images yet.' }))
      .catch((error) => setState({ assets: [], busy: false, message: imageErrorMessage(error, 'Could not list images') }));
  }

  return {
    focus() {
      surface.controller.focus?.();
    },
    dispose() {
      disposed = true;
      surface.controller.dispose();
    },
  };
}

function createUploadInput({
  disabled,
  onPick,
  onCancel,
}: {
  disabled: boolean;
  onPick: (file: File | null) => void;
  onCancel?: () => void;
}) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.disabled = disabled;
  input.className = 'image-picker-file-input';
  input.addEventListener('change', () => {
    onPick(input.files?.[0] ?? null);
    input.value = '';
  });
  if (onCancel) {
    input.addEventListener('cancel', onCancel);
  }
  return input;
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
