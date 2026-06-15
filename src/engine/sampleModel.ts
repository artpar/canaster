import type { CanvasModel } from './types';

export const sampleModel: CanvasModel = {
  schemaVersion: 2,
  nodes: [
    {
      id: 'source',
      type: 'card',
      x: -352,
      y: -128,
      w: 256,
      h: 128,
      data: {
        title: 'Source Model',
        detail: 'Input data, schema, or imported document',
        accent: 'data',
      },
    },
    {
      id: 'planner',
      type: 'card',
      x: -32,
      y: -192,
      w: 288,
      h: 128,
      data: {
        title: 'Planning Surface',
        detail: 'Organize entities before adding domain behavior',
        accent: 'task',
      },
    },
    {
      id: 'renderer',
      type: 'card',
      x: 288,
      y: -64,
      w: 288,
      h: 128,
      data: {
        title: 'Canvas Renderer',
        detail: 'Camera, grid, hit testing, drag, resize',
        accent: 'system',
      },
    },
    {
      id: 'extensions',
      type: 'card',
      x: -96,
      y: 96,
      w: 320,
      h: 128,
      data: {
        title: 'Future Layer',
        detail: 'Edges, tables, annotations, export, persistence',
        accent: 'task',
      },
    },
  ],
};
