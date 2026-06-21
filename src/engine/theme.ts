import type { CardAccent, ThemeName } from './types';

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
  kind: Record<CardAccent, string>;
};

export const THEMES: Record<ThemeName, CanvasTheme> = {
  dark: {
    name: 'dark',
    bg: '#121212',
    grid: '#202020',
    gridMajor: '#2b2b2b',
    nodeBg: '#252525',
    nodeBorder: '#383838',
    nodeShadow: 'rgba(0, 0, 0, 0.38)',
    headerText: '#f1f1f1',
    bodyText: '#cdcdcd',
    mutedText: '#959595',
    selected: '#f1f1f1',
    resizeFill: '#cdcdcd',
    kind: {
      task: '#cdcdcd',
      data: '#959595',
      system: '#f1f1f1',
    },
  },
  light: {
    name: 'light',
    bg: '#f6f6f6',
    grid: '#e4e4e4',
    gridMajor: '#d2d2d2',
    nodeBg: '#ffffff',
    nodeBorder: '#d6d6d6',
    nodeShadow: 'rgba(49, 49, 49, 0.16)',
    headerText: '#202020',
    bodyText: '#454545',
    mutedText: '#848484',
    selected: '#202020',
    resizeFill: '#454545',
    kind: {
      task: '#454545',
      data: '#848484',
      system: '#202020',
    },
  },
};
