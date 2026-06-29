import type { CanasterThemeCanvasPatternKind, CanasterThemeId } from '../theme/CanasterTheme';
import { CANASTER_THEMES, canasterThemeById } from '../theme/CanasterThemeRegistry';

type NodeKindAccent = 'task' | 'data' | 'system';

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
  kind: Record<NodeKindAccent, string>;
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
    kind: {
      task: theme.colors.node.task,
      data: theme.colors.node.data,
      system: theme.colors.node.system,
    },
  };
}
