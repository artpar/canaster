export const BuiltInNodeTypes = {
  card: 'card',
  text: 'text',
  heading: 'heading',
  status: 'status',
  contact: 'contact',
  date: 'date',
  table: 'table',
  image: 'image',
  canvas: 'canvas',
  check: 'check',
  pdf: 'pdf',
  md: 'md',
  embed: 'embed',
} as const;

export type BuiltInNodeType = (typeof BuiltInNodeTypes)[keyof typeof BuiltInNodeTypes];
