import { asEnum, asString } from '../../core/nodeData';
import {
  embedProviderForUrl,
  embedTitleForUrl,
  normalizeEmbedUrl,
  type EmbedAspectRatio,
  type EmbedProvider,
} from '../../core/embedUrl';
import { BuiltInNodeTypes } from '../BuiltInNodeTypes';
import type { JsonObject } from '../types';
import type { NodeDescription, NodeSemanticDefinition } from './NodeSemanticDefinition';

const EMBED_ASPECT_RATIOS: readonly EmbedAspectRatio[] = ['16:9', '4:3', 'auto'];
const EMBED_PROVIDERS: readonly EmbedProvider[] = ['web', 'video', 'map', 'doc'];

export type EmbedNodeData = {
  url: string;
  title: string;
  provider: EmbedProvider;
  aspectRatio: EmbedAspectRatio;
} & JsonObject;

export const embedNodeSemanticDefinition: NodeSemanticDefinition<EmbedNodeData> = {
  type: BuiltInNodeTypes.embed,
  createDefaultData() {
    return { url: '', title: 'Web preview', provider: 'web', aspectRatio: '16:9' };
  },
  parseData(raw) {
    const url = asString(raw.url, '');
    return {
      url,
      title: asString(raw.title, url ? embedTitleForUrl(url) : 'Web preview'),
      provider: asEnum(raw.provider, EMBED_PROVIDERS, 'web'),
      aspectRatio: asEnum(raw.aspectRatio, EMBED_ASPECT_RATIOS, '16:9'),
    };
  },
  describe({ data }) {
    return describeEmbedNodeData(data);
  },
};

export function describeEmbedNodeData(data: EmbedNodeData, options: { allowLocalHttp?: boolean } = {}): NodeDescription {
  const normalized = normalizeEmbedUrl(data.url, options);
  return {
    label: data.title || (normalized ? embedTitleForUrl(normalized) : 'Web preview'),
    roleDescription: 'Web preview',
    details: [normalized ? embedTitleForUrl(normalized) : 'No web link'],
    state: normalized ? [] : ['Needs a safe HTTPS link'],
    actions: [],
  };
}

export function embedNodeDataForUrl(data: EmbedNodeData, draftUrl: string, options: { allowLocalHttp?: boolean } = {}): EmbedNodeData {
  const normalized = normalizeEmbedUrl(draftUrl, options);
  if (!normalized) return data;
  return {
    ...data,
    url: normalized,
    title: data.title && data.title !== 'Web preview' ? data.title : embedTitleForUrl(normalized),
    provider: embedProviderForUrl(normalized),
  };
}
