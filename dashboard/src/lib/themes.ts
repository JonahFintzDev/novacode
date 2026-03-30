export interface Theme {
  id: string;
  name: string;
  dark: boolean;
  bg: string;
  surface: string;
  card: string;
  primary: string;
  primaryHover: string;
  success: string;
  warning: string;
  destructive: string;
  textPrimary: string;
  textMuted: string;
}

export const themes: Theme[] = [
  {
    id: 'deep-space',
    name: 'Deep Space',
    dark: true,
    bg: '#0d0f14',
    surface: '#13161e',
    card: '#1a1d2b',
    primary: '#6c8aff',
    primaryHover: '#8ba1ff',
    success: '#34d399',
    warning: '#fbbf24',
    destructive: '#f87171',
    textPrimary: '#e2e8f0',
    textMuted: '#64748b'
  },
  {
    id: 'carbon',
    name: 'Carbon',
    dark: true,
    bg: '#111111',
    surface: '#1c1c1c',
    card: '#242424',
    primary: '#3b82f6',
    primaryHover: '#60a5fa',
    success: '#22c55e',
    warning: '#fbbf24',
    destructive: '#f87171',
    textPrimary: '#f5f5f5',
    textMuted: '#71717a'
  },
  {
    id: 'terminal-green',
    name: 'Terminal Green',
    dark: true,
    bg: '#0a0f0a',
    surface: '#0d1a0d',
    card: '#0f200f',
    primary: '#00ff41',
    primaryHover: '#00cc33',
    success: '#00ff41',
    warning: '#ffd60a',
    destructive: '#ff453a',
    textPrimary: '#c8ffc8',
    textMuted: '#4d7a4d'
  },
  {
    id: 'midnight-violet',
    name: 'Midnight Violet',
    dark: true,
    bg: '#0f0e17',
    surface: '#16152a',
    card: '#1e1c35',
    primary: '#7c6af5',
    primaryHover: '#9585f8',
    success: '#4ade80',
    warning: '#fbbf24',
    destructive: '#f87171',
    textPrimary: '#fffffe',
    textMuted: '#6b5f8a'
  },
  {
    id: 'ember',
    name: 'Ember',
    dark: true,
    bg: '#110a0a',
    surface: '#1c1010',
    card: '#251616',
    primary: '#e53e3e',
    primaryHover: '#f56565',
    success: '#68d391',
    warning: '#f6ad55',
    destructive: '#fc8181',
    textPrimary: '#faf0f0',
    textMuted: '#7a5858'
  },
  {
    id: 'bloodline',
    name: 'Bloodline',
    dark: true,
    bg: '#0d0d0d',
    surface: '#181010',
    card: '#211515',
    primary: '#cc2222',
    primaryHover: '#e53e3e',
    success: '#4ade80',
    warning: '#facc15',
    destructive: '#f87171',
    textPrimary: '#f5f5f5',
    textMuted: '#6b5b5b'
  },
  {
    id: 'rust',
    name: 'Rust',
    dark: true,
    bg: '#0f0c0a',
    surface: '#1a1210',
    card: '#231916',
    primary: '#c0452a',
    primaryHover: '#d4845a',
    success: '#6ee7b7',
    warning: '#fbbf24',
    destructive: '#f87171',
    textPrimary: '#f0ebe8',
    textMuted: '#7a6560'
  },
  {
    id: 'infrared',
    name: 'Infrared',
    dark: true,
    bg: '#0a0a0f',
    surface: '#130e18',
    card: '#1b1222',
    primary: '#ff2d55',
    primaryHover: '#ff4d72',
    success: '#30d158',
    warning: '#ffd60a',
    destructive: '#ff453a',
    textPrimary: '#f2f2f7',
    textMuted: '#636369'
  },
  {
    id: 'cloud',
    name: 'Cloud',
    dark: false,
    bg: '#f8f9fc',
    surface: '#eef0f6',
    card: '#e4e7f0',
    primary: '#4f6ef7',
    primaryHover: '#3b5af5',
    success: '#12a06e',
    warning: '#d97706',
    destructive: '#dc2626',
    textPrimary: '#111827',
    textMuted: '#6b7280'
  },
  {
    id: 'cream',
    name: 'Cream',
    dark: false,
    bg: '#faf8f2',
    surface: '#f2ede0',
    card: '#e8e0cc',
    primary: '#b45309',
    primaryHover: '#92400e',
    success: '#059669',
    warning: '#d97706',
    destructive: '#dc2626',
    textPrimary: '#1c1917',
    textMuted: '#78716c'
  },
  {
    id: 'frost',
    name: 'Frost',
    dark: false,
    bg: '#f0f5fb',
    surface: '#e1ecf7',
    card: '#cfe0f0',
    primary: '#0284c7',
    primaryHover: '#0369a1',
    success: '#059669',
    warning: '#d97706',
    destructive: '#dc2626',
    textPrimary: '#0f172a',
    textMuted: '#475569'
  },
  {
    id: 'sakura',
    name: 'Sakura',
    dark: false,
    bg: '#fdf4f8',
    surface: '#fce7f2',
    card: '#f9d5e8',
    primary: '#db2777',
    primaryHover: '#be185d',
    success: '#059669',
    warning: '#d97706',
    destructive: '#dc2626',
    textPrimary: '#1f1720',
    textMuted: '#9d6f85'
  }
];

export const DEFAULT_THEME_ID = 'infrared';
export const DEFAULT_DARK_THEME_ID = 'deep-space';
export const DEFAULT_LIGHT_THEME_ID = 'cloud';

function isLightHex(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 127.5;
}

export function applyTheme(themeId: string): void {
  const theme =
    themes.find((t) => t.id === themeId) ?? themes.find((t) => t.id === DEFAULT_THEME_ID)!;
  const root = document.documentElement;
  root.style.setProperty('--color-bg', theme.bg);
  root.style.setProperty('--color-surface', theme.surface);
  root.style.setProperty('--color-card', theme.card);
  root.style.setProperty('--color-input', theme.surface);
  root.style.setProperty('--color-border', theme.card);
  root.style.setProperty('--color-primary', theme.primary);
  root.style.setProperty('--color-primary-hover', theme.primaryHover);
  root.style.setProperty('--color-success', theme.success);
  root.style.setProperty('--color-warning', theme.warning);
  root.style.setProperty('--color-destructive', theme.destructive);
  root.style.setProperty('--color-text-primary', theme.textPrimary);
  root.style.setProperty('--color-text-muted', theme.textMuted);
  root.style.setProperty('--color-fg', isLightHex(theme.bg) ? '#000000' : '#ffffff');
  root.setAttribute('data-theme', theme.dark ? 'dark' : 'light');
  document.body.style.background = theme.bg;
  document.body.style.color = theme.textPrimary;
}

let _colorSchemeListener: ((e: MediaQueryListEvent) => void) | null = null;
let _colorSchemeQuery: MediaQueryList | null = null;

export function resolveAutoTheme(): string {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (prefersDark) {
    return localStorage.getItem('darkTheme') ?? DEFAULT_DARK_THEME_ID;
  } else {
    return localStorage.getItem('lightTheme') ?? DEFAULT_LIGHT_THEME_ID;
  }
}

export function startAutoThemeWatcher(): void {
  stopAutoThemeWatcher();
  _colorSchemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
  _colorSchemeListener = () => {
    applyTheme(resolveAutoTheme());
  };
  _colorSchemeQuery.addEventListener('change', _colorSchemeListener);
}

export function stopAutoThemeWatcher(): void {
  if (_colorSchemeQuery && _colorSchemeListener) {
    _colorSchemeQuery.removeEventListener('change', _colorSchemeListener);
  }
  _colorSchemeQuery = null;
  _colorSchemeListener = null;
}
