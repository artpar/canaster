import type { CanvasModel } from './types';

export const sampleModel: CanvasModel = {
  nodes: [
    {
      id: 'source',
      label: 'Source Model',
      detail: 'Input data, schema, or imported document',
      kind: 'data',
      x: -360,
      y: -120,
      w: 240,
      h: 112,
    },
    {
      id: 'planner',
      label: 'Planning Surface',
      detail: 'Organize entities before adding domain behavior',
      kind: 'task',
      x: -40,
      y: -180,
      w: 280,
      h: 128,
    },
    {
      id: 'renderer',
      label: 'Canvas Renderer',
      detail: 'Camera, grid, hit testing, drag, resize',
      kind: 'system',
      x: 300,
      y: -50,
      w: 270,
      h: 128,
    },
    {
      id: 'extensions',
      label: 'Future Layer',
      detail: 'Edges, tables, annotations, export, persistence',
      kind: 'task',
      x: -80,
      y: 110,
      w: 300,
      h: 118,
    },
  ],
};
