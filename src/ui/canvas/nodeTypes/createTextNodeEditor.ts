import { asString } from '../../../core/nodeData';
import { normalizeTextNodeData, type TextNodeData } from '../../../domain/textNodeData';
import { createTextStylePanel } from '../../textStyle/createTextStylePanel';
import { textStylePresetsForTheme } from '../../textStyle/textStyleTheme';
import { prepareInlineEditorMount, stopEvent } from '../inlineEditorDom';
import type { CanvasTheme } from '../theme';
import type { NodeInteractionController } from '../nodeDefinition/nodeDefinitionTypes';

type TextNodeEditorConfig = {
  mount: HTMLElement;
  data: TextNodeData;
  theme: CanvasTheme;
  commit: (nextData: TextNodeData) => void;
  close: () => void;
};

export function createTextNodeEditor({
  mount,
  data,
  theme,
  commit,
  close,
}: TextNodeEditorConfig): NodeInteractionController {
  prepareInlineEditorMount(mount, 'node-inline-details-editor node-inline-text-editor');

  const panel = document.createElement('form');
  panel.className = 'node-details-editor-panel text-node-editor-panel';
  panel.addEventListener('pointerdown', stopEvent);
  panel.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      panel.requestSubmit();
    }
  });
  mount.append(panel);

  const heading = document.createElement('strong');
  heading.className = 'node-details-editor-title';
  heading.textContent = 'Text';

  const textLabel = document.createElement('label');
  textLabel.className = 'node-details-editor-field';
  const textLabelText = document.createElement('span');
  textLabelText.textContent = 'Text';
  const textArea = document.createElement('textarea');
  textArea.value = data.text;
  textArea.rows = 8;
  textLabel.append(textLabelText, textArea);

  const stylePanel = createTextStylePanel({
    value: data.style,
    presetStyles: textStylePresetsForTheme(theme),
  });

  const actions = document.createElement('div');
  actions.className = 'node-details-editor-actions';
  const save = document.createElement('button');
  save.type = 'submit';
  save.className = 'primary';
  save.textContent = 'Save';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', close);
  actions.append(save, cancel);

  panel.append(heading, textLabel, stylePanel.element, actions);
  panel.addEventListener('submit', (event) => {
    event.preventDefault();
    commit(normalizeTextNodeData({
      text: asString(textArea.value, ''),
      style: stylePanel.readValue(),
    }));
    close();
  });

  return {
    focus() {
      textArea.focus({ preventScroll: true });
      textArea.select();
    },
    dispose() {
      stylePanel.dispose();
    },
  };
}
