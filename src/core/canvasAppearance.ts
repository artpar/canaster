export type CanvasBackgroundImageFit = 'cover' | 'contain' | 'stretch';

export type CanvasBackgroundImage = {
  assetId: string;
  fit?: CanvasBackgroundImageFit;
  opacity?: number;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
};
