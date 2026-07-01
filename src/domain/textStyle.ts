import { asEnum, asJsonObject, asNumber, asString } from '../core/nodeData';
import type { JsonObject } from './types';

export const TEXT_STYLE_PRESETS = ['body', 'heading', 'label', 'caption', 'custom'] as const;
export const TEXT_STYLE_FONT_STYLES = ['normal', 'italic'] as const;
export const TEXT_STYLE_DECORATIONS = ['none', 'underline', 'line-through'] as const;
export const TEXT_STYLE_ALIGNMENTS = ['left', 'center', 'right', 'justify'] as const;
export const TEXT_STYLE_VERTICAL_ALIGNMENTS = ['top', 'middle', 'bottom'] as const;
export const TEXT_STYLE_BORDER_STYLES = ['none', 'solid', 'dashed', 'dotted'] as const;
export const TEXT_STYLE_TRANSFORMS = ['none', 'uppercase', 'lowercase', 'capitalize'] as const;

export type TextStylePreset = (typeof TEXT_STYLE_PRESETS)[number];
export type TextStyleFontStyle = (typeof TEXT_STYLE_FONT_STYLES)[number];
export type TextStyleDecoration = (typeof TEXT_STYLE_DECORATIONS)[number];
export type TextStyleAlignment = (typeof TEXT_STYLE_ALIGNMENTS)[number];
export type TextStyleVerticalAlignment = (typeof TEXT_STYLE_VERTICAL_ALIGNMENTS)[number];
export type TextStyleBorderStyle = (typeof TEXT_STYLE_BORDER_STYLES)[number];
export type TextStyleTransform = (typeof TEXT_STYLE_TRANSFORMS)[number];

export type TextStyleSpacing = {
  top: number;
  right: number;
  bottom: number;
  left: number;
} & JsonObject;

export type TextStyleBorder = {
  width: number;
  color: string;
  radius: number;
  style: TextStyleBorderStyle;
} & JsonObject;

export type TextStyle = {
  preset: TextStylePreset;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  fontStyle: TextStyleFontStyle;
  textDecoration: TextStyleDecoration;
  color: string;
  backgroundColor: string;
  align: TextStyleAlignment;
  verticalAlign: TextStyleVerticalAlignment;
  lineHeight: number;
  letterSpacing: number;
  padding: TextStyleSpacing;
  border: TextStyleBorder;
  opacity: number;
  textTransform: TextStyleTransform;
} & JsonObject;

export const DEFAULT_TEXT_STYLE: TextStyle = {
  preset: 'body',
  fontFamily: 'system-ui, sans-serif',
  fontSize: 13,
  fontWeight: 400,
  fontStyle: 'normal',
  textDecoration: 'none',
  color: '#34404d',
  backgroundColor: 'transparent',
  align: 'left',
  verticalAlign: 'top',
  lineHeight: 18,
  letterSpacing: 0,
  padding: {
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  border: {
    width: 0,
    color: '#c4ccd6',
    radius: 0,
    style: 'none',
  },
  opacity: 1,
  textTransform: 'none',
};

export function normalizeTextStyle(raw: unknown, fallback: TextStyle = DEFAULT_TEXT_STYLE): TextStyle {
  const data = asJsonObject(raw);
  return {
    preset: asEnum(data.preset, TEXT_STYLE_PRESETS, fallback.preset),
    fontFamily: normalizeFontFamily(data.fontFamily, fallback.fontFamily),
    fontSize: clampNumber(data.fontSize, 8, 96, fallback.fontSize),
    fontWeight: clampNumber(data.fontWeight, 100, 900, fallback.fontWeight),
    fontStyle: asEnum(data.fontStyle, TEXT_STYLE_FONT_STYLES, fallback.fontStyle),
    textDecoration: asEnum(data.textDecoration, TEXT_STYLE_DECORATIONS, fallback.textDecoration),
    color: normalizeColor(data.color, fallback.color),
    backgroundColor: normalizeColor(data.backgroundColor, fallback.backgroundColor),
    align: asEnum(data.align, TEXT_STYLE_ALIGNMENTS, fallback.align),
    verticalAlign: asEnum(data.verticalAlign, TEXT_STYLE_VERTICAL_ALIGNMENTS, fallback.verticalAlign),
    lineHeight: clampNumber(data.lineHeight, 8, 140, fallback.lineHeight),
    letterSpacing: clampNumber(data.letterSpacing, -4, 16, fallback.letterSpacing),
    padding: normalizeTextStyleSpacing(data.padding, fallback.padding),
    border: normalizeTextStyleBorder(data.border, fallback.border),
    opacity: clampNumber(data.opacity, 0, 1, fallback.opacity),
    textTransform: asEnum(data.textTransform, TEXT_STYLE_TRANSFORMS, fallback.textTransform),
  };
}

export function textStyleWithPreset(preset: TextStylePreset, presetStyle: TextStyle): TextStyle {
  return normalizeTextStyle({
    ...presetStyle,
    preset,
  });
}

function normalizeTextStyleSpacing(raw: unknown, fallback: TextStyleSpacing): TextStyleSpacing {
  const data = asJsonObject(raw);
  return {
    top: clampNumber(data.top, 0, 96, fallback.top),
    right: clampNumber(data.right, 0, 96, fallback.right),
    bottom: clampNumber(data.bottom, 0, 96, fallback.bottom),
    left: clampNumber(data.left, 0, 96, fallback.left),
  };
}

function normalizeTextStyleBorder(raw: unknown, fallback: TextStyleBorder): TextStyleBorder {
  const data = asJsonObject(raw);
  return {
    width: clampNumber(data.width, 0, 24, fallback.width),
    color: normalizeColor(data.color, fallback.color),
    radius: clampNumber(data.radius, 0, 48, fallback.radius),
    style: asEnum(data.style, TEXT_STYLE_BORDER_STYLES, fallback.style),
  };
}

function normalizeFontFamily(value: unknown, fallback: string) {
  const family = asString(value, fallback).trim();
  return family || fallback;
}

function normalizeColor(value: unknown, fallback: string) {
  const color = asString(value, fallback).trim();
  return color || fallback;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const number = asNumber(value, fallback);
  return Math.min(max, Math.max(min, Math.round(number * 100) / 100));
}
