import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const gridSize = Number(process.env.CANWAY_FIXTURE_GRID || 3);
const canvasLevels = Number(process.env.CANWAY_FIXTURE_LEVELS || 4);
const outPath = path.resolve(process.env.CANWAY_FIXTURE_OUT || `docs/fixtures/nested-${gridSize}x${gridSize}-${canvasLevels}-level-workspace.json`);
const panel = { w: 320, h: 210 };
const gap = { x: 80, y: 72 };
const step = { x: panel.w + gap.x, y: panel.h + gap.y };
const targetViewport = { w: Number(process.env.CANWAY_FIXTURE_VIEWPORT_W || 756), h: Number(process.env.CANWAY_FIXTURE_VIEWPORT_H || 469) };
const viewportPadding = Number(process.env.CANWAY_FIXTURE_VIEWPORT_PADDING || 72);
const accents = ['task', 'data', 'system'];

const documents = {};
const cameras = {};
const selections = {};
const paneLayouts = {};

function nodeId(pathParts, row, col) {
  const prefix = pathParts.length ? pathParts.join('__') : 'root';
  return `${prefix}__r${row}c${col}`;
}

function canvasIdFor(pathParts) {
  return pathParts.length ? `canvas__${pathParts.join('__')}` : 'root';
}

function titleFor(pathParts, row, col) {
  const depth = pathParts.length + 1;
  return `L${depth} Panel ${row}.${col}`;
}

function gridPosition(row, col) {
  return {
    x: (col - 2) * step.x - panel.w / 2,
    y: (row - 2) * step.y - panel.h / 2,
  };
}

function fittedCamera() {
  const minX = gridPosition(1, 1).x;
  const minY = gridPosition(1, 1).y;
  const maxX = gridPosition(gridSize, gridSize).x + panel.w;
  const maxY = gridPosition(gridSize, gridSize).y + panel.h;
  const bounds = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  const scale = Math.min(
    1.5,
    Math.max(0.08, Math.min((targetViewport.w - viewportPadding * 2) / bounds.w, (targetViewport.h - viewportPadding * 2) / bounds.h)),
  );
  return {
    x: Math.round((targetViewport.w - bounds.w * scale) / 2 - bounds.x * scale),
    y: Math.round((targetViewport.h - bounds.h * scale) / 2 - bounds.y * scale),
    scale: Number(scale.toFixed(3)),
  };
}

function createGridDocument(pathParts, parentCanvasId, parentNodeId) {
  const canvasId = canvasIdFor(pathParts);
  const depth = pathParts.length;
  const hasChildren = depth < canvasLevels - 1;
  const nodes = [];

  for (let row = 1; row <= gridSize; row += 1) {
    for (let col = 1; col <= gridSize; col += 1) {
      const id = nodeId(pathParts, row, col);
      const pos = gridPosition(row, col);
      const childPath = [...pathParts, `r${row}c${col}`];
      const childCanvasId = hasChildren ? canvasIdFor(childPath) : null;
      nodes.push({
        id,
        type: hasChildren ? 'canvas' : 'card',
        x: pos.x,
        y: pos.y,
        w: panel.w,
        h: panel.h,
        data: hasChildren
          ? {
              childCanvasId,
              title: titleFor(pathParts, row, col),
              nodeCount: gridSize * gridSize,
              grid: `${gridSize}x${gridSize}`,
              depth: depth + 1,
              branch: childPath.join('/'),
            }
          : {
              title: titleFor(pathParts, row, col),
              detail: `Leaf work panel at ${childPath.join(' / ')}`,
              accent: accents[(row + col + depth) % accents.length],
              grid: `${gridSize}x${gridSize}`,
              depth: depth + 1,
              branch: childPath.join('/'),
            },
      });
    }
  }

  documents[canvasId] = {
    id: canvasId,
    title: depth === 0 ? `${canvasLevels}-Level ${gridSize}x${gridSize} Stress Root` : `Canvas ${pathParts.join(' / ')}`,
    parentCanvasId,
    parentNodeId,
    model: {
      schemaVersion: 2,
      nodes,
    },
  };
  cameras[canvasId] = fittedCamera();
  selections[canvasId] = {
    selectedNodeIds: [],
    primarySelectedNodeId: null,
    resizeMode: false,
  };
  paneLayouts[canvasId] = {
    left: 112,
    right: 112,
    top: 112,
    bottom: 112,
  };

  if (!hasChildren) return;

  for (let row = 1; row <= gridSize; row += 1) {
    for (let col = 1; col <= gridSize; col += 1) {
      const childPath = [...pathParts, `r${row}c${col}`];
      createGridDocument(childPath, canvasId, nodeId(pathParts, row, col));
    }
  }
}

createGridDocument([], null, null);

const collection = {
  schemaVersion: 1,
  rootCanvasId: 'root',
  activeCanvasId: 'root',
  documents,
  view: {
    cameras,
    selections,
    paneLayouts,
    activeCanvasId: 'root',
    focusedEngineId: 'root',
    previewFocus: null,
    stackPath: [{ canvasId: 'root', parentCanvasId: null, parentNodeId: null, depth: 0 }],
    parentContext: { sourceCanvasId: null, sourcePortalNodeId: null, shapes: [] },
    animationEnabled: false,
    deleteConfirmation: null,
  },
};

const metadata = {
  name: `nested-${gridSize}x${gridSize}-${canvasLevels}-level-workspace`,
  description: `A deterministic Canway stress workspace: every visible panel is a ${gridSize}x${gridSize} nested canvas through ${canvasLevels} canvas levels, with leaf cards on the final level.`,
  gridSize,
  canvasLevels,
  portalDocuments: Object.values(documents).filter((document) => document.model.nodes.some((node) => node.type === 'canvas')).length,
  documentCount: Object.keys(documents).length,
  panelNodeCount: Object.values(documents).reduce((total, document) => total + document.model.nodes.length, 0),
  rootVisiblePanels: gridSize * gridSize,
  panelSize: panel,
  gap,
  targetViewport,
  viewportPadding,
};

await mkdir(path.dirname(outPath), { recursive: true });
await writeFile(outPath, `${JSON.stringify({ metadata, collection }, null, 2)}\n`);
console.log(JSON.stringify({ outPath, ...metadata }, null, 2));
