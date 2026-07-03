import { BuiltInNodeTypes, type BuiltInNodeType } from '../../../domain/BuiltInNodeTypes';
import type { NodeSize } from './nodeDefinitionTypes';

export type NodeTypeSpec = {
  type: BuiltInNodeType | string;
  displayName: string;
  roleDescription: string;
  typeBadge: string;
  addMenu: {
    label: string;
    detail: string;
    badge: string;
  };
  defaultSize: NodeSize;
  minSize: NodeSize;
  contentPadding?: number;
};

export const nodeTypeSpecs = {
  text: {
    type: BuiltInNodeTypes.text,
    displayName: 'Text',
    roleDescription: 'Note',
    typeBadge: 'NOTE',
    addMenu: {
      label: 'Note',
      detail: 'Plain text for local context',
      badge: 'NOTE',
    },
    defaultSize: { w: 240, h: 140 },
    minSize: { w: 140, h: 76 },
  },
  table: {
    type: BuiltInNodeTypes.table,
    displayName: 'Table',
    roleDescription: 'Table',
    typeBadge: 'TABLE',
    addMenu: {
      label: 'Table',
      detail: 'Small structured list',
      badge: 'TABLE',
    },
    defaultSize: { w: 360, h: 220 },
    minSize: { w: 220, h: 140 },
  },
  image: {
    type: BuiltInNodeTypes.image,
    displayName: 'Image',
    roleDescription: 'Image',
    typeBadge: 'IMAGE',
    addMenu: {
      label: 'Image',
      detail: 'Visual reference with alt text',
      badge: 'IMAGE',
    },
    defaultSize: { w: 280, h: 180 },
    minSize: { w: 140, h: 96 },
    contentPadding: 0,
  },
  canvas: {
    type: BuiltInNodeTypes.canvas,
    displayName: 'View',
    roleDescription: 'View inside',
    typeBadge: 'VIEW',
    addMenu: {
      label: 'View',
      detail: 'A child workspace view',
      badge: 'VIEW',
    },
    defaultSize: { w: 300, h: 180 },
    minSize: { w: 160, h: 100 },
    contentPadding: 0,
  },
  check: {
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
  },
  pdf: {
    type: BuiltInNodeTypes.pdf,
    displayName: 'PDF',
    roleDescription: 'PDF document',
    typeBadge: 'PDF',
    addMenu: {
      label: 'PDF',
      detail: 'Document file preview',
      badge: 'PDF',
    },
    defaultSize: { w: 300, h: 200 },
    minSize: { w: 180, h: 120 },
  },
  md: {
    type: BuiltInNodeTypes.md,
    displayName: 'Markdown',
    roleDescription: 'Markdown document',
    typeBadge: 'MD',
    addMenu: {
      label: 'Markdown',
      detail: 'Readable Markdown file preview',
      badge: 'MD',
    },
    defaultSize: { w: 300, h: 200 },
    minSize: { w: 180, h: 120 },
  },
  mail: {
    type: BuiltInNodeTypes.mail,
    displayName: 'Mail',
    roleDescription: 'Mail',
    typeBadge: 'MAIL',
    addMenu: {
      label: 'Mail',
      detail: 'Inbox, messages, and compose',
      badge: 'MAIL',
    },
    defaultSize: { w: 420, h: 280 },
    minSize: { w: 280, h: 180 },
    contentPadding: 0,
  },
  embed: {
    type: BuiltInNodeTypes.embed,
    displayName: 'Embed',
    roleDescription: 'Web preview',
    typeBadge: 'WEB',
    addMenu: {
      label: 'Embed',
      detail: 'External web preview',
      badge: 'WEB',
    },
    defaultSize: { w: 320, h: 200 },
    minSize: { w: 200, h: 120 },
    contentPadding: 0,
  },
  unknown: {
    type: 'unknown',
    displayName: 'Unknown',
    roleDescription: 'Unknown item',
    typeBadge: 'UNKNOWN',
    addMenu: {
      label: 'Unknown item',
      detail: 'Unsupported saved item type',
      badge: 'UNKNOWN',
    },
    defaultSize: { w: 220, h: 120 },
    minSize: { w: 140, h: 76 },
  },
} satisfies Record<string, NodeTypeSpec>;
