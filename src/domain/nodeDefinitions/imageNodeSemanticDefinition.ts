import { asEnum, asNullableString, asString } from '../../core/nodeData';
import { BuiltInNodeTypes } from '../BuiltInNodeTypes';
import type { JsonObject } from '../types';
import type { NodeSemanticDefinition } from './NodeSemanticDefinition';

const IMAGE_FITS = ['contain', 'cover'] as const;

export type ImageFit = (typeof IMAGE_FITS)[number];

export type ImageNodeData = {
  assetId: string | null;
  alt: string;
  fit: ImageFit;
  caption?: string;
} & JsonObject;

export const imageNodeSemanticDefinition: NodeSemanticDefinition<ImageNodeData> = {
  type: BuiltInNodeTypes.image,
  createDefaultData() {
    return { assetId: null, alt: '', fit: 'cover', caption: '' };
  },
  parseData(raw) {
    return {
      assetId: asNullableString(raw.assetId),
      alt: asString(raw.alt, ''),
      fit: asEnum(raw.fit, IMAGE_FITS, 'cover'),
      caption: asString(raw.caption, ''),
    };
  },
  describe({ data }) {
    return {
      label: data.alt || 'Image',
      roleDescription: 'Image',
      details: [
        data.assetId ? 'Image added' : 'No image source',
        data.fit === 'cover' ? 'Fills the frame' : 'Fits inside the frame',
      ],
      state: [],
      actions: [],
    };
  },
};
