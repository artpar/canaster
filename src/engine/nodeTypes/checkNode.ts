import { BuiltInNodeTypes, type CheckNodeData, type CheckNodeItem, type JsonObject } from '../types';
import { asString } from './data';
import { createInlineTextInput, prepareInlineEditorMount, stopEvent } from './inlineEditorDom';
import { clipText, drawCompactNode, drawNodeMeta, drawNodeTitle, drawTypeBadge, nodeLayout, nodeText } from './rendering';
import type { NodeContentRect, NodeDefinition, NodeInteractionRegion } from './types';

const MAX_ITEMS = 100;
const CHECKBOX_SIZE = 12;

export const checkNodeDefinition: NodeDefinition<CheckNodeData> = {
  type: BuiltInNodeTypes.check,
  displayName: 'Checklist',
  roleDescription: 'Checklist',
  typeBadge: 'LIST',
  addMenu: {
    label: 'Checklist',
    detail: 'Actionable list with done count',
    badge: 'LIST',
  },
  defaultSize: { w: 280, h: 180 },
  minSize: { w: 180, h: 110 },
  createDefaultData() {
    return { title: 'Checklist', items: [] };
  },
  parseData(raw) {
    return {
      title: asString(raw.title, 'Checklist'),
      items: parseItems(raw.items),
    };
  },
  render({ ctx, data, theme, contentRect, state }) {
    const done = data.items.filter((item) => item.checked).length;
    const total = data.items.length;

    if (state.quality === 'compact' && !state.selected && !state.hovered) {
      drawCompactNode(ctx, contentRect, 'LIST', data.title || 'Checklist', theme);
      return;
    }

    drawNodeTitle(ctx, contentRect, data.title || 'Checklist', theme);
    drawNodeMeta(ctx, contentRect, total ? `${done}/${total} done` : 'No checklist items', theme);

    const rows = visibleRows(contentRect.h);
    const visibleItems = data.items.slice(0, rows);
    let y = contentRect.y + 48;
    for (const item of visibleItems) {
      drawCheckbox(ctx, contentRect.x + 4, y + 1, item.checked, theme);
      ctx.fillStyle = item.checked ? theme.mutedText : theme.bodyText;
      ctx.font = nodeText.body;
      const deleteSpace = state.selected || state.hovered ? 18 : 0;
      ctx.fillText(clipText(ctx, item.text || 'Untitled item', Math.max(0, contentRect.w - 28 - deleteSpace)), contentRect.x + 24, y);
      if (state.selected || state.hovered) {
        ctx.fillStyle = theme.mutedText;
        ctx.font = nodeText.label;
        ctx.fillText('x', contentRect.x + contentRect.w - 13, y);
      }
      y += 19;
    }

    if (visibleItems.length < rows) {
      ctx.fillStyle = theme.bodyText;
      ctx.font = nodeText.body;
      ctx.fillText(visibleItems.length ? 'Add item' : 'Add first item', contentRect.x + 4, y);
    } else if (data.items.length > visibleItems.length) {
      ctx.fillStyle = theme.mutedText;
      ctx.font = nodeText.label;
      ctx.fillText(`+${data.items.length - visibleItems.length} more`, contentRect.x + 4, contentRect.y + Math.max(0, contentRect.h - 18));
    }

    drawTypeBadge(ctx, contentRect, 'LIST', theme);
  },
  describe({ data }) {
    const done = data.items.filter((item) => item.checked).length;
    const total = data.items.length;
    return {
      label: data.title || 'Checklist',
      roleDescription: 'Checklist',
      details: [total ? `${done} of ${total} done` : 'No checklist items'],
      state: [],
      actions: [],
    };
  },
  getInteractionRegions({ contentRect, data }) {
    return checklistRegions(contentRect, data);
  },
  createInteraction(ctx) {
    const { data, region } = ctx;
    if (region.id === 'title') {
      return createChecklistInput(ctx.mount, data.title, 'Edit checklist title', (value) => {
        ctx.requestCommit({ ...data, title: value }, 'pointer');
      }, ctx.requestClose);
    }
    if (region.id === 'add-item') {
      return createChecklistInput(ctx.mount, '', 'Add checklist item', (value) => {
        const text = value.trim();
        if (!text) return;
        ctx.requestCommit({
          ...data,
          items: [...data.items, { id: nextChecklistItemId(data.items), text, checked: false }],
        }, 'pointer');
      }, ctx.requestClose);
    }
    if (region.id === 'open-list') {
      return createChecklistListEditor(ctx.mount, data, (nextData) => {
        ctx.requestCommit(nextData, 'pointer');
      }, ctx.requestClose);
    }
    const itemMatch = /^item:(.+):(checked|text|delete)$/.exec(region.id);
    if (!itemMatch) return null;
    const [, itemId, field] = itemMatch;
    const item = data.items.find((candidate) => candidate.id === itemId);
    if (!item) return null;
    if (field === 'checked') {
      ctx.requestCommit({
        ...data,
        items: data.items.map((candidate) => candidate.id === itemId ? { ...candidate, checked: !candidate.checked } : candidate),
      }, 'pointer');
      requestAnimationFrame(ctx.requestClose);
      return { dispose() {} };
    }
    if (field === 'delete') {
      ctx.requestCommit({
        ...data,
        items: data.items.filter((candidate) => candidate.id !== itemId),
      }, 'pointer');
      requestAnimationFrame(ctx.requestClose);
      return { dispose() {} };
    }
    return createChecklistInput(ctx.mount, item.text, 'Edit checklist item', (value) => {
      ctx.requestCommit({
        ...data,
        items: data.items.map((candidate) => candidate.id === itemId ? { ...candidate, text: value } : candidate),
      }, 'pointer');
    }, ctx.requestClose);
  },
};

function checklistRegions(contentRect: NodeContentRect, data: CheckNodeData): NodeInteractionRegion[] {
  const regions: NodeInteractionRegion[] = [{
    id: 'title',
    rect: { x: contentRect.x + nodeLayout.insetX, y: contentRect.y + nodeLayout.titleY, w: Math.max(0, contentRect.w - nodeLayout.insetX * 2), h: 19 },
    cursor: 'text',
    label: 'checklist title',
  }];
  const rows = visibleRows(contentRect.h);
  const visibleItems = data.items.slice(0, rows);
  let y = contentRect.y + 48;
  for (const item of visibleItems) {
    regions.push({
      id: `item:${item.id}:checked`,
      rect: { x: contentRect.x + 2, y: y - 1, w: 18, h: 18 },
      cursor: 'pointer',
      label: 'checklist item',
    });
    regions.push({
      id: `item:${item.id}:text`,
      rect: { x: contentRect.x + 24, y: y - 2, w: Math.max(0, contentRect.w - 46), h: 20 },
      cursor: 'text',
      label: 'checklist item',
    });
    regions.push({
      id: `item:${item.id}:delete`,
      rect: { x: contentRect.x + contentRect.w - 18, y: y - 2, w: 18, h: 20 },
      cursor: 'pointer',
      label: 'delete checklist item',
    });
    y += 19;
  }
  if (visibleItems.length < rows) {
    regions.push({
      id: 'add-item',
      rect: { x: contentRect.x + 4, y: y - 2, w: Math.max(0, contentRect.w - 8), h: 20 },
      cursor: 'text',
      label: 'new checklist item',
    });
  } else if (data.items.length > visibleItems.length) {
    regions.push({
      id: 'open-list',
      rect: { x: contentRect.x + 4, y: contentRect.y + Math.max(0, contentRect.h - 22), w: Math.max(0, contentRect.w - 8), h: 22 },
      cursor: 'pointer',
      label: 'checklist items',
    });
  }
  return regions;
}

function createChecklistListEditor(mount: HTMLElement, data: CheckNodeData, commit: (nextData: CheckNodeData) => void, close: () => void) {
  prepareInlineEditorMount(mount, 'node-inline-checklist-list-editor');
  const panel = document.createElement('div');
  panel.className = 'checklist-list-panel';
  panel.addEventListener('pointerdown', stopEvent);
  mount.append(panel);

  let draft = data.items.map((item) => ({ ...item }));
  let addValue = '';
  const commitDraft = () => commit({ ...data, items: draft });

  const render = () => {
    panel.replaceChildren();
    const list = document.createElement('div');
    list.className = 'checklist-list-items';
    for (const item of draft) {
      const row = document.createElement('div');
      row.className = 'checklist-list-row';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = item.checked;
      checkbox.setAttribute('aria-label', `Mark ${item.text || 'item'} ${item.checked ? 'not done' : 'done'}`);
      checkbox.addEventListener('change', () => {
        draft = draft.map((candidate) => candidate.id === item.id ? { ...candidate, checked: checkbox.checked } : candidate);
        commitDraft();
      });

      const input = document.createElement('input');
      input.type = 'text';
      input.value = item.text;
      input.setAttribute('aria-label', 'Checklist item text');
      input.addEventListener('change', () => {
        draft = draft.map((candidate) => candidate.id === item.id ? { ...candidate, text: input.value } : candidate);
        commitDraft();
      });
      input.addEventListener('keydown', stopEvent);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Delete';
      remove.setAttribute('aria-label', `Delete ${item.text || 'checklist item'}`);
      remove.addEventListener('click', () => {
        draft = draft.filter((candidate) => candidate.id !== item.id);
        commitDraft();
        render();
      });

      row.append(checkbox, input, remove);
      list.append(row);
    }

    const addRow = document.createElement('div');
    addRow.className = 'checklist-list-add-row';
    const addInput = document.createElement('input');
    addInput.type = 'text';
    addInput.placeholder = 'Add item';
    addInput.value = addValue;
    addInput.setAttribute('aria-label', 'New checklist item');
    addInput.addEventListener('input', () => {
      addValue = addInput.value;
    });
    addInput.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key !== 'Enter') return;
      event.preventDefault();
      addItem();
    });
    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.textContent = 'Add';
    addButton.addEventListener('click', addItem);
    addRow.append(addInput, addButton);

    panel.append(list, addRow);
    addInput.value = addValue;

    function addItem() {
      const text = addValue.trim();
      if (!text) return;
      draft = [...draft, { id: nextChecklistItemId(draft), text, checked: false }];
      addValue = '';
      commitDraft();
      render();
    }
  };

  render();
  return {
    focus() {
      panel.querySelector<HTMLInputElement>('input[type="text"]')?.focus({ preventScroll: true });
    },
    dispose() {},
  };
}

function createChecklistInput(mount: HTMLElement, value: string, label: string, commit: (value: string) => void, close: () => void) {
  return createInlineTextInput({
    mount,
    className: 'node-inline-checklist-editor',
    value,
    placeholder: label,
    ariaLabel: label,
    commit,
    close,
  });
}

function parseItems(value: unknown): CheckNodeItem[] {
  if (!Array.isArray(value)) return [];
  const parsed: CheckNodeItem[] = [];
  for (let index = 0; index < value.length && parsed.length < MAX_ITEMS; index += 1) {
    const item = parseItem(value[index], index);
    if (item) parsed.push(item);
  }
  return parsed;
}

function parseItem(value: unknown, index: number): CheckNodeItem | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as JsonObject;
  const text = typeof raw.text === 'string' ? raw.text : null;
  if (text === null) return null;
  const rawId = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : `item-${index + 1}`;
  return {
    id: rawId,
    text,
    checked: typeof raw.checked === 'boolean' ? raw.checked : false,
  };
}

function visibleRows(height: number) {
  const available = height - 72;
  return Math.max(0, Math.min(5, Math.floor(available / 19)));
}

function nextChecklistItemId(items: CheckNodeItem[]) {
  const ids = new Set(items.map((item) => item.id));
  let counter = items.length + 1;
  let id = `item-${counter}`;
  while (ids.has(id)) id = `item-${++counter}`;
  return id;
}

function drawCheckbox(ctx: CanvasRenderingContext2D, x: number, y: number, checked: boolean, theme: { bodyText: string; mutedText: string; selected: string }) {
  ctx.strokeStyle = checked ? theme.selected : theme.mutedText;
  ctx.lineWidth = 1.4;
  ctx.strokeRect(x, y, CHECKBOX_SIZE, CHECKBOX_SIZE);
  if (!checked) return;
  ctx.beginPath();
  ctx.moveTo(x + 2.5, y + 6.5);
  ctx.lineTo(x + 5.2, y + 9);
  ctx.lineTo(x + 10, y + 3.2);
  ctx.strokeStyle = theme.selected;
  ctx.lineWidth = 1.8;
  ctx.stroke();
}
