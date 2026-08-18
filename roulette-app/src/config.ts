import type { ColorTheme } from './types/ColorTheme';

export const APP_VERSION = '1.4.0';

export type WinnerMode = 'first' | 'last' | 'rank';

export type AppConfig = {
  appName: string;
  eventTitle: string;
  channelName: string;
  winnerLabel: string;
  defaultEntries: string;
  defaultMap: number;
  defaultSpeed: number;
  winnerMode: WinnerMode;
  winningRank: number;
  useSkills: boolean;
  autoRecording: boolean;
  themePreset: keyof typeof THEME_PRESETS;
  accentColor: string;
  maxHistory: number;
};

export const THEME_PRESETS: Record<string, ColorTheme> = {
  midnight: {
    background: '#07111f',
    marbleLightness: 72,
    marbleWinningBorder: '#ffffff',
    skillColor: '#ffffff',
    coolTimeIndicator: '#f2c66d',
    entity: {
      box: { fill: '#3c83f6', outline: '#73a8ff', bloom: '#3274df', bloomRadius: 12 },
      circle: { fill: '#f2c66d', outline: '#ffe3a0', bloom: '#e8a73c', bloomRadius: 12 },
      polyline: { fill: '#ffffff', outline: '#b7cced', bloom: '#4d8be8', bloomRadius: 8 },
    },
    rankStroke: '#07111f',
    minimapBackground: '#111f33',
    minimapViewport: '#f2c66d',
    winnerText: '#ffffff',
    winnerOutline: '#07111f',
    winnerBackground: 'rgba(7, 17, 31, 0.84)',
  },
  arena: {
    background: '#160b10',
    marbleLightness: 70,
    marbleWinningBorder: '#fff4df',
    skillColor: '#fff4df',
    coolTimeIndicator: '#ff675c',
    entity: {
      box: { fill: '#da3c35', outline: '#ff7a70', bloom: '#d62b26', bloomRadius: 12 },
      circle: { fill: '#f4bd5b', outline: '#ffe2a0', bloom: '#d99528', bloomRadius: 11 },
      polyline: { fill: '#ffffff', outline: '#f1d9d2', bloom: '#d4493f', bloomRadius: 8 },
    },
    rankStroke: '#160b10',
    minimapBackground: '#2c151d',
    minimapViewport: '#f4bd5b',
    winnerText: '#ffffff',
    winnerOutline: '#160b10',
    winnerBackground: 'rgba(22, 11, 16, 0.86)',
  },
  clean: {
    background: '#ece9e2',
    marbleLightness: 48,
    marbleWinningBorder: '#111111',
    skillColor: '#111111',
    coolTimeIndicator: '#e24a3b',
    entity: {
      box: { fill: '#375c7d', outline: '#172a3b', bloom: '#375c7d', bloomRadius: 0 },
      circle: { fill: '#d3a53d', outline: '#765514', bloom: '#d3a53d', bloomRadius: 0 },
      polyline: { fill: '#ffffff', outline: '#1d242b', bloom: '#1d242b', bloomRadius: 0 },
    },
    rankStroke: '#ece9e2',
    minimapBackground: '#ffffff',
    minimapViewport: '#375c7d',
    winnerText: '#161616',
    winnerOutline: '#ece9e2',
    winnerBackground: 'rgba(255, 255, 255, 0.9)',
  },
};

export const DEFAULT_CONFIG: AppConfig = {
  appName: 'MARBLE DRAW',
  eventTitle: '공정하고 즐거운 추첨',
  channelName: '',
  winnerLabel: '당첨',
  defaultEntries: '참가자 A\n참가자 B\n참가자 C\n참가자 D',
  defaultMap: 0,
  defaultSpeed: 1,
  winnerMode: 'first',
  winningRank: 1,
  useSkills: false,
  autoRecording: false,
  themePreset: 'midnight',
  accentColor: '#f2c66d',
  maxHistory: 50,
};

export const STORAGE_KEYS = {
  config: 'creo_marble_roulette_config_v1',
  entries: 'creo_marble_roulette_entries_v1',
  history: 'creo_marble_roulette_history_v1',
} as const;
