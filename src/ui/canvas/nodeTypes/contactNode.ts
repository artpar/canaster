import { normalizeContactNodeData, type ContactNodeData } from '../../../domain/contactNodeData';
import { defineNodeType } from '../nodeDefinition/defineNodeType';
import { clipText, drawNodeBodyLines, drawNodeMeta, drawNodeTitle, nodeLayout, nodeText, wrapText } from '../nodeRendering';
import { createNodeDetailsEditor } from './createNodeDetailsEditor';
import { nodeContentInteractionRegion } from './nodeContentInteractionRegion';
import { nodeTypeSpecs } from '../nodeDefinition/nodeTypeSpecs';
import type { NodeContentRect, NodeDefinition } from '../nodeDefinition/nodeDefinitionTypes';
import type { CanvasTheme } from '../theme';

export const contactNodeDefinition: NodeDefinition<ContactNodeData> = defineNodeType({
  ...nodeTypeSpecs.contact,
  createDefaultData() {
    return { name: 'Contact', role: '', organization: '', phone: '', email: '', note: '' };
  },
  parseData(raw) {
    return normalizeContactNodeData(raw);
  },
  render({ ctx, data, theme, contentRect, state }) {
    const layout = nodeLayout(theme);
    if (state.quality === 'compact' && !state.selected && !state.hovered) return;

    drawNodeTitle(ctx, contentRect, data.name || 'Contact', theme);
    drawNodeMeta(ctx, contentRect, [data.role, data.organization].filter(Boolean).join(' / ') || 'Contact details', theme);
    drawContactRow(ctx, contentRect, 'Phone', data.phone, theme, contentRect.y + layout.contentY + layout.labelLineHeight);
    drawContactRow(ctx, contentRect, 'Email', data.email, theme, contentRect.y + layout.contentY + layout.labelLineHeight + layout.rowHeight);
    const noteLines = wrapText(ctx, data.note, Math.max(0, contentRect.w - layout.insetX * 2), 2);
    drawNodeBodyLines(ctx, contentRect, noteLines, theme, { y: contentRect.y + layout.contentY + layout.labelLineHeight + layout.rowHeight * 2 });
  },
  describe({ data }) {
    return {
      label: data.name || 'Contact',
      roleDescription: 'Contact',
      details: [data.role, data.organization, data.phone, data.email, data.note].filter(Boolean),
      state: [],
      actions: [],
    };
  },
  getInteractionRegions({ contentRect }) {
    return nodeContentInteractionRegion(contentRect, 'pointer', 'edit contact');
  },
  createInteraction(ctx) {
    if (ctx.region.id !== 'edit') return null;
    return createNodeDetailsEditor<ContactNodeData>({
      mount: ctx.mount,
      className: 'node-inline-details-editor node-inline-contact-editor',
      title: 'Contact',
      fields: [
        { id: 'name', label: 'Name', value: ctx.data.name },
        { id: 'role', label: 'Role', value: ctx.data.role },
        { id: 'organization', label: 'Organization', value: ctx.data.organization },
        { id: 'phone', label: 'Phone', value: ctx.data.phone, inputMode: 'tel' },
        { id: 'email', label: 'Email', value: ctx.data.email, inputMode: 'email' },
        { id: 'note', label: 'Note', value: ctx.data.note, rows: 3 },
      ],
      commit: (nextData) => ctx.requestCommit(nextData),
      close: ctx.requestClose,
      buildData: (values) => normalizeContactNodeData(values),
    });
  },
});

function drawContactRow(ctx: CanvasRenderingContext2D, rect: NodeContentRect, label: string, value: string, theme: CanvasTheme, y: number) {
  if (!value) return;
  const text = nodeText(theme);
  const layout = nodeLayout(theme);
  ctx.font = text.micro;
  ctx.fillStyle = theme.mutedText;
  ctx.textBaseline = 'top';
  ctx.fillText(label, rect.x + layout.insetX, y);
  ctx.font = text.body;
  ctx.fillStyle = theme.bodyText;
  ctx.fillText(clipText(ctx, value, Math.max(0, rect.w - layout.insetX * 2 - 52)), rect.x + layout.insetX + 52, y);
}
