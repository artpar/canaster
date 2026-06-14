import type { CanvasNodeKind, ThemeName } from './types';

export type CanvasTheme = {
  name: ThemeName;
  bg: string;
  grid: string;
  gridMajor: string;
  nodeBg: string;
  nodeBorder: string;
  nodeShadow: string;
  headerText: string;
  bodyText: string;
  mutedText: string;
  selected: string;
  resizeFill: string;
  kind: Record<CanvasNodeKind, string>;
};

export const THEMES: Record<ThemeName, CanvasTheme> = {
  dark: {
    name: 'dark',
    bg: '#101217',
    grid: '#1b2028',
    gridMajor: '#252c36',
    nodeBg: '#1f2630',
    nodeBorder: '#303946',
    nodeShadow: 'rgba(0, 0, 0, 0.38)',
    headerText: '#eef2f6',
    bodyText: '#c6ced8',
    mutedText: '#8b96a5',
    selected: '#5aa7ff',
    resizeFill: '#f2c94c',
    kind: {
      task: '#5aa7ff',
      data: '#42c987',
      system: '#f2a65a',
    },
  },
  light: {
    name: 'light',
    bg: '#f4f6f8',
    grid: '#e0e5eb',
    gridMajor: '#cbd3dd',
    nodeBg: '#ffffff',
    nodeBorder: '#cfd7e2',
    nodeShadow: 'rgba(38, 50, 68, 0.16)',
    headerText: '#18212d',
    bodyText: '#3d4652',
    mutedText: '#7a8594',
    selected: '#2f6fd0',
    resizeFill: '#b98514',
    kind: {
      task: '#2f6fd0',
      data: '#228a5b',
      system: '#bd6c1c',
    },
  },
};
