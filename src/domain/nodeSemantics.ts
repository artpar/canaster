import {
  asEnum,
  asJsonObject,
  asNullableString,
  asNumber,
  asString,
  cloneNodeData,
} from '../core/nodeData';
import type {CanvasNode, JsonObject, NodeData} from './types';

export type NodeActionDescriptor = {
  id: string;
  label: string;
  available: boolean;
  disabledReason?: string;
};

export type NodeDescription = {
  label: string;
  roleDescription: string;
  details: string[];
  state: string[];
  actions: NodeActionDescriptor[];
};

export type NodePortalInfo = {
  childCanvasId: string | null;
  title: string;
  nodeCount: number;
};

export type NodePortalSummary = {
  title: string;
  nodeCount: number;
};

const CARD_ACCENTS = ['task', 'data', 'system'] as const;
const IMAGE_FITS = ['contain', 'cover'] as const;
const MAX_CHECK_ITEMS = 100;

export function normalizeNodeData(nodeType: string, raw: unknown): NodeData {
  const data = asJsonObject(raw);
  switch (nodeType) {
    case 'canvas':
      return parseCanvasPortalData(data);
    case 'card':
      return {
        title: asString(data.title, 'Untitled card'),
        detail: asString(data.detail, ''),
        accent: asEnum(data.accent, CARD_ACCENTS, 'task'),
      };
    case 'check':
      return {
        title: asString(data.title, 'Checklist'),
        items: parseCheckItems(data.items),
      };
    case 'image':
      return {
        assetId: asNullableString(data.assetId),
        alt: asString(data.alt, ''),
        fit: asEnum(data.fit, IMAGE_FITS, 'contain'),
        caption: asString(data.caption, ''),
      };
    case 'text':
      return {text: asString(data.text, '')};
    default:
      return data;
  }
}

export function describeNode(node: CanvasNode): NodeDescription {
  const data = normalizeNodeData(node.type, node.data);
  switch (node.type) {
    case 'canvas': {
      const portal = parseCanvasPortalData(data);
      return {
        label: portal.title || 'View inside',
        roleDescription: 'View inside',
        details: [portal.childCanvasId ? `${portal.nodeCount} item${portal.nodeCount === 1 ? '' : 's'} inside` : 'No view inside'],
        state: [],
        actions: portal.childCanvasId ?
          [
            {id: 'enter-child-canvas', label: 'Open view', available: true},
            {id: 'focus-portal-preview', label: 'Preview here', available: true},
          ] :
          [{id: 'create-child-canvas', label: 'Add view inside', available: true}],
      };
    }
    case 'card':
      return {
        label: asString(data.title, 'Untitled card') || 'Untitled card',
        roleDescription: 'Work item',
        details: [asString(data.detail, '')].filter(Boolean),
        state: [],
        actions: [],
      };
    case 'check': {
      const items = parseCheckItems(data.items);
      const done = items.filter((item) => item.checked).length;
      return {
        label: asString(data.title, 'Checklist') || 'Checklist',
        roleDescription: 'Checklist',
        details: [items.length ? `${done} of ${items.length} done` : 'No checklist items'],
        state: [],
        actions: [],
      };
    }
    case 'image':
      return {
        label: asString(data.alt, '') || 'Image',
        roleDescription: 'Image',
        details: [
          data.assetId ? 'Image added' : 'No image source',
          data.fit === 'cover' ? 'Fills the frame' : 'Fits inside the frame',
        ],
        state: [],
        actions: [],
      };
    case 'text': {
      const text = asString(data.text, '');
      return {
        label: clipPlainText(firstLine(text), 60) || 'Empty note',
        roleDescription: 'Note',
        details: [`${lineCount(text)} line${lineCount(text) === 1 ? '' : 's'}`],
        state: [],
        actions: [],
      };
    }
    default:
      return {
        label: `Unknown item type ${node.type}`,
        roleDescription: 'Unknown item',
        details: [`Type ${node.type}`],
        state: [],
        actions: [],
      };
  }
}

export function portalInfoForNode(node: CanvasNode): NodePortalInfo | null {
  return node.type === 'canvas' ? parseCanvasPortalData(node.data) : null;
}

export function isPortalNode(node: CanvasNode | undefined): node is CanvasNode {
  return Boolean(node && portalInfoForNode(node));
}

export function createCanvasPortalNode(node: CanvasNode, info: NodePortalInfo): CanvasNode {
  return {
    ...node,
    type: 'canvas',
    data: parseCanvasPortalData(info as unknown as JsonObject),
  };
}

export function updatePortalSummaryForNode(node: CanvasNode, summary: NodePortalSummary): CanvasNode {
  const portal = portalInfoForNode(node);
  if (!portal) return node;
  if (portal.title === summary.title && portal.nodeCount === summary.nodeCount) return node;
  return {
    ...node,
    data: {
      ...parseCanvasPortalData(node.data),
      title: summary.title,
      nodeCount: summary.nodeCount,
    },
  };
}

export function stripNodeForPaste(node: CanvasNode): CanvasNode {
  if (node.type !== 'canvas') return {...node, data: cloneNodeData(node.data)};
  const portal = parseCanvasPortalData(node.data);
  return {
    ...node,
    data: {
      ...portal,
      childCanvasId: null,
      nodeCount: 0,
      title: `${portal.title || 'Canvas'} copy`,
    },
  };
}

function parseCanvasPortalData(raw: unknown): NodePortalInfo & JsonObject {
  const data = asJsonObject(raw);
  return {
    childCanvasId: asNullableString(data.childCanvasId),
    title: asString(data.title, 'View'),
    nodeCount: Math.max(0, Math.floor(asNumber(data.nodeCount, 0))),
  };
}

function parseCheckItems(value: unknown): Array<{id: string; text: string; checked: boolean} & JsonObject> {
  if (!Array.isArray(value)) return [];
  const parsed: Array<{id: string; text: string; checked: boolean} & JsonObject> = [];
  for (let index = 0; index < value.length && parsed.length < MAX_CHECK_ITEMS; index += 1) {
    const item = parseCheckItem(value[index], index);
    if (item) parsed.push(item);
  }
  return parsed;
}

function parseCheckItem(value: unknown, index: number): {id: string; text: string; checked: boolean} & JsonObject | null {
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

function firstLine(text: string) {
  return text.split(/\r?\n/).find((line) => line.trim())?.trim() ?? '';
}

function lineCount(text: string) {
  if (!text) return 0;
  return text.split(/\r?\n/).length;
}

function clipPlainText(text: string, maxLength: number) {
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}
