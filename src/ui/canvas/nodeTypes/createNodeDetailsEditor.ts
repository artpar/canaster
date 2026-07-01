import { prepareInlineEditorMount, stopEvent } from '../inlineEditorDom';
import type { NodeInteractionController } from '../nodeDefinition/nodeDefinitionTypes';

type NodeDetailsField = {
  id: string;
  label: string;
  value: string;
  inputMode?: 'text' | 'email' | 'tel' | 'date' | 'time';
  options?: readonly { value: string; label: string }[];
  rows?: number;
};

type NodeDetailsEditorConfig<TData> = {
  mount: HTMLElement;
  className: string;
  title: string;
  fields: readonly NodeDetailsField[];
  commit: (nextData: TData) => void;
  close: () => void;
  buildData: (values: Record<string, string>) => TData;
};

export function createNodeDetailsEditor<TData>({
  mount,
  className,
  title,
  fields,
  commit,
  close,
  buildData,
}: NodeDetailsEditorConfig<TData>): NodeInteractionController {
  prepareInlineEditorMount(mount, className);
  const panel = document.createElement('form');
  panel.className = 'node-details-editor-panel';
  panel.addEventListener('pointerdown', stopEvent);
  panel.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  });
  mount.append(panel);

  const heading = document.createElement('strong');
  heading.className = 'node-details-editor-title';
  heading.textContent = title;
  panel.append(heading);

  const controls = new Map<string, HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>();
  for (const field of fields) {
    const label = document.createElement('label');
    label.className = 'node-details-editor-field';
    const labelText = document.createElement('span');
    labelText.textContent = field.label;
    label.append(labelText);

    const control = createFieldControl(field);
    controls.set(field.id, control);
    label.append(control);
    panel.append(label);
  }

  const actions = document.createElement('div');
  actions.className = 'node-details-editor-actions';
  const save = document.createElement('button');
  save.type = 'submit';
  save.className = 'primary';
  save.textContent = 'Save';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = 'Close';
  cancel.addEventListener('click', close);
  actions.append(save, cancel);
  panel.append(actions);

  panel.addEventListener('submit', (event) => {
    event.preventDefault();
    commit(buildData(fieldValues(controls)));
    close();
  });

  return {
    focus() {
      panel.querySelector<HTMLElement>('input, select, textarea, button')?.focus({ preventScroll: true });
    },
    dispose() {},
  };
}

function createFieldControl(field: NodeDetailsField) {
  if (field.options) {
    const select = document.createElement('select');
    select.value = field.value;
    for (const option of field.options) {
      const item = document.createElement('option');
      item.value = option.value;
      item.textContent = option.label;
      select.append(item);
    }
    return select;
  }
  if (field.rows) {
    const textarea = document.createElement('textarea');
    textarea.value = field.value;
    textarea.rows = field.rows;
    return textarea;
  }
  const input = document.createElement('input');
  input.type = field.inputMode ?? 'text';
  input.value = field.value;
  return input;
}

function fieldValues(controls: Map<string, HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
  const values: Record<string, string> = {};
  for (const [id, control] of controls) values[id] = control.value;
  return values;
}
