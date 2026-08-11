export type ThemeMode = 'system' | 'light' | 'dark'

type LibrarySettings = Record<string, unknown> & { theme?: ThemeMode }

const themeModes: ThemeMode[] = ['system', 'light', 'dark']

export function parseLibrarySettings(settingsJson: string): LibrarySettings {
  try {
    const value = JSON.parse(settingsJson) as unknown
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return value as LibrarySettings
  } catch {
    return {}
  }
}

export function themeFromSettings(settingsJson: string): ThemeMode {
  const theme = parseLibrarySettings(settingsJson).theme
  return themeModes.includes(theme ?? 'system') ? (theme ?? 'system') : 'system'
}

export function settingsWithTheme(settingsJson: string, theme: ThemeMode) {
  return JSON.stringify({ ...parseLibrarySettings(settingsJson), theme })
}

export function nextTheme(theme: ThemeMode): ThemeMode {
  return themeModes[(themeModes.indexOf(theme) + 1) % themeModes.length]
}

export function resolvedTheme(theme: ThemeMode): 'light' | 'dark' {
  if (theme !== 'system') return theme
  return typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}
