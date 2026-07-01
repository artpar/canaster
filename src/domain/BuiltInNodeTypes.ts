export const BuiltInNodeTypes = {
  card: 'card',
  text: 'text',
  table: 'table',
  image: 'image',
  canvas: 'canvas',
  check: 'check',
  pdf: 'pdf',
  md: 'md',
  embed: 'embed',
} as const;

export type BuiltInNodeType = (typeof BuiltInNodeTypes)[keyof typeof BuiltInNodeTypes];
