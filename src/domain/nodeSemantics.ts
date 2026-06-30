import {
  asEnum,
  asJsonObject,
  asNullableString,
  asNumber,
  asString,
  cloneNodeData,
} from '../core/nodeData';
import { normalizeChecklistNodeData, parseChecklistItems } from './checklistNodeData';
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
const EMBED_ASPECT_RATIOS = ['16:9', '4:3', 'auto'] as const;
const EMBED_PROVIDERS = ['web', 'video', 'map', 'doc'] as const;
export function normalizeNodeData(nodeType: string, raw: unknown): NodeData {
  const data = asJsonObject(raw);
  switch (nodeType) {
    case 'canvas':
      return parseCanvasPortalData(data);
    case 'card':
      return {
        title: asString(data.title, 'Untitled work item'),
        detail: asString(data.detail, ''),
        accent: asEnum(data.accent, CARD_ACCENTS, 'task'),
      };
    case 'check':
      return normalizeChecklistNodeData(data);
    case 'image':
      return {
        assetId: asNullableString(data.assetId),
        alt: asString(data.alt, ''),
        fit: asEnum(data.fit, IMAGE_FITS, 'cover'),
        caption: asString(data.caption, ''),
      };
    case 'pdf':
      return {
        assetId: asString(data.assetId, ''),
        title: asString(data.title, 'PDF'),
        fileName: asString(data.fileName, ''),
        mime: asString(data.mime, 'application/pdf'),
      };
    case 'md':
      return {
        assetId: asString(data.assetId, ''),
        title: asString(data.title, 'Markdown'),
        fileName: asString(data.fileName, ''),
        mime: asString(data.mime, 'text/markdown'),
        markdownText: asString(data.markdownText, ''),
      };
    case 'embed':
      return {
        url: asString(data.url, ''),
        title: asString(data.title, 'Web preview'),
        provider: asEnum(data.provider, EMBED_PROVIDERS, 'web'),
        aspectRatio: asEnum(data.aspectRatio, EMBED_ASPECT_RATIOS, '16:9'),
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
        label: asString(data.title, 'Untitled work item') || 'Untitled work item',
        roleDescription: 'Work item',
        details: [asString(data.detail, '')].filter(Boolean),
        state: [],
        actions: [],
      };
    case 'check': {
      const items = parseChecklistItems(data.items);
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
    case 'pdf':
      return {
        label: asString(data.title, 'PDF') || 'PDF',
        roleDescription: 'PDF document',
        details: [asString(data.fileName, '') || 'PDF file'],
        state: [],
        actions: [],
      };
    case 'md':
      return {
        label: asString(data.title, 'Markdown') || 'Markdown',
        roleDescription: 'Markdown document',
        details: [asString(data.fileName, '') || 'Markdown file'],
        state: [],
        actions: [],
      };
    case 'embed':
      return {
        label: asString(data.title, 'Web preview') || 'Web preview',
        roleDescription: 'Web preview',
        details: [asString(data.url, '') || 'No web link'],
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
