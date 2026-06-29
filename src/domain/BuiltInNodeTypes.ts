export const BuiltInNodeTypes = {
  card: 'card',
  text: 'text',
  image: 'image',
  canvas: 'canvas',
  check: 'check',
} as const;

export type BuiltInNodeType = (typeof BuiltInNodeTypes)[keyof typeof BuiltInNodeTypes];
