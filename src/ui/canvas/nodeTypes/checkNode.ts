import {
  addChecklistItem,
  MAX_CHECKLIST_ITEMS,
  normalizeChecklistNodeData,
  removeChecklistItem,
  setChecklistItemChecked,
  setChecklistItemText,
  type ChecklistNodeData,
} from '../../../domain/checklistNodeData';
import { defineNodeType } from '../nodeDefinition/defineNodeType';
import { createInlineTextInput, prepareInlineEditorMount, stopEvent } from '../inlineEditorDom';
import { clipText, drawNodeMeta, nodeLayout, nodeText } from '../nodeRendering';
import { nodeTypeSpecs } from '../nodeDefinition/nodeTypeSpecs';
import type { NodeContentRect, NodeDefinition, NodeInteractionRegion } from '../nodeDefinition/nodeDefinitionTypes';
import type { CanvasTheme } from '../theme';

export const checkNodeDefinition: NodeDefinition<ChecklistNodeData> = defineNodeType({
  ...nodeTypeSpecs.check,
  createDefaultData() {
    return { title: 'Checklist', items: [] };
  },
  parseData(raw) {
    return normalizeChecklistNodeData(raw);
  },
  render({ ctx, data, theme, contentRect, state }) {
    const text = nodeText(theme);
    const layout = nodeLayout(theme);
    const done = data.items.filter((item) => item.checked).length;
    const total = data.items.length;

    if (state.quality === 'compact' && !state.selected && !state.hovered) return;

    const metaY = layout.titleY;
    const itemsY = checklistItemsY(layout, total);
    drawNodeMeta(ctx, contentRect, total ? `${done}/${total} done` : 'No items yet', theme, metaY);
    if (total) drawProgressTrack(ctx, contentRect, done, total, theme, contentRect.y + checklistProgressY(layout));

    const rows = visibleRows(Math.max(0, contentRect.h - itemsY), layout);
    const visibleItems = data.items.slice(0, rows);
    const metrics = checklistMetrics(layout);
    let y = contentRect.y + itemsY;
    for (const item of visibleItems) {
      drawCheckbox(ctx, contentRect.x + layout.insetX, y + metrics.checkboxOffsetY, item.checked, theme);
      ctx.fillStyle = item.checked ? theme.mutedText : theme.bodyText;
      ctx.font = text.body;
      const textX = contentRect.x + layout.insetX + metrics.textOffsetX;
      const itemLabel = clipText(ctx, item.text || 'Untitled item', Math.max(0, contentRect.w - layout.insetX * 2 - metrics.textOffsetX));
      ctx.fillText(itemLabel, textX, y);
      if (item.checked) drawCompletedRule(ctx, textX, y, itemLabel, theme);
      y += layout.rowHeight;
    }

    if (visibleItems.length < rows) {
      drawAddCue(ctx, contentRect.x + layout.insetX, y + metrics.checkboxOffsetY, visibleItems.length ? 'Add item' : 'Add first item', theme);
    } else if (data.items.length > visibleItems.length) {
      ctx.fillStyle = theme.mutedText;
      ctx.font = text.label;
      const overflowLabel = `Open checklist (+${data.items.length - visibleItems.length})`;
      ctx.fillText(clipText(ctx, overflowLabel, Math.max(0, contentRect.w - layout.insetX * 2)), contentRect.x + layout.insetX, contentRect.y + Math.max(0, contentRect.h - layout.labelLineHeight));
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
    if (region.id === 'items') {
      return createChecklistListEditor(ctx.mount, data, (nextData) => {
        ctx.requestCommit(nextData, 'pointer');
      }, ctx.requestClose);
    }
    const checkedItemId = checkedItemRegionId(region.id);
    if (checkedItemId) {
      const item = data.items.find((candidate) => candidate.id === checkedItemId);
      if (!item) return null;
      const checked = !item.checked;
      ctx.requestCommit(setChecklistItemChecked(data, item.id, checked), 'pointer');
      playChecklistToggleBurst(ctx.mount, checked, ctx.requestClose);
      return { dispose() {} };
    }
    return null;
  },
});

function checklistRegions(contentRect: NodeContentRect, data: ChecklistNodeData, theme: CanvasTheme): NodeInteractionRegion[] {
  const layout = nodeLayout(theme);
  const metrics = checklistMetrics(layout);
  const itemsY = checklistItemsY(layout, data.items.length);
  const regions: NodeInteractionRegion[] = [
    {
      id: 'title',
      rect: { x: contentRect.x + layout.insetX, y: contentRect.y, w: Math.max(0, contentRect.w - layout.insetX * 2), h: layout.titleHeight + Math.round(layout.labelLineHeight * 0.15) },
      cursor: 'text',
      label: 'checklist title',
    },
    {
      id: 'items',
      rect: { x: contentRect.x + layout.insetX, y: contentRect.y + itemsY, w: Math.max(0, contentRect.w - layout.insetX * 2), h: Math.max(layout.rowHeight, contentRect.h - itemsY) },
      cursor: 'pointer',
      label: data.items.length ? 'edit checklist items' : 'add checklist item',
    },
  ];
  const rows = visibleRows(Math.max(0, contentRect.h - itemsY), layout);
  let y = contentRect.y + itemsY;
  for (const item of data.items.slice(0, rows)) {
    regions.push({
      id: `item:${item.id}:checked`,
      rect: {
        x: contentRect.x + layout.insetX - metrics.checkboxHitOutset,
        y: y + metrics.checkboxOffsetY - metrics.checkboxHitOutset,
        w: metrics.checkboxSize + metrics.checkboxHitOutset * 2,
        h: metrics.checkboxSize + metrics.checkboxHitOutset * 2,
      },
      cursor: 'pointer',
      label: item.checked ? `mark ${item.text || 'item'} not done` : `mark ${item.text || 'item'} done`,
      activation: 'single',
    });
    y += layout.rowHeight;
  }
  return regions;
}

function checkedItemRegionId(regionId: string) {
  const match = /^item:(.+):checked$/.exec(regionId);
  return match?.[1] ?? null;
}

function createChecklistListEditor(mount: HTMLElement, data: ChecklistNodeData, commit: (nextData: ChecklistNodeData) => void, close: () => void) {
  prepareInlineEditorMount(mount, 'node-inline-checklist-list-editor');
  const panel = document.createElement('div');
  panel.className = 'checklist-list-panel';
  panel.addEventListener('pointerdown', stopEvent);
  mount.append(panel);

  let draft: ChecklistNodeData = { ...data, items: data.items.map((item) => ({ ...item })) };
  let addValue = '';
  let closed = false;
  let saveOnDispose = true;
  let closeStarted = false;

  const closeWithMotion = () => {
    if (closeStarted) return;
    closeStarted = true;
    playChecklistEditorExit(panel, close);
  };

  const cancel = () => {
    if (closed) return;
    saveOnDispose = false;
    closed = true;
    closeWithMotion();
  };

  const commitAndClose = () => {
    if (closed) return;
    saveOnDispose = false;
    closed = true;
    commit(draft);
    closeWithMotion();
  };

  panel.addEventListener('keydown', (event) => {
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

  panel.addEventListener('focusout', (event) => {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && panel.contains(nextTarget)) return;
    requestAnimationFrame(() => {
      const active = document.activeElement;
      if (active instanceof Node && panel.contains(active)) return;
      commitAndClose();
    });
  });

  const render = () => {
    panel.replaceChildren();
    const list = document.createElement('div');
    list.className = 'checklist-list-items';
    if (!draft.items.length) {
      const empty = document.createElement('p');
      empty.className = 'checklist-list-empty';
      empty.textContent = 'No items yet';
      list.append(empty);
    }
    for (const item of draft.items) {
      const row = document.createElement('div');
      row.className = 'checklist-list-row';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = item.checked;
      checkbox.setAttribute('aria-label', `Mark ${item.text || 'item'} ${item.checked ? 'not done' : 'done'}`);
      checkbox.addEventListener('change', () => {
        draft = setChecklistItemChecked(draft, item.id, checkbox.checked);
        checkbox.setAttribute('aria-label', `Mark ${item.text || 'item'} ${checkbox.checked ? 'not done' : 'done'}`);
        render();
        panel.querySelector<HTMLInputElement>(`input[type="checkbox"][data-checklist-item-id="${CSS.escape(item.id)}"]`)?.focus({ preventScroll: true });
      });
      checkbox.dataset.checklistItemId = item.id;

      const input = document.createElement('input');
      input.type = 'text';
      input.value = item.text;
      input.setAttribute('aria-label', 'Checklist item text');
      input.addEventListener('input', () => {
        draft = setChecklistItemText(draft, item.id, input.value);
      });

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Remove';
      remove.className = 'checklist-list-remove';
      remove.setAttribute('aria-label', `Delete ${item.text || 'checklist item'}`);
      remove.addEventListener('click', () => {
        draft = removeChecklistItem(draft, item.id);
        render();
        focusFirstEditorControl(panel);
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
    addInput.disabled = draft.items.length >= MAX_CHECKLIST_ITEMS;
    addInput.addEventListener('input', () => {
      addValue = addInput.value;
      syncAddButton();
    });
    addInput.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      addItem();
    });
    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.textContent = 'Add';
    addButton.addEventListener('click', addItem);
    addRow.append(addInput, addButton);
    syncAddButton();

    panel.append(createChecklistEditorHeader(draft), list, addRow);
    if (draft.items.length >= MAX_CHECKLIST_ITEMS) {
      const limit = document.createElement('p');
      limit.className = 'checklist-list-message';
      limit.textContent = 'Checklist limit reached.';
      panel.append(limit);
    }
    const actions = document.createElement('div');
    actions.className = 'checklist-list-actions';
    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.textContent = 'Cancel';
    cancelButton.addEventListener('click', cancel);
    const doneButton = document.createElement('button');
    doneButton.type = 'button';
    doneButton.textContent = 'Done';
    doneButton.className = 'primary';
    doneButton.addEventListener('click', commitAndClose);
    actions.append(cancelButton, doneButton);
    panel.append(actions);
    addInput.value = addValue;

    function syncAddButton() {
      addButton.disabled = !addValue.trim() || draft.items.length >= MAX_CHECKLIST_ITEMS;
    }

    function addItem() {
      const next = addChecklistItem(draft, addValue);
      if (next === draft) return;
      draft = next;
      addValue = '';
      render();
      panel.querySelector<HTMLInputElement>('.checklist-list-add-row input')?.focus({ preventScroll: true });
    }
  };

  render();
  playChecklistEditorEnter(panel);
  return {
    focus() {
      focusFirstEditorControl(panel);
    },
    dispose() {
      if (!closed && saveOnDispose) commit(draft);
      closed = true;
    },
  };
}

function playChecklistToggleBurst(mount: HTMLElement, checked: boolean, close: () => void) {
  mount.classList.add('node-inline-checklist-toggle-feedback');
  const burst = document.createElement('div');
  burst.className = checked ? 'checklist-toggle-burst is-checked' : 'checklist-toggle-burst';
  mount.append(burst);
  if (prefersReducedMotion() || typeof burst.animate !== 'function') {
    requestAnimationFrame(close);
    return;
  }
  const animation = burst.animate([
    { opacity: 0.72, transform: 'translate(-50%, -50%) scale(0.68)' },
    { opacity: 0.9, transform: 'translate(-50%, -50%) scale(1)' },
    { opacity: 0, transform: 'translate(-50%, -50%) scale(1.85)' },
  ], {
    duration: 220,
    easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
  });
  animation.finished.catch(() => undefined).finally(close);
}

function playChecklistEditorEnter(panel: HTMLElement) {
  if (prefersReducedMotion() || typeof panel.animate !== 'function') return;
  panel.animate([
    {
      opacity: 0,
      transform: 'translateY(-8px) scale(0.965)',
      clipPath: 'inset(0 0 calc(100% - 30px) 0 round 8px)',
      filter: 'blur(1px)',
    },
    {
      opacity: 1,
      transform: 'translateY(0) scale(1)',
      clipPath: 'inset(0 0 0 0 round 8px)',
      filter: 'blur(0)',
    },
  ], {
    duration: 190,
    easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
  });
}

function playChecklistEditorExit(panel: HTMLElement, close: () => void) {
  if (prefersReducedMotion() || typeof panel.animate !== 'function') {
    close();
    return;
  }
  const animation = panel.animate([
    {
      opacity: 1,
      transform: 'translateY(0) scale(1)',
      clipPath: 'inset(0 0 0 0 round 8px)',
    },
    {
      opacity: 0,
      transform: 'translateY(-5px) scale(0.975)',
      clipPath: 'inset(0 0 calc(100% - 28px) 0 round 8px)',
    },
  ], {
    duration: 130,
    easing: 'cubic-bezier(0.5, 0, 0.75, 0)',
  });
  animation.finished.catch(() => undefined).finally(close);
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function createChecklistEditorHeader(data: ChecklistNodeData) {
  const done = data.items.filter((item) => item.checked).length;
  const total = data.items.length;
  const header = document.createElement('div');
  header.className = 'checklist-list-header';
  const title = document.createElement('span');
  title.className = 'checklist-list-title';
  title.textContent = data.title || 'Checklist';
  const meta = document.createElement('span');
  meta.className = 'checklist-list-count';
  meta.textContent = total ? `${done}/${total}` : 'Empty';
  header.append(title, meta);
  if (total) {
    const progress = document.createElement('div');
    progress.className = 'checklist-list-progress';
    progress.setAttribute('aria-hidden', 'true');
    const fill = document.createElement('span');
    fill.style.width = `${Math.round((done / total) * 100)}%`;
    progress.append(fill);
    header.append(progress);
  }
  return header;
}

function focusFirstEditorControl(panel: HTMLElement) {
  panel.querySelector<HTMLElement>('input[type="text"], input[type="checkbox"], button')?.focus({ preventScroll: true });
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

function visibleRows(height: number, layout: ReturnType<typeof nodeLayout>) {
  const available = height - layout.contentY - layout.footerHeight;
  return Math.max(0, Math.min(5, Math.floor(available / layout.rowHeight)));
}

function checklistItemsY(layout: ReturnType<typeof nodeLayout>, total: number) {
  return layout.titleY + layout.labelLineHeight + Math.round(layout.labelLineHeight * (total ? 1 : 0.6));
}

function checklistProgressY(layout: ReturnType<typeof nodeLayout>) {
  return layout.titleY + layout.labelLineHeight + 3;
}

function checklistMetrics(layout: ReturnType<typeof nodeLayout>) {
  const checkboxSize = Math.max(10, Math.round(layout.rowHeight * 0.68));
  const checkboxHitOutset = Math.max(2, Math.round((layout.rowHeight - checkboxSize) / 2));
  return {
    checkboxSize,
    checkboxOffsetY: Math.max(0, Math.round((layout.rowHeight - checkboxSize) / 2) - 1),
    checkboxHitOutset,
    textOffsetX: checkboxSize + Math.max(6, layout.insetX + 4),
  };
}

function drawCheckbox(ctx: CanvasRenderingContext2D, x: number, y: number, checked: boolean, theme: CanvasTheme) {
  const layout = nodeLayout(theme);
  const { checkboxSize } = checklistMetrics(layout);
  const radius = Math.min(3, Math.max(1.5, layout.controlRadius * 0.5));
  ctx.save();
  ctx.strokeStyle = checked ? theme.selected : theme.mutedText;
  ctx.fillStyle = checked ? theme.selected : 'transparent';
  ctx.lineWidth = Math.max(1, layout.controlRadius * 0.3);
  ctx.beginPath();
  ctx.roundRect(x, y, checkboxSize, checkboxSize, radius);
  if (checked) ctx.fill();
  ctx.stroke();
  if (!checked) {
    ctx.restore();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + checkboxSize * 0.21, y + checkboxSize * 0.54);
  ctx.lineTo(x + checkboxSize * 0.43, y + checkboxSize * 0.75);
  ctx.lineTo(x + checkboxSize * 0.83, y + checkboxSize * 0.27);
  ctx.strokeStyle = theme.nodeBg;
  ctx.lineWidth = Math.max(1.4, layout.controlRadius * 0.45);
  ctx.stroke();
  ctx.restore();
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

function drawAddCue(ctx: CanvasRenderingContext2D, x: number, y: number, label: string, theme: CanvasTheme) {
  const layout = nodeLayout(theme);
  const text = nodeText(theme);
  const { checkboxSize, textOffsetX } = checklistMetrics(layout);
  const radius = Math.min(3, Math.max(1.5, layout.controlRadius * 0.5));
  ctx.save();
  ctx.strokeStyle = theme.mutedText;
  ctx.lineWidth = Math.max(1, layout.controlRadius * 0.3);
  ctx.beginPath();
  ctx.roundRect(x, y, checkboxSize, checkboxSize, radius);
  ctx.stroke();
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

function drawProgressTrack(ctx: CanvasRenderingContext2D, rect: NodeContentRect, done: number, total: number, theme: CanvasTheme, y: number) {
  const layout = nodeLayout(theme);
  const x = rect.x + layout.insetX;
  const w = Math.max(0, rect.w - layout.insetX * 2);
  if (w <= 0) return;
  const h = 3;
  const fillW = Math.max(0, Math.min(w, w * (done / total)));
  ctx.save();
  ctx.globalAlpha = 0.34;
  ctx.fillStyle = theme.mutedText;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = theme.selected;
  ctx.beginPath();
  ctx.roundRect(x, y, fillW, h, h / 2);
  ctx.fill();
  ctx.restore();
}
