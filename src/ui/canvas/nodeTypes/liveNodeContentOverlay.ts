import { asString } from '../../../core/nodeData';
import { CARD_ACCENTS, cardAccentLabel, normalizeCardNodeData, type CardNodeData } from '../../../domain/cardNodeData';
import { BuiltInNodeTypes } from '../../../domain/BuiltInNodeTypes';
import {
  addChecklistItem,
  MAX_CHECKLIST_ITEMS,
  normalizeChecklistNodeData,
  removeChecklistItem,
  setChecklistItemChecked,
  setChecklistItemText,
  type ChecklistNodeData,
} from '../../../domain/checklistNodeData';
import { normalizeTableNodeData, type TableNodeData } from '../../../domain/tableNodeData';
import { normalizeTextNodeData, type TextNodeData } from '../../../domain/textNodeData';
import {
  DEFAULT_TEXT_STYLE,
  TEXT_STYLE_ALIGNMENTS,
  normalizeTextStyle,
  textStyleWithPreset,
  type TextStyle,
  type TextStyleAlignment,
  type TextStylePreset,
} from '../../../domain/textStyle';
import { textStylePresetsForTheme } from '../../textStyle/textStyleTheme';
import type { CanvasTheme } from '../theme';
import type { CanvasNode, NodeData } from '../../../core/nodePrimitives';

export type LiveNodeContentOverlay = {
  root: HTMLDivElement;
  update(node: CanvasNode): void;
  flush(): void;
  dispose(): void;
};

type LiveNodeContentOverlayConfig = {
  node: CanvasNode;
  theme: CanvasTheme;
  commit: (nextData: NodeData) => void;
};

export function hasLiveNodeContentOverlay(node: CanvasNode) {
  return node.type === BuiltInNodeTypes.card ||
    node.type === BuiltInNodeTypes.text ||
    node.type === BuiltInNodeTypes.table ||
    node.type === BuiltInNodeTypes.check;
}

export function createLiveNodeContentOverlay({ node, theme, commit }: LiveNodeContentOverlayConfig): LiveNodeContentOverlay | null {
  switch (node.type) {
    case BuiltInNodeTypes.card:
      return createCardOverlay(node, commit);
    case BuiltInNodeTypes.text:
      return createTextOverlay(node, theme, commit);
    case BuiltInNodeTypes.table:
      return createTableOverlay(node, commit);
    case BuiltInNodeTypes.check:
      return createChecklistOverlay(node, commit);
    default:
      return null;
  }
}

function createCardOverlay(node: CanvasNode, commit: (nextData: NodeData) => void): LiveNodeContentOverlay {
  let draft = normalizeCardNodeData(node.data);
  let committed = { ...draft };
  const root = overlayRoot('node-live-card');

  const title = document.createElement('input');
  title.className = 'node-live-title';
  title.type = 'text';
  title.placeholder = 'Untitled work item';
  title.setAttribute('aria-label', 'Work item title');

  const detail = document.createElement('textarea');
  detail.className = 'node-live-card-detail';
  detail.placeholder = 'Add detail';
  detail.setAttribute('aria-label', 'Work item detail');

  const accentControls = document.createElement('div');
  accentControls.className = 'node-live-segmented';
  accentControls.setAttribute('role', 'toolbar');
  accentControls.setAttribute('aria-label', 'Work item type');
  const accentButtons = CARD_ACCENTS.map((accent) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = cardAccentLabel(accent);
    button.dataset.accent = accent;
    button.addEventListener('click', () => {
      draft = { ...draft, accent };
      sync();
      flush();
      title.focus({ preventScroll: true });
    });
    accentControls.append(button);
    return button;
  });

  title.addEventListener('input', () => {
    draft = { ...draft, title: title.value };
  });
  detail.addEventListener('input', () => {
    draft = { ...draft, detail: detail.value };
  });
  root.addEventListener('focusout', (event) => {
    if (!root.contains(event.relatedTarget as Node | null)) flush();
  });
  root.append(title, detail, accentControls);
  sync();

  return {
    root,
    update(nextNode) {
      if (root.contains(document.activeElement)) return;
      draft = normalizeCardNodeData(nextNode.data);
      committed = { ...draft };
      sync();
    },
    flush,
    dispose() {
      flush();
      root.remove();
    },
  };

  function sync() {
    title.value = draft.title;
    detail.value = draft.detail;
    for (const button of accentButtons) button.setAttribute('aria-pressed', String(button.dataset.accent === draft.accent));
  }

  function flush() {
    const next = normalizeCardNodeData(draft);
    if (sameData(committed, next)) return;
    committed = { ...next };
    commit(next);
  }
}

function createTextOverlay(node: CanvasNode, theme: CanvasTheme, commit: (nextData: NodeData) => void): LiveNodeContentOverlay {
  let draft = normalizeTextNodeData(node.data);
  let committed = normalizeTextNodeData(node.data);
  const root = overlayRoot('node-live-text');
  const textarea = document.createElement('textarea');
  textarea.className = 'node-live-textarea';
  textarea.placeholder = 'Empty note';
  textarea.setAttribute('aria-label', 'Note text');
  const toolbar = createTextToolbar({
    root,
    textarea,
    theme,
    readDraft: () => draft,
    writeDraft(nextStyle) {
      draft = normalizeTextNodeData({ ...draft, style: nextStyle });
      applyTextStyle(textarea, draft);
    },
    flush,
  });
  textarea.addEventListener('input', () => {
    draft = normalizeTextNodeData({ ...draft, text: textarea.value });
  });
  root.addEventListener('focusin', () => toolbar.show());
  root.addEventListener('focusout', (event) => {
    if (root.contains(event.relatedTarget as Node | null)) return;
    flush();
    toolbar.hide();
  });
  root.append(textarea, toolbar.element);
  sync();
  window.addEventListener('resize', toolbar.position);

  return {
    root,
    update(nextNode) {
      if (root.contains(document.activeElement)) return;
      draft = normalizeTextNodeData(nextNode.data);
      committed = normalizeTextNodeData(nextNode.data);
      sync();
      toolbar.sync();
    },
    flush,
    dispose() {
      flush();
      window.removeEventListener('resize', toolbar.position);
      root.remove();
    },
  };

  function sync() {
    textarea.value = draft.text;
    applyTextStyle(textarea, draft);
    toolbar.sync();
    toolbar.position();
  }

  function flush() {
    const next = normalizeTextNodeData({ ...draft, text: asString(draft.text, '') });
    if (sameData(committed, next)) return;
    committed = next;
    commit(next);
  }
}

function createTextToolbar(config: {
  root: HTMLDivElement;
  textarea: HTMLTextAreaElement;
  theme: CanvasTheme;
  readDraft: () => TextNodeData;
  writeDraft: (nextStyle: TextStyle) => void;
  flush: () => void;
}) {
  const presetStyles = textStylePresetsForTheme(config.theme);
  const toolbar = document.createElement('div');
  toolbar.className = 'text-node-toolbar node-live-text-toolbar';
  toolbar.hidden = true;
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', 'Text style');

  const preset = createPresetControl(normalizeTextStyle(config.readDraft().style).preset);
  const size = createSizeControl(normalizeTextStyle(config.readDraft().style).fontSize);
  const bold = createToggleButton('B', 'Bold', false);
  const italic = createToggleButton('I', 'Italic', false);
  const underline = createToggleButton('U', 'Underline', false);
  const color = createColorControl('Text color', DEFAULT_TEXT_STYLE.color, DEFAULT_TEXT_STYLE.color);
  const fill = createColorControl('Fill color', '#ffffff', '#ffffff');
  const clearFill = createFillToggleButton(false, '#ffffff');
  const alignmentButtons = TEXT_STYLE_ALIGNMENTS.map((alignment) => createAlignmentButton(alignment, 'left'));

  preset.addEventListener('change', () => {
    const nextPreset = preset.value as TextStylePreset;
    const current = normalizeTextStyle(config.readDraft().style);
    const nextStyle = nextPreset === 'custom' ?
      normalizeTextStyle({ ...current, preset: 'custom' }) :
      textStyleWithPreset(nextPreset, presetStyles[nextPreset]);
    applyStyle(nextStyle);
  });
  size.addEventListener('input', () => {
    if (!Number.isFinite(size.valueAsNumber)) return;
    applyStyle(normalizeTextStyle({ ...config.readDraft().style, fontSize: size.valueAsNumber, preset: 'custom' }), {
      preserveActiveSizeInput: true,
    });
  });
  size.addEventListener('blur', () => {
    sync();
    config.flush();
  });
  bold.addEventListener('click', () => {
    const style = normalizeTextStyle(config.readDraft().style);
    applyStyle(normalizeTextStyle({ ...style, fontWeight: style.fontWeight >= 600 ? 400 : 700, preset: 'custom' }));
    config.textarea.focus({ preventScroll: true });
  });
  italic.addEventListener('click', () => {
    const style = normalizeTextStyle(config.readDraft().style);
    applyStyle(normalizeTextStyle({ ...style, fontStyle: style.fontStyle === 'italic' ? 'normal' : 'italic', preset: 'custom' }));
    config.textarea.focus({ preventScroll: true });
  });
  underline.addEventListener('click', () => {
    const style = normalizeTextStyle(config.readDraft().style);
    applyStyle(normalizeTextStyle({ ...style, textDecoration: style.textDecoration === 'underline' ? 'none' : 'underline', preset: 'custom' }));
    config.textarea.focus({ preventScroll: true });
  });
  color.addEventListener('input', () => {
    applyStyle(normalizeTextStyle({ ...config.readDraft().style, color: color.value, preset: 'custom' }));
  });
  fill.addEventListener('input', () => {
    applyStyle(normalizeTextStyle({ ...config.readDraft().style, backgroundColor: fill.value, preset: 'custom' }));
  });
  clearFill.addEventListener('click', () => {
    const style = normalizeTextStyle(config.readDraft().style);
    applyStyle(normalizeTextStyle({
      ...style,
      backgroundColor: style.backgroundColor === 'transparent' ? fill.value : 'transparent',
      preset: 'custom',
    }));
    config.textarea.focus({ preventScroll: true });
  });
  for (const button of alignmentButtons) {
    button.addEventListener('click', () => {
      applyStyle(normalizeTextStyle({ ...config.readDraft().style, align: button.dataset.align as TextStyleAlignment, preset: 'custom' }));
      config.textarea.focus({ preventScroll: true });
    });
  }

  toolbar.append(
    wrapToolbarControl('Style', preset),
    wrapToolbarControl('Size', size),
    separator(),
    bold,
    italic,
    underline,
    separator(),
    ...alignmentButtons,
    separator(),
    wrapToolbarControl('Color', color),
    clearFill,
    wrapToolbarControl('Fill', fill),
  );
  toolbar.addEventListener('pointerdown', (event) => event.stopPropagation());
  toolbar.addEventListener('keydown', (event) => event.stopPropagation());
  sync();

  return {
    element: toolbar,
    show() {
      toolbar.hidden = false;
      position();
    },
    hide() {
      toolbar.hidden = true;
    },
    sync,
    position,
  };

  function applyStyle(nextStyle: TextStyle, options: { preserveActiveSizeInput?: boolean } = {}) {
    config.writeDraft(nextStyle);
    sync(options);
    position();
  }

  function sync(options: { preserveActiveSizeInput?: boolean } = {}) {
    const style = normalizeTextStyle(config.readDraft().style);
    preset.value = style.preset;
    if (!options.preserveActiveSizeInput || document.activeElement !== size) size.value = String(style.fontSize);
    bold.setAttribute('aria-pressed', String(style.fontWeight >= 600));
    italic.setAttribute('aria-pressed', String(style.fontStyle === 'italic'));
    underline.setAttribute('aria-pressed', String(style.textDecoration === 'underline'));
    color.value = colorInputValue(style.color, DEFAULT_TEXT_STYLE.color);
    fill.value = colorInputValue(style.backgroundColor, '#ffffff');
    clearFill.setAttribute('aria-pressed', String(style.backgroundColor !== 'transparent'));
    clearFill.querySelector<HTMLElement>('.text-node-fill-swatch')?.style.setProperty('background-color', colorInputValue(style.backgroundColor, '#ffffff'));
    for (const button of alignmentButtons) button.setAttribute('aria-pressed', String(button.dataset.align === style.align));
  }

  function position() {
    if (toolbar.hidden) return;
    const nodeRect = config.root.getBoundingClientRect();
    const toolbarRect = toolbar.getBoundingClientRect();
    const margin = 8;
    const gap = 6;
    const left = clamp(nodeRect.left, margin, window.innerWidth - toolbarRect.width - margin);
    const topCandidate = nodeRect.top - toolbarRect.height - gap;
    const top = topCandidate >= margin ?
      topCandidate :
      clamp(nodeRect.bottom + gap, margin, window.innerHeight - toolbarRect.height - margin);
    toolbar.style.left = `${left}px`;
    toolbar.style.top = `${top}px`;
  }
}

function createTableOverlay(node: CanvasNode, commit: (nextData: NodeData) => void): LiveNodeContentOverlay {
  let draft = normalizeTableNodeData(node.data);
  let committed = committedTableData(draft);
  const root = overlayRoot('node-live-table');

  const title = document.createElement('input');
  title.className = 'node-live-title';
  title.type = 'text';
  title.placeholder = 'Table';
  title.setAttribute('aria-label', 'Table title');
  title.addEventListener('input', () => {
    draft = { ...draft, title: title.value };
  });

  const grid = document.createElement('div');
  grid.className = 'node-live-table-grid';

  const toolbar = document.createElement('div');
  toolbar.className = 'node-live-toolbar';
  const addRow = document.createElement('button');
  addRow.type = 'button';
  addRow.textContent = '+ Row';
  addRow.setAttribute('aria-label', 'Add table row');
  addRow.addEventListener('click', () => {
    draft = { ...draft, rows: [...draft.rows, emptyRow(draft.columns.length)] };
    renderGrid();
    focusTableCell(draft.rows.length - 1, 0);
  });
  const addColumn = document.createElement('button');
  addColumn.type = 'button';
  addColumn.textContent = '+ Column';
  addColumn.setAttribute('aria-label', 'Add table column');
  addColumn.addEventListener('click', () => {
    draft = {
      ...draft,
      columns: [...draft.columns, `Column ${draft.columns.length + 1}`],
      rows: draft.rows.map((row) => [...row, '']),
    };
    renderGrid();
    focusTableHeader(draft.columns.length - 1);
  });
  toolbar.append(addRow, addColumn);

  title.addEventListener('blur', flush);
  root.addEventListener('focusout', (event) => {
    if (!root.contains(event.relatedTarget as Node | null)) flush();
  });
  root.append(title, grid, toolbar);
  sync();

  return {
    root,
    update(nextNode) {
      if (root.contains(document.activeElement)) return;
      draft = normalizeTableNodeData(nextNode.data);
      committed = committedTableData(draft);
      sync();
    },
    flush,
    dispose() {
      flush();
      root.remove();
    },
  };

  function sync() {
    title.value = draft.title;
    renderGrid();
  }

  function renderGrid() {
    grid.replaceChildren();
    grid.style.gridTemplateColumns = `repeat(${Math.max(1, draft.columns.length)}, minmax(72px, 1fr))`;
    draft.columns.forEach((column, columnIndex) => {
      const header = document.createElement('input');
      header.className = 'node-live-table-cell node-live-table-header-cell';
      header.type = 'text';
      header.value = column;
      header.placeholder = `Column ${columnIndex + 1}`;
      header.dataset.columnIndex = String(columnIndex);
      header.setAttribute('aria-label', `Column ${columnIndex + 1} header`);
      header.addEventListener('input', () => {
        const columns = [...draft.columns];
        columns[columnIndex] = header.value;
        draft = { ...draft, columns };
      });
      header.addEventListener('blur', flush);
      grid.append(header);
    });
    const editableRows = draft.rows.length + 1;
    for (let rowIndex = 0; rowIndex < editableRows; rowIndex += 1) {
      const isAddRow = rowIndex === draft.rows.length;
      for (let columnIndex = 0; columnIndex < draft.columns.length; columnIndex += 1) {
        const cell = document.createElement('input');
        cell.className = isAddRow ? 'node-live-table-cell node-live-table-add-cell' : 'node-live-table-cell';
        cell.type = 'text';
        cell.value = draft.rows[rowIndex]?.[columnIndex] ?? '';
        cell.placeholder = isAddRow && columnIndex === 0 ? 'Add row' : '';
        cell.dataset.rowIndex = String(rowIndex);
        cell.dataset.columnIndex = String(columnIndex);
        cell.setAttribute('aria-label', `Row ${rowIndex + 1}, column ${columnIndex + 1}`);
        cell.addEventListener('input', () => updateTableCell(rowIndex, columnIndex, cell.value));
        cell.addEventListener('blur', flush);
        cell.addEventListener('keydown', (event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          flush();
          if (rowIndex >= draft.rows.length - 1) {
            draft = { ...draft, rows: [...draft.rows, emptyRow(draft.columns.length)] };
            renderGrid();
          }
          focusTableCell(Math.min(rowIndex + 1, draft.rows.length), columnIndex);
        });
        grid.append(cell);
      }
    }
  }

  function updateTableCell(rowIndex: number, columnIndex: number, value: string) {
    const rows = draft.rows.map((row) => normalizeTableRow(row, draft.columns.length));
    while (rows.length <= rowIndex) rows.push(emptyRow(draft.columns.length));
    rows[rowIndex][columnIndex] = value;
    draft = { ...draft, rows };
  }

  function focusTableHeader(columnIndex: number) {
    grid.querySelector<HTMLInputElement>(`.node-live-table-header-cell[data-column-index="${columnIndex}"]`)?.focus({ preventScroll: true });
  }

  function focusTableCell(rowIndex: number, columnIndex: number) {
    grid.querySelector<HTMLInputElement>(`.node-live-table-cell[data-row-index="${rowIndex}"][data-column-index="${columnIndex}"]`)?.focus({ preventScroll: true });
  }

  function flush() {
    const next = committedTableData(draft);
    if (sameData(committed, next)) return;
    committed = next;
    commit(next);
  }
}

function createChecklistOverlay(node: CanvasNode, commit: (nextData: NodeData) => void): LiveNodeContentOverlay {
  let draft = cloneChecklistData(normalizeChecklistNodeData(node.data));
  let committed = cloneChecklistData(draft);
  let addValue = '';
  const root = overlayRoot('node-live-checklist');

  const title = document.createElement('input');
  title.className = 'node-live-title';
  title.type = 'text';
  title.placeholder = 'Checklist';
  title.setAttribute('aria-label', 'Checklist title');
  title.addEventListener('input', () => {
    draft = { ...draft, title: title.value };
    syncSummary();
  });

  const summary = document.createElement('div');
  summary.className = 'node-live-checklist-summary';
  const progress = document.createElement('span');
  progress.className = 'node-live-checklist-progress';
  const count = document.createElement('span');
  count.className = 'node-live-checklist-count';
  summary.append(progress, count);

  const list = document.createElement('div');
  list.className = 'node-live-checklist-items';

  const addRow = document.createElement('div');
  addRow.className = 'node-live-checklist-add-row';
  const addInput = document.createElement('input');
  addInput.type = 'text';
  addInput.placeholder = 'Add item';
  addInput.setAttribute('aria-label', 'New checklist item');
  addInput.addEventListener('input', () => {
    addValue = addInput.value;
    syncAddInput();
  });
  addInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    addItem();
  });
  const addButton = document.createElement('button');
  addButton.type = 'button';
  addButton.textContent = '+';
  addButton.setAttribute('aria-label', 'Add checklist item');
  addButton.addEventListener('click', addItem);
  addRow.append(addInput, addButton);

  title.addEventListener('blur', flush);
  root.addEventListener('focusout', (event) => {
    if (!root.contains(event.relatedTarget as Node | null)) flush();
  });
  root.append(title, summary, list, addRow);
  sync();

  return {
    root,
    update(nextNode) {
      if (root.contains(document.activeElement)) return;
      draft = cloneChecklistData(normalizeChecklistNodeData(nextNode.data));
      committed = cloneChecklistData(draft);
      sync();
    },
    flush,
    dispose() {
      flush();
      root.remove();
    },
  };

  function sync() {
    title.value = draft.title;
    renderRows();
    syncSummary();
    syncAddInput();
  }

  function renderRows() {
    list.replaceChildren();
    if (!draft.items.length) {
      const empty = document.createElement('p');
      empty.className = 'node-live-empty';
      empty.textContent = 'No items yet';
      list.append(empty);
      return;
    }
    for (const item of draft.items) {
      const row = document.createElement('div');
      row.className = 'node-live-checklist-row';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = item.checked;
      checkbox.setAttribute('aria-label', item.checked ? `Mark ${item.text || 'item'} not done` : `Mark ${item.text || 'item'} done`);
      checkbox.addEventListener('change', () => {
        draft = setChecklistItemChecked(draft, item.id, checkbox.checked);
        renderRows();
        syncSummary();
        flush();
      });
      const input = document.createElement('input');
      input.type = 'text';
      input.value = item.text;
      input.setAttribute('aria-label', 'Checklist item text');
      input.addEventListener('input', () => {
        draft = setChecklistItemText(draft, item.id, input.value);
      });
      input.addEventListener('blur', flush);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'node-live-row-remove';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `Delete ${item.text || 'checklist item'}`);
      remove.addEventListener('click', () => {
        draft = removeChecklistItem(draft, item.id);
        renderRows();
        syncSummary();
        flush();
      });
      row.append(checkbox, input, remove);
      list.append(row);
    }
  }

  function syncSummary() {
    const done = draft.items.filter((item) => item.checked).length;
    const total = draft.items.length;
    count.textContent = total ? `${done}/${total} done` : 'Empty';
    progress.style.width = total ? `${Math.round((done / total) * 100)}%` : '0%';
  }

  function syncAddInput() {
    addInput.value = addValue;
    addInput.disabled = draft.items.length >= MAX_CHECKLIST_ITEMS;
    addButton.disabled = !addValue.trim() || draft.items.length >= MAX_CHECKLIST_ITEMS;
  }

  function addItem() {
    const next = addChecklistItem(draft, addValue);
    if (next === draft) return;
    draft = next;
    addValue = '';
    sync();
    flush();
    addInput.focus({ preventScroll: true });
  }

  function flush() {
    const next = cloneChecklistData(normalizeChecklistNodeData(draft));
    if (sameData(committed, next)) return;
    committed = cloneChecklistData(next);
    commit(next);
  }
}

function overlayRoot(className: string) {
  const root = document.createElement('div');
  root.className = `node-live-content-mount ${className}`;
  root.addEventListener('pointerdown', (event) => event.stopPropagation());
  root.addEventListener('dblclick', (event) => event.stopPropagation());
  root.addEventListener('wheel', (event) => event.stopPropagation());
  root.addEventListener('keydown', (event) => event.stopPropagation());
  return root;
}

function applyTextStyle(textarea: HTMLTextAreaElement, data: TextNodeData) {
  const style = normalizeTextStyle(data.style);
  textarea.style.fontFamily = style.fontFamily;
  textarea.style.fontSize = `${style.fontSize}px`;
  textarea.style.fontWeight = String(style.fontWeight);
  textarea.style.fontStyle = style.fontStyle;
  textarea.style.textDecoration = style.textDecoration;
  textarea.style.color = style.color;
  textarea.style.backgroundColor = style.backgroundColor;
  textarea.style.textAlign = style.align === 'justify' ? 'left' : style.align;
  textarea.style.lineHeight = `${style.lineHeight}px`;
  textarea.style.letterSpacing = `${style.letterSpacing}px`;
  textarea.style.textTransform = style.textTransform;
  textarea.style.opacity = String(style.opacity);
  textarea.style.padding = `${style.padding.top}px ${style.padding.right}px ${style.padding.bottom}px ${style.padding.left}px`;
  textarea.style.borderStyle = style.border.style;
  textarea.style.borderWidth = `${style.border.width}px`;
  textarea.style.borderColor = style.border.color;
  textarea.style.borderRadius = `${style.border.radius}px`;
}

function createPresetControl(value: TextStylePreset) {
  const select = document.createElement('select');
  select.setAttribute('aria-label', 'Text style preset');
  const labels: Record<TextStylePreset, string> = {
    body: 'Body',
    heading: 'Heading',
    label: 'Label',
    caption: 'Caption',
    custom: 'Custom',
  };
  for (const preset of ['body', 'heading', 'label', 'caption', 'custom'] as const) {
    const option = document.createElement('option');
    option.value = preset;
    option.textContent = labels[preset];
    select.append(option);
  }
  select.value = value;
  return select;
}

function createSizeControl(value: number) {
  const input = document.createElement('input');
  input.type = 'number';
  input.min = '8';
  input.max = '96';
  input.step = '1';
  input.value = String(value);
  input.setAttribute('aria-label', 'Text size');
  return input;
}

function createColorControl(label: string, value: string, fallback: string) {
  const input = document.createElement('input');
  input.type = 'color';
  input.value = colorInputValue(value, fallback);
  input.setAttribute('aria-label', label);
  return input;
}

function createToggleButton(label: string, ariaLabel: string, active: boolean) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.setAttribute('aria-label', ariaLabel);
  button.setAttribute('aria-pressed', String(active));
  return button;
}

function createAlignmentButton(alignment: TextStyleAlignment, activeAlignment: TextStyleAlignment) {
  const button = createToggleButton('', `Align ${alignment}`, alignment === activeAlignment);
  const icon = document.createElement('span');
  icon.className = `text-node-align-icon ${alignment}`;
  icon.setAttribute('aria-hidden', 'true');
  icon.append(document.createElement('span'), document.createElement('span'), document.createElement('span'));
  button.append(icon);
  button.dataset.align = alignment;
  return button;
}

function createFillToggleButton(active: boolean, value: string) {
  const button = createToggleButton('', 'Toggle fill', active);
  button.className = 'text-node-fill-toggle';
  const swatch = document.createElement('span');
  swatch.className = 'text-node-fill-swatch';
  swatch.style.backgroundColor = value;
  swatch.setAttribute('aria-hidden', 'true');
  button.append(swatch);
  return button;
}

function wrapToolbarControl(label: string, control: HTMLElement) {
  const wrapper = document.createElement('label');
  wrapper.className = 'text-node-toolbar-field';
  const text = document.createElement('span');
  text.textContent = label;
  wrapper.append(text, control);
  return wrapper;
}

function separator() {
  const element = document.createElement('span');
  element.className = 'text-node-toolbar-separator';
  element.setAttribute('aria-hidden', 'true');
  return element;
}

function colorInputValue(value: string, fallback: string) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function committedTableData(data: TableNodeData) {
  return normalizeTableNodeData({
    ...data,
    columns: data.columns.map((column) => column.trim()).filter(Boolean),
    rows: data.rows.filter((row) => row.some((cell) => cell.trim())),
  });
}

function emptyRow(columnCount: number) {
  return Array.from({ length: columnCount }, () => '');
}

function normalizeTableRow(row: readonly string[], columnCount: number) {
  return Array.from({ length: columnCount }, (_, index) => row[index] ?? '');
}

function cloneChecklistData(data: ChecklistNodeData): ChecklistNodeData {
  return {
    ...data,
    items: data.items.map((item) => ({ ...item })),
  };
}

function sameData(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}
