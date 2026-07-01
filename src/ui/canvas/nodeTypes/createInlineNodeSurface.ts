import { prepareInlineEditorMount, stopEvent } from '../inlineEditorDom';
import type { NodeInteractionController } from '../nodeDefinition/nodeDefinitionTypes';

type InlineNodeSurfaceConfig<TData> = {
  mount: HTMLElement;
  className: string;
  surfaceClassName?: string;
  initialData: TData;
  readDraft: () => TData;
  equals?: (initialData: TData, nextData: TData) => boolean;
  commit: (nextData: TData) => void;
  close: () => void;
  focus: (root: HTMLElement) => void;
};

type InlineNodeSurface<TData> = {
  root: HTMLDivElement;
  commitDraft(): void;
  commitAndClose(): void;
  cancel(): void;
  controller: NodeInteractionController;
};

export function createInlineNodeSurface<TData>({
  mount,
  className,
  surfaceClassName = 'node-inline-surface',
  initialData,
  readDraft,
  equals = sameInlineData,
  commit,
  close,
  focus,
}: InlineNodeSurfaceConfig<TData>): InlineNodeSurface<TData> {
  prepareInlineEditorMount(mount, className);
  const root = document.createElement('div');
  root.className = surfaceClassName;
  root.addEventListener('pointerdown', stopEvent);
  root.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      commitAndClose();
    }
  });
  root.addEventListener('focusout', (event) => {
    if (containsNode(root, event.relatedTarget)) return;
    window.setTimeout(() => {
      if (!containsNode(root, document.activeElement)) commitAndClose();
    });
  });
  mount.append(root);

  let closed = false;
  let canceled = false;
  let committed = false;

  const surface: InlineNodeSurface<TData> = {
    root,
    commitDraft,
    commitAndClose,
    cancel,
    controller: {
      focus() {
        focus(root);
      },
      dispose() {
        if (!canceled) commitDraft();
        closed = true;
      },
    },
  };

  return surface;

  function commitDraft() {
    if (canceled || committed) return;
    const nextData = readDraft();
    if (equals(initialData, nextData)) return;
    committed = true;
    commit(nextData);
  }

  function commitAndClose() {
    if (closed) return;
    commitDraft();
    closeEditor();
  }

  function cancel() {
    if (closed) return;
    canceled = true;
    closeEditor();
  }

  function closeEditor() {
    if (closed) return;
    closed = true;
    close();
  }
}

function containsNode(root: HTMLElement, target: EventTarget | null) {
  return target instanceof Node && root.contains(target);
}

function sameInlineData<TData>(initialData: TData, nextData: TData) {
  return JSON.stringify(initialData) === JSON.stringify(nextData);
}
