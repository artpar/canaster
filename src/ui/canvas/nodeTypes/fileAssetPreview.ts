import { prepareInlineEditorMount, stopEvent } from '../inlineEditorDom';

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
  closeButton.setAttribute('aria-label', 'Close preview');
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
