import type { CanvasArrangeLayout, CanvasNode, CanvasNodeGeometry } from './types';

type ArrangementItem = {
  id: string;
  index: number;
  geometry: CanvasNodeGeometry;
  expandedW: number;
  expandedH: number;
};

type PackedItem = ArrangementItem & {
  x: number;
  y: number;
};

type SkylineSegment = {
  x: number;
  y: number;
  w: number;
};

type PackedCandidate = {
  packed: PackedItem[];
  width: number;
  height: number;
  score: number;
};

const WIDTH_FACTORS = [0.72, 0.82, 0.92, 1, 1.1, 1.22, 1.38, 1.58];

export function arrangeNodeGeometries(nodes: CanvasNode[], layout: CanvasArrangeLayout, snapStep: number): Map<string, CanvasNodeGeometry> {
  if (!nodes.length) return new Map();
  const start = snappedBoundsOrigin(nodes, snapStep);
  if (layout === 'list') return arrangeList(nodes, start.x, start.y, snapStep);

  const items = nodes.map((node, index) => ({
    id: node.id,
    index,
    geometry: nodeGeometry(node),
    expandedW: snapUp(node.w + snapStep, snapStep),
    expandedH: snapUp(node.h + snapStep, snapStep),
  }));
  const targetAspect = targetAspectForLayout(layout);
  const widths = candidateWidths(items, layout, targetAspect, snapStep);
  const orders = orderedItemSets(items, layout);
  let best: PackedCandidate | null = null;

  for (const width of widths) {
    for (const order of orders) {
      const packed = skylinePack(order, width);
      const candidate = scoreCandidate(packed, layout, targetAspect);
      if (!best || candidate.score < best.score) best = candidate;
    }
  }

  const result = new Map<string, CanvasNodeGeometry>();
  for (const item of best?.packed ?? []) {
    result.set(item.id, {
      ...item.geometry,
      x: start.x + item.x,
      y: start.y + item.y,
    });
  }
  return result;
}

export function arrangeLayoutLabel(layout: CanvasArrangeLayout) {
  if (layout === 'rows') return 'rows';
  if (layout === 'columns') return 'columns';
  if (layout === 'list') return 'a list';
  return 'a compact layout';
}

function arrangeList(nodes: CanvasNode[], startX: number, startY: number, snapStep: number): Map<string, CanvasNodeGeometry> {
  const result = new Map<string, CanvasNodeGeometry>();
  let nextY = startY;
  for (const node of sortByReadingOrder(nodes)) {
    const geometry = nodeGeometry(node);
    result.set(node.id, { ...geometry, x: startX, y: nextY });
    nextY = snapUp(nextY + node.h + snapStep, snapStep);
  }
  return result;
}

function orderedItemSets(items: ArrangementItem[], layout: CanvasArrangeLayout): ArrangementItem[][] {
  const reading = [...items].sort((a, b) => a.geometry.y - b.geometry.y || a.geometry.x - b.geometry.x || a.id.localeCompare(b.id));
  if (layout !== 'grid') return [reading];
  const area = [...items].sort((a, b) => b.geometry.w * b.geometry.h - a.geometry.w * a.geometry.h || b.geometry.h - a.geometry.h || a.index - b.index);
  const height = [...items].sort((a, b) => b.geometry.h - a.geometry.h || b.geometry.w - a.geometry.w || a.index - b.index);
  return [area, height, reading];
}

function candidateWidths(items: ArrangementItem[], layout: CanvasArrangeLayout, targetAspect: number, snapStep: number): number[] {
  const totalArea = items.reduce((sum, item) => sum + item.expandedW * item.expandedH, 0);
  const maxW = Math.max(...items.map((item) => item.expandedW));
  const maxH = Math.max(...items.map((item) => item.expandedH));
  const sumW = items.reduce((sum, item) => sum + item.expandedW, 0);
  const targetWidth = Math.sqrt(totalArea * targetAspect);
  const widths = new Set<number>();

  widths.add(maxW);
  widths.add(snapUp(maxW + snapStep * 2, snapStep));
  widths.add(snapUp(sumW, snapStep));
  widths.add(snapUp(Math.max(maxW, maxH * targetAspect), snapStep));
  for (const factor of WIDTH_FACTORS) widths.add(snapUp(Math.max(maxW, targetWidth * factor), snapStep));

  if (layout === 'rows') {
    widths.add(snapUp(Math.max(maxW, targetWidth * 1.75), snapStep));
    widths.add(snapUp(Math.max(maxW, sumW * 0.72), snapStep));
  } else if (layout === 'columns') {
    widths.add(maxW);
    widths.add(snapUp(maxW + snapStep, snapStep));
    widths.add(snapUp(Math.max(maxW, targetWidth * 0.82), snapStep));
  }

  return [...widths]
    .filter((width) => width >= maxW && width <= sumW)
    .sort((a, b) => a - b);
}

function skylinePack(items: ArrangementItem[], maxWidth: number): PackedItem[] {
  const skyline: SkylineSegment[] = [{ x: 0, y: 0, w: maxWidth }];
  const packed: PackedItem[] = [];

  for (const item of items) {
    const placement = findBestPlacement(skyline, item, maxWidth);
    packed.push({ ...item, x: placement.x, y: placement.y });
    addSkylineLevel(skyline, placement.segmentIndex, placement.x, placement.y + item.expandedH, item.expandedW);
  }

  return packed;
}

function findBestPlacement(skyline: SkylineSegment[], item: ArrangementItem, maxWidth: number) {
  let best: { segmentIndex: number; x: number; y: number; bottom: number; waste: number } | null = null;
  for (let index = 0; index < skyline.length; index += 1) {
    const x = skyline[index].x;
    if (x + item.expandedW > maxWidth) continue;
    const y = skylineYFor(skyline, index, item.expandedW);
    if (y === null) continue;
    const bottom = y + item.expandedH;
    const waste = coveredWasteBelow(skyline, index, item.expandedW, y);
    const candidate = { segmentIndex: index, x, y, bottom, waste };
    if (!best || candidate.bottom < best.bottom || (candidate.bottom === best.bottom && candidate.y < best.y) || (candidate.bottom === best.bottom && candidate.y === best.y && candidate.waste < best.waste) || (candidate.bottom === best.bottom && candidate.y === best.y && candidate.waste === best.waste && candidate.x < best.x)) {
      best = candidate;
    }
  }
  return best ?? { segmentIndex: 0, x: 0, y: skylineHeight(skyline), bottom: skylineHeight(skyline) + item.expandedH, waste: 0 };
}

function skylineYFor(skyline: SkylineSegment[], startIndex: number, width: number): number | null {
  let remaining = width;
  let y = 0;
  for (let index = startIndex; index < skyline.length && remaining > 0; index += 1) {
    y = Math.max(y, skyline[index].y);
    remaining -= skyline[index].w;
  }
  return remaining <= 0 ? y : null;
}

function coveredWasteBelow(skyline: SkylineSegment[], startIndex: number, width: number, y: number): number {
  let remaining = width;
  let waste = 0;
  for (let index = startIndex; index < skyline.length && remaining > 0; index += 1) {
    const segmentWidth = Math.min(remaining, skyline[index].w);
    waste += segmentWidth * Math.max(0, y - skyline[index].y);
    remaining -= segmentWidth;
  }
  return waste;
}

function addSkylineLevel(skyline: SkylineSegment[], index: number, x: number, y: number, width: number) {
  skyline.splice(index, 0, { x, y, w: width });
  for (let cursor = index + 1; cursor < skyline.length; cursor += 1) {
    const previous = skyline[cursor - 1];
    const current = skyline[cursor];
    const previousRight = previous.x + previous.w;
    if (current.x >= previousRight) break;
    const overlap = previousRight - current.x;
    current.x += overlap;
    current.w -= overlap;
    if (current.w > 0) break;
    skyline.splice(cursor, 1);
    cursor -= 1;
  }
  mergeSkyline(skyline);
}

function mergeSkyline(skyline: SkylineSegment[]) {
  for (let index = 0; index < skyline.length - 1; index += 1) {
    if (skyline[index].y !== skyline[index + 1].y) continue;
    skyline[index].w += skyline[index + 1].w;
    skyline.splice(index + 1, 1);
    index -= 1;
  }
}

function scoreCandidate(packed: PackedItem[], layout: CanvasArrangeLayout, targetAspect: number): PackedCandidate {
  const width = Math.max(...packed.map((item) => item.x + item.geometry.w));
  const height = Math.max(...packed.map((item) => item.y + item.geometry.h));
  const area = width * height;
  const aspect = width / Math.max(1, height);
  const aspectPenalty = Math.abs(Math.log(aspect / targetAspect));
  const orientationPenalty = layout === 'rows' && aspect < 1.6
    ? 0.35
    : layout === 'columns' && aspect > 0.95
      ? 0.35
      : 0;
  return {
    packed,
    width,
    height,
    score: area * (1 + aspectPenalty * 0.22 + orientationPenalty),
  };
}

function targetAspectForLayout(layout: CanvasArrangeLayout) {
  if (layout === 'rows') return 2.4;
  if (layout === 'columns') return 0.62;
  return 1.22;
}

function sortByReadingOrder(nodes: CanvasNode[]) {
  return [...nodes].sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id));
}

function snappedBoundsOrigin(nodes: CanvasNode[], snapStep: number) {
  const x = Math.min(...nodes.map((node) => node.x));
  const y = Math.min(...nodes.map((node) => node.y));
  return {
    x: snapCoordinate(x, snapStep),
    y: snapCoordinate(y, snapStep),
  };
}

function nodeGeometry(node: CanvasNode): CanvasNodeGeometry {
  return { x: node.x, y: node.y, w: node.w, h: node.h };
}

function skylineHeight(skyline: SkylineSegment[]) {
  return Math.max(...skyline.map((segment) => segment.y));
}

function snapCoordinate(value: number, snapStep: number) {
  return Math.round(value / snapStep) * snapStep;
}

function snapUp(value: number, snapStep: number) {
  return Math.ceil(value / snapStep) * snapStep;
}
