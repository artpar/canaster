import type { NodeSize } from './types';

export const BuiltInNodeTypes = {
  card: 'card',
  text: 'text',
  image: 'image',
  canvas: 'canvas',
  check: 'check',
} as const;

export type BuiltInNodeType = (typeof BuiltInNodeTypes)[keyof typeof BuiltInNodeTypes];

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
};

export const nodeTypeSpecs = {
  card: {
    type: BuiltInNodeTypes.card,
    displayName: 'Card',
    roleDescription: 'Work item',
    typeBadge: 'WORK',
    addMenu: {
      label: 'Work item',
      detail: 'Title, detail, and work accent',
      badge: 'WORK',
    },
    defaultSize: { w: 256, h: 128 },
    minSize: { w: 140, h: 76 },
  },
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
