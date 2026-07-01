import { DEFAULT_TEXT_STYLE, normalizeTextStyle, type TextStyle, type TextStylePreset } from '../../domain/textStyle';
import type { CanvasTheme } from '../canvas/theme';

export function textStylePresetsForTheme(theme: CanvasTheme): Record<TextStylePreset, TextStyle> {
  const body = normalizeTextStyle({
    preset: 'body',
    fontFamily: theme.canvasFontFamily,
    fontSize: pixelNumber(theme.canvasBodySize, 13),
    fontWeight: theme.canvasBodyWeight,
    fontStyle: 'normal',
    textDecoration: 'none',
    color: theme.bodyText,
    backgroundColor: 'transparent',
    align: 'left',
    verticalAlign: 'top',
    lineHeight: theme.canvasBodyLineHeight,
    letterSpacing: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    border: { width: 0, color: theme.nodeBorder, radius: 0, style: 'none' },
    opacity: 1,
    textTransform: 'none',
  });
  return {
    body,
    heading: normalizeTextStyle({
      ...body,
      preset: 'heading',
      fontSize: Math.max(pixelNumber(theme.canvasTitleSize, 14), pixelNumber(theme.canvasBodySize, 13) + 5),
      fontWeight: theme.canvasTitleWeight,
      color: theme.headerText,
      align: 'center',
      verticalAlign: 'middle',
      lineHeight: Math.max(theme.canvasTitleLineHeight, pixelNumber(theme.canvasTitleSize, 14) + 6),
    }),
    label: normalizeTextStyle({
      ...body,
      preset: 'label',
      fontSize: pixelNumber(theme.canvasLabelSize, 12),
      fontWeight: theme.canvasTitleWeight,
      color: theme.headerText,
      lineHeight: theme.canvasLabelLineHeight,
    }),
    caption: normalizeTextStyle({
      ...body,
      preset: 'caption',
      fontSize: pixelNumber(theme.canvasMicroSize, 10),
      color: theme.mutedText,
      lineHeight: theme.canvasLabelLineHeight,
    }),
    custom: normalizeTextStyle({
      ...body,
      preset: 'custom',
    }),
  };
}

export function defaultTextStyleForTheme(theme: CanvasTheme, preset: TextStylePreset = 'body') {
  return textStylePresetsForTheme(theme)[preset];
}

export function resolveTextStyleForTheme(theme: CanvasTheme, style: TextStyle): TextStyle {
  const stored = normalizeTextStyle(style);
  const inherited = defaultTextStyleForTheme(theme, stored.preset);
  return normalizeTextStyle({
    preset: stored.preset,
    fontFamily: inheritedValue(stored.fontFamily, DEFAULT_TEXT_STYLE.fontFamily, inherited.fontFamily),
    fontSize: inheritedValue(stored.fontSize, DEFAULT_TEXT_STYLE.fontSize, inherited.fontSize),
    fontWeight: inheritedValue(stored.fontWeight, DEFAULT_TEXT_STYLE.fontWeight, inherited.fontWeight),
    fontStyle: inheritedValue(stored.fontStyle, DEFAULT_TEXT_STYLE.fontStyle, inherited.fontStyle),
    textDecoration: inheritedValue(stored.textDecoration, DEFAULT_TEXT_STYLE.textDecoration, inherited.textDecoration),
    color: inheritedValue(stored.color, DEFAULT_TEXT_STYLE.color, inherited.color),
    backgroundColor: inheritedValue(stored.backgroundColor, DEFAULT_TEXT_STYLE.backgroundColor, inherited.backgroundColor),
    align: inheritedValue(stored.align, DEFAULT_TEXT_STYLE.align, inherited.align),
    verticalAlign: inheritedValue(stored.verticalAlign, DEFAULT_TEXT_STYLE.verticalAlign, inherited.verticalAlign),
    lineHeight: inheritedValue(stored.lineHeight, DEFAULT_TEXT_STYLE.lineHeight, inherited.lineHeight),
    letterSpacing: inheritedValue(stored.letterSpacing, DEFAULT_TEXT_STYLE.letterSpacing, inherited.letterSpacing),
    padding: {
      top: inheritedValue(stored.padding.top, DEFAULT_TEXT_STYLE.padding.top, inherited.padding.top),
      right: inheritedValue(stored.padding.right, DEFAULT_TEXT_STYLE.padding.right, inherited.padding.right),
      bottom: inheritedValue(stored.padding.bottom, DEFAULT_TEXT_STYLE.padding.bottom, inherited.padding.bottom),
      left: inheritedValue(stored.padding.left, DEFAULT_TEXT_STYLE.padding.left, inherited.padding.left),
    },
    border: {
      width: inheritedValue(stored.border.width, DEFAULT_TEXT_STYLE.border.width, inherited.border.width),
      color: inheritedValue(stored.border.color, DEFAULT_TEXT_STYLE.border.color, inherited.border.color),
      radius: inheritedValue(stored.border.radius, DEFAULT_TEXT_STYLE.border.radius, inherited.border.radius),
      style: inheritedValue(stored.border.style, DEFAULT_TEXT_STYLE.border.style, inherited.border.style),
    },
    opacity: inheritedValue(stored.opacity, DEFAULT_TEXT_STYLE.opacity, inherited.opacity),
    textTransform: inheritedValue(stored.textTransform, DEFAULT_TEXT_STYLE.textTransform, inherited.textTransform),
  });
}

function inheritedValue<T>(stored: T, defaultValue: T, inherited: T): T {
  return stored === defaultValue ? inherited : stored;
}

function pixelNumber(value: string, fallback: number) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
