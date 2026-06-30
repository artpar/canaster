import { isLocalAssetId, loadLocalAssetFile, loadLocalAssetObject, saveLocalAsset } from '../../../infra/browser/localAssets';
import { loadAssetFile, loadAssetObject, uploadWorkspaceAsset, type CanasterAssetObject } from '../../../infra/daptin/assets';
import { hasUsableStoredToken } from '../../../infra/daptin/daptinClient';
import { prepareInlineEditorMount, stopEvent } from '../inlineEditorDom';

export type FileAssetObject = CanasterAssetObject;

export function loadFileAssetObject(assetId: string): Promise<FileAssetObject> {
  return isLocalAssetId(assetId) ? loadLocalAssetObject(assetId) : loadAssetObject(assetId);
}

export function loadFileAssetFile(assetId: string): Promise<File> {
  return isLocalAssetId(assetId) ? loadLocalAssetFile(assetId) : loadAssetFile(assetId);
}

export async function saveFileAsset(file: File): Promise<FileAssetObject> {
  if (hasUsableStoredToken()) {
    const asset = await uploadWorkspaceAsset(file);
    return loadAssetObject(asset.id);
  }
  const asset = await saveLocalAsset(file);
  return loadLocalAssetObject(asset.id);
}

export function createFilePreviewShell(mount: HTMLElement, className: string, title: string) {
  prepareInlineEditorMount(mount, className);
  const panel = document.createElement('div');
  panel.className = 'file-preview-panel';
  panel.addEventListener('pointerdown', stopEvent);

  const header = document.createElement('div');
  header.className = 'file-preview-header';
  const heading = document.createElement('strong');
  heading.textContent = title;
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.textContent = 'Close';
  header.append(heading, closeButton);

  const body = document.createElement('div');
  body.className = 'file-preview-body';
  panel.append(header, body);
  mount.append(panel);

  return {
    body,
    closeButton,
    setMessage(message: string) {
      body.replaceChildren();
      const text = document.createElement('p');
      text.className = 'file-preview-message';
      text.textContent = message;
      body.append(text);
    },
  };
}
