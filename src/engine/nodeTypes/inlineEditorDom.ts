export function prepareInlineEditorMount(mount: HTMLElement, className: string) {
  mount.classList.add('node-inline-editor');
  mount.classList.add(className);
  mount.addEventListener('pointerdown', stopEvent);
  mount.addEventListener('dblclick', stopEvent);
  mount.addEventListener('wheel', stopEvent);
}

export function stopEvent(event: Event) {
  event.stopPropagation();
}

export function commitInputOnBlur({
  input,
  commit,
  close,
}: {
  input: HTMLInputElement | HTMLTextAreaElement;
  commit: () => void;
  close: () => void;
}) {
  let canceled = false;
  let committed = false;

  const commitOnce = () => {
    if (canceled || committed) return;
    committed = true;
    commit();
    close();
  };

  input.addEventListener('keydown', (rawEvent) => {
    const event = rawEvent as KeyboardEvent;
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      canceled = true;
      close();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      commitOnce();
    }
  });
  input.addEventListener('blur', commitOnce);

  return {
    focus() {
      input.focus({ preventScroll: true });
      input.select();
    },
    dispose() {
      canceled = true;
    },
  };
}
