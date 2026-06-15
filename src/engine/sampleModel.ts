import type { CanvasModel } from './types';

export const sampleModel: CanvasModel = {
  nodes: [
    {
      id: 'source',
      label: 'Source Model',
      detail: 'Input data, schema, or imported document',
      kind: 'data',
      x: -352,
      y: -128,
      w: 256,
      h: 128,
    },
    {
      id: 'planner',
      label: 'Planning Surface',
      detail: 'Organize entities before adding domain behavior',
      kind: 'task',
      x: -32,
      y: -192,
      w: 288,
      h: 128,
    },
    {
      id: 'renderer',
      label: 'Canvas Renderer',
      detail: 'Camera, grid, hit testing, drag, resize',
      kind: 'system',
      x: 288,
      y: -64,
      w: 288,
      h: 128,
    },
    {
      id: 'extensions',
      label: 'Future Layer',
      detail: 'Edges, tables, annotations, export, persistence',
      kind: 'task',
      x: -96,
      y: 96,
      w: 320,
      h: 128,
    },
  ],
};
