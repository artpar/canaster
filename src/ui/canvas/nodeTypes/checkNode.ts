import { asString } from '../../../core/nodeData';
import { defineNodeType } from '../nodeDefinition/defineNodeType';
import { createInlineTextInput, prepareInlineEditorMount, stopEvent } from '../inlineEditorDom';
import type { JsonObject } from '../../../core/nodePrimitives';
import { clipText, drawNodeMeta, nodeLayout, nodeText } from '../nodeRendering';
import { nodeTypeSpecs } from '../nodeDefinition/nodeTypeSpecs';
import type { NodeContentRect, NodeDefinition, NodeInteractionRegion } from '../nodeDefinition/nodeDefinitionTypes';
import type { CanvasTheme } from '../theme';

const MAX_ITEMS = 100;

type CheckNodeItem = {
  id: string;
  text: string;
  checked: boolean;
} & JsonObject;

type CheckNodeData = {
  title: string;
  items: CheckNodeItem[];
} & JsonObject;

export const checkNodeDefinition: NodeDefinition<CheckNodeData> = defineNodeType({
  ...nodeTypeSpecs.check,
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
    const text = nodeText(theme);
    const layout = nodeLayout(theme);
    const done = data.items.filter((item) => item.checked).length;
    const total = data.items.length;

    if (state.quality === 'compact' && !state.selected && !state.hovered) return;

    const metaY = layout.titleY;
    const itemsY = layout.titleY + layout.labelLineHeight + Math.round(layout.labelLineHeight * 0.6);
    drawNodeMeta(ctx, contentRect, total ? `${done}/${total} done` : 'No checklist items', theme, metaY);

    const rows = visibleRows(Math.max(0, contentRect.h - itemsY), layout);
    const visibleItems = data.items.slice(0, rows);
    const metrics = checklistMetrics(layout);
    let y = contentRect.y + itemsY;
    for (const item of visibleItems) {
      drawCheckbox(ctx, contentRect.x + layout.insetX, y + metrics.checkboxOffsetY, item.checked, theme);
      ctx.fillStyle = item.checked ? theme.mutedText : theme.bodyText;
      ctx.font = text.body;
      const deleteSpace = state.selected || state.hovered ? metrics.deleteHitSize : 0;
      const textX = contentRect.x + layout.insetX + metrics.textOffsetX;
      const itemLabel = clipText(ctx, item.text || 'Untitled item', Math.max(0, contentRect.w - layout.insetX - metrics.textOffsetX - deleteSpace));
      ctx.fillText(itemLabel, textX, y);
      if (item.checked) drawCompletedRule(ctx, textX, y, itemLabel, theme);
      if (state.selected || state.hovered) {
        drawDeleteControl(ctx, contentRect.x + contentRect.w - metrics.deleteHitSize, y + metrics.deleteOffsetY, theme);
      }
      y += layout.rowHeight;
    }

    if (visibleItems.length < rows) {
      drawAddCue(ctx, contentRect.x + layout.insetX, y + metrics.checkboxOffsetY, visibleItems.length ? 'Add item' : 'Add first item', theme);
    } else if (data.items.length > visibleItems.length) {
      ctx.fillStyle = theme.mutedText;
      ctx.font = text.label;
      ctx.fillText(`+${data.items.length - visibleItems.length} more`, contentRect.x + layout.insetX, contentRect.y + Math.max(0, contentRect.h - layout.labelLineHeight));
    }
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
  getInteractionRegions({ contentRect, data, theme }) {
    return checklistRegions(contentRect, data, theme);
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
});

function checklistRegions(contentRect: NodeContentRect, data: CheckNodeData, theme: CanvasTheme): NodeInteractionRegion[] {
  const layout = nodeLayout(theme);
  const metrics = checklistMetrics(layout);
  const itemsY = layout.titleY + layout.labelLineHeight + Math.round(layout.labelLineHeight * 0.6);
  const regions: NodeInteractionRegion[] = [{
    id: 'title',
    rect: { x: contentRect.x + layout.insetX, y: contentRect.y, w: Math.max(0, contentRect.w - layout.insetX * 2), h: layout.titleHeight + Math.round(layout.labelLineHeight * 0.15) },
    cursor: 'text',
    label: 'checklist title',
  }];
  const rows = visibleRows(Math.max(0, contentRect.h - itemsY), layout);
  const visibleItems = data.items.slice(0, rows);
  let y = contentRect.y + itemsY;
  for (const item of visibleItems) {
    regions.push({
      id: `item:${item.id}:checked`,
      rect: { x: contentRect.x + layout.insetX, y: y - metrics.hitLift, w: metrics.deleteHitSize, h: layout.rowHeight + metrics.hitLift },
      cursor: 'pointer',
      label: 'checklist item',
    });
    regions.push({
      id: `item:${item.id}:text`,
      rect: { x: contentRect.x + layout.insetX + metrics.textOffsetX, y: y - metrics.hitLift, w: Math.max(0, contentRect.w - layout.insetX - metrics.textOffsetX - metrics.deleteHitSize), h: layout.rowHeight + metrics.hitLift },
      cursor: 'text',
      label: 'checklist item',
    });
    regions.push({
      id: `item:${item.id}:delete`,
      rect: { x: contentRect.x + contentRect.w - metrics.deleteHitSize, y: y - metrics.hitLift, w: metrics.deleteHitSize, h: layout.rowHeight + metrics.hitLift },
      cursor: 'pointer',
      label: 'delete checklist item',
    });
    y += layout.rowHeight;
  }
  if (visibleItems.length < rows) {
    regions.push({
      id: 'add-item',
      rect: { x: contentRect.x + layout.insetX, y: y - metrics.hitLift, w: Math.max(0, contentRect.w - layout.insetX * 2), h: layout.rowHeight + metrics.hitLift },
      cursor: 'text',
      label: 'new checklist item',
    });
  } else if (data.items.length > visibleItems.length) {
    regions.push({
      id: 'open-list',
      rect: { x: contentRect.x + layout.insetX, y: contentRect.y + Math.max(0, contentRect.h - layout.footerHeight - metrics.hitLift), w: Math.max(0, contentRect.w - layout.insetX * 2), h: layout.footerHeight + metrics.hitLift },
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

function visibleRows(height: number, layout: ReturnType<typeof nodeLayout>) {
  const available = height - layout.contentY - layout.footerHeight;
  return Math.max(0, Math.min(5, Math.floor(available / layout.rowHeight)));
}

function checklistMetrics(layout: ReturnType<typeof nodeLayout>) {
  const checkboxSize = Math.max(10, Math.round(layout.rowHeight * 0.68));
  const deleteButtonSize = Math.max(14, Math.round(layout.rowHeight * 0.72));
  return {
    checkboxSize,
    checkboxOffsetY: Math.max(0, Math.round((layout.rowHeight - checkboxSize) / 2) - 1),
    deleteButtonSize,
    deleteOffsetY: Math.max(0, Math.round((layout.rowHeight - deleteButtonSize) / 2) - 1),
    deleteHitSize: Math.max(16, layout.rowHeight),
    hitLift: Math.max(1, Math.round(layout.rowHeight * 0.1)),
    textOffsetX: checkboxSize + Math.max(6, layout.insetX + 4),
  };
}

function nextChecklistItemId(items: CheckNodeItem[]) {
  const ids = new Set(items.map((item) => item.id));
  let counter = items.length + 1;
  let id = `item-${counter}`;
  while (ids.has(id)) id = `item-${++counter}`;
  return id;
}

function drawCheckbox(ctx: CanvasRenderingContext2D, x: number, y: number, checked: boolean, theme: CanvasTheme) {
  const layout = nodeLayout(theme);
  const { checkboxSize } = checklistMetrics(layout);
  ctx.strokeStyle = checked ? theme.selected : theme.mutedText;
  ctx.lineWidth = Math.max(1, layout.controlRadius * 0.35);
  ctx.strokeRect(x, y, checkboxSize, checkboxSize);
  if (!checked) return;
  ctx.beginPath();
  ctx.moveTo(x + checkboxSize * 0.21, y + checkboxSize * 0.54);
  ctx.lineTo(x + checkboxSize * 0.43, y + checkboxSize * 0.75);
  ctx.lineTo(x + checkboxSize * 0.83, y + checkboxSize * 0.27);
  ctx.strokeStyle = theme.selected;
  ctx.lineWidth = Math.max(1.4, layout.controlRadius * 0.45);
  ctx.stroke();
}

function drawCompletedRule(ctx: CanvasRenderingContext2D, x: number, y: number, label: string, theme: CanvasTheme) {
  const layout = nodeLayout(theme);
  const width = ctx.measureText(label).width;
  if (width <= 0) return;
  ctx.save();
  ctx.strokeStyle = theme.mutedText;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y + layout.bodyLineHeight * 0.52);
  ctx.lineTo(x + width, y + layout.bodyLineHeight * 0.52);
  ctx.stroke();
  ctx.restore();
}

function drawDeleteControl(ctx: CanvasRenderingContext2D, x: number, y: number, theme: CanvasTheme) {
  const layout = nodeLayout(theme);
  const { deleteButtonSize } = checklistMetrics(layout);
  const buttonX = x + Math.max(0, (layout.rowHeight - deleteButtonSize) / 2);
  ctx.save();
  ctx.strokeStyle = theme.nodeBorder;
  ctx.fillStyle = theme.nodeBg;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(buttonX, y, deleteButtonSize, deleteButtonSize, theme.nodeControlRadius);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = theme.mutedText;
  ctx.lineWidth = Math.max(1, layout.controlRadius * 0.32);
  ctx.beginPath();
  ctx.moveTo(buttonX + deleteButtonSize * 0.32, y + deleteButtonSize * 0.32);
  ctx.lineTo(buttonX + deleteButtonSize * 0.68, y + deleteButtonSize * 0.68);
  ctx.moveTo(buttonX + deleteButtonSize * 0.68, y + deleteButtonSize * 0.32);
  ctx.lineTo(buttonX + deleteButtonSize * 0.32, y + deleteButtonSize * 0.68);
  ctx.stroke();
  ctx.restore();
}

function drawAddCue(ctx: CanvasRenderingContext2D, x: number, y: number, label: string, theme: CanvasTheme) {
  const layout = nodeLayout(theme);
  const text = nodeText(theme);
  const { checkboxSize, textOffsetX } = checklistMetrics(layout);
  ctx.save();
  ctx.strokeStyle = theme.mutedText;
  ctx.lineWidth = Math.max(1, layout.controlRadius * 0.3);
  ctx.strokeRect(x, y, checkboxSize, checkboxSize);
  ctx.beginPath();
  ctx.moveTo(x + checkboxSize * 0.28, y + checkboxSize * 0.5);
  ctx.lineTo(x + checkboxSize * 0.72, y + checkboxSize * 0.5);
  ctx.moveTo(x + checkboxSize * 0.5, y + checkboxSize * 0.28);
  ctx.lineTo(x + checkboxSize * 0.5, y + checkboxSize * 0.72);
  ctx.stroke();
  ctx.fillStyle = theme.bodyText;
  ctx.font = text.body;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(label, x + textOffsetX, y - Math.max(0, Math.round((layout.bodyLineHeight - checkboxSize) / 2)));
  ctx.restore();
}
