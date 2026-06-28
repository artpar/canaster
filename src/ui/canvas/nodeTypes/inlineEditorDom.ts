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

export function createInlineTextInput({
  mount,
  className,
  value,
  placeholder,
  ariaLabel,
  commit,
  close,
}: {
  mount: HTMLElement;
  className: string;
  value: string;
  placeholder: string;
  ariaLabel: string;
  commit: (value: string) => void;
  close: () => void;
}) {
  prepareInlineEditorMount(mount, className);
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value;
  input.placeholder = placeholder;
  input.setAttribute('aria-label', ariaLabel);
  mount.append(input);
  const lifecycle = commitInputOnBlur({
    input,
    commit: () => commit(input.value),
    close,
  });
  return {
    focus: lifecycle.focus,
    dispose: lifecycle.dispose,
  };
}

export function createInlineTextarea({
  mount,
  className,
  value,
  placeholder,
  ariaLabel,
  commit,
  close,
}: {
  mount: HTMLElement;
  className: string;
  value: string;
  placeholder: string;
  ariaLabel: string;
  commit: (value: string) => void;
  close: () => void;
}) {
  prepareInlineEditorMount(mount, className);
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.placeholder = placeholder;
  textarea.setAttribute('aria-label', ariaLabel);
  mount.append(textarea);
  const lifecycle = commitInputOnBlur({
    input: textarea,
    commit: () => commit(textarea.value),
    close,
  });
  return {
    focus: lifecycle.focus,
    dispose: lifecycle.dispose,
  };
}
