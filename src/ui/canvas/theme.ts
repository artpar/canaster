import type { CanasterThemeCanvasPatternKind, CanasterThemeId } from '../theme/CanasterTheme';
import { CANASTER_THEMES, canasterThemeById } from '../theme/CanasterThemeRegistry';

export type CanvasTheme = {
  name: CanasterThemeId;
  bg: string;
  grid: string;
  gridMajor: string;
  gridStep: number;
  gridMajorEvery: number;
  gridLineWidth: number;
  gridDash: number[];
  patternKind: CanasterThemeCanvasPatternKind;
  patternOpacity: number;
  patternEmbeddedOpacity: number;
  patternDotRadius: number;
  patternHatchAngle: number;
  patternHatchLength: number;
  wash: string;
  washOpacity: number;
  canvasFontFamily: string;
  canvasTitleSize: string;
  canvasBodySize: string;
  canvasLabelSize: string;
  canvasMicroSize: string;
  canvasTitleWeight: number;
  canvasBodyWeight: number;
  canvasTitleLineHeight: number;
  canvasBodyLineHeight: number;
  canvasLabelLineHeight: number;
  nodeRadius: number;
  nodeRestBorderWidth: number;
  nodeHoverBorderWidth: number;
  nodeSelectedBorderWidth: number;
  nodePrimaryBorderWidth: number;
  nodeShadowBlur: number;
  nodeSelectedShadowBlur: number;
  nodeShadowOffsetY: number;
  nodeBg: string;
  nodeBorder: string;
  nodeShadow: string;
  headerText: string;
  bodyText: string;
  mutedText: string;
  selected: string;
  resizeFill: string;
  nodePadding: number;
  nodeContentInsetX: number;
  nodeTitleY: number;
  nodeMetaY: number;
  nodeContentY: number;
  nodeBodyLineHeight: number;
  nodeLabelLineHeight: number;
  nodeRowHeight: number;
  nodeControlRadius: number;
};

export const THEMES: Record<CanasterThemeId, CanvasTheme> = Object.fromEntries(
  Object.keys(CANASTER_THEMES).map((themeId) => [themeId, canvasThemeFor(themeId)]),
) as Record<CanasterThemeId, CanvasTheme>;

export function canvasThemeFor(themeId: string): CanvasTheme {
  const theme = canasterThemeById(themeId);
  return {
    name: theme.id,
    bg: theme.colors.canvas.background,
    grid: theme.colors.canvas.grid,
    gridMajor: theme.colors.canvas.gridMajor,
    gridStep: theme.texture.gridStep,
    gridMajorEvery: theme.texture.gridMajorEvery,
    gridLineWidth: theme.texture.gridLineWidth,
    gridDash: [...theme.texture.gridDash],
    patternKind: theme.texture.canvasPattern.kind,
    patternOpacity: theme.texture.canvasPattern.opacity,
    patternEmbeddedOpacity: theme.texture.canvasPattern.embeddedOpacity,
    patternDotRadius: theme.texture.canvasPattern.dotRadius,
    patternHatchAngle: theme.texture.canvasPattern.hatchAngle,
    patternHatchLength: theme.texture.canvasPattern.hatchLength,
    wash: theme.texture.canvasWash,
    washOpacity: theme.texture.canvasWashOpacity,
    canvasFontFamily: theme.typography.canvasFamily,
    canvasTitleSize: theme.typography.canvasTitleSize,
    canvasBodySize: theme.typography.canvasBodySize,
    canvasLabelSize: theme.typography.canvasLabelSize,
    canvasMicroSize: theme.typography.canvasMicroSize,
    canvasTitleWeight: theme.typography.canvasTitleWeight,
    canvasBodyWeight: theme.typography.canvasBodyWeight,
    canvasTitleLineHeight: theme.typography.canvasTitleLineHeight,
    canvasBodyLineHeight: theme.typography.canvasBodyLineHeight,
    canvasLabelLineHeight: theme.typography.canvasLabelLineHeight,
    nodeRadius: theme.texture.nodeRadius,
    nodeRestBorderWidth: theme.texture.nodeRestBorderWidth,
    nodeHoverBorderWidth: theme.texture.nodeHoverBorderWidth,
    nodeSelectedBorderWidth: theme.texture.nodeSelectedBorderWidth,
    nodePrimaryBorderWidth: theme.texture.nodePrimaryBorderWidth,
    nodeShadowBlur: theme.texture.nodeShadowBlur,
    nodeSelectedShadowBlur: theme.texture.nodeSelectedShadowBlur,
    nodeShadowOffsetY: theme.texture.nodeShadowOffsetY,
    nodeBg: theme.colors.node.surface,
    nodeBorder: theme.colors.node.border,
    nodeShadow: theme.colors.node.shadow,
    headerText: theme.colors.text.high,
    bodyText: theme.colors.text.body,
    mutedText: theme.colors.text.muted,
    selected: theme.colors.node.selected,
    resizeFill: theme.colors.node.resizeFill,
    nodePadding: parsePixelValue(theme.components.node.padding, 12),
    nodeContentInsetX: theme.components.node.contentInsetX,
    nodeTitleY: theme.components.node.titleY,
    nodeMetaY: theme.components.node.metaY,
    nodeContentY: theme.components.node.contentY,
    nodeBodyLineHeight: theme.components.node.bodyLineHeight,
    nodeLabelLineHeight: theme.components.node.labelLineHeight,
    nodeRowHeight: theme.components.node.rowHeight,
    nodeControlRadius: theme.components.node.controlRadius,
  };
}

function parsePixelValue(value: string, fallback: number) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
