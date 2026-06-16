import type { CanvasModel } from './types';

export const sampleModel: CanvasModel = {
  schemaVersion: 2,
  nodes: [
    {
      id: 'source',
      type: 'card',
      x: 128,
      y: 128,
      w: 272,
      h: 128,
      data: {
        title: 'New requests',
        detail: 'Calls, walk-ins, and online forms to review',
        accent: 'data',
      },
    },
    {
      id: 'planner',
      type: 'card',
      x: 448,
      y: 96,
      w: 280,
      h: 128,
      data: {
        title: 'Plan today',
        detail: 'Assign crews, vehicles, and time windows',
        accent: 'task',
      },
    },
    {
      id: 'renderer',
      type: 'card',
      x: 256,
      y: 352,
      w: 296,
      h: 128,
      data: {
        title: 'On-site updates',
        detail: 'Photos, measurements, and field blockers',
        accent: 'data',
      },
    },
    {
      id: 'extensions',
      type: 'card',
      x: 640,
      y: 416,
      w: 296,
      h: 128,
      data: {
        title: 'Close the loop',
        detail: 'Confirm outcome, follow-up, and billing',
        accent: 'task',
      },
    },
    {
      id: 'planning-canvas',
      type: 'canvas',
      x: 800,
      y: 160,
      w: 312,
      h: 188,
      data: {
        childCanvasId: null,
        title: 'Job packet',
        nodeCount: 0,
      },
    },
  ],
};
