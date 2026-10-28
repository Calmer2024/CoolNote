import { useState } from 'react'

import { applyThemeMode, initialThemeMode } from './themeAppearance'
import { Icon } from '../../shared/components/Icon'
import { updateLibrarySettings } from '../../shared/tauri/commands'
import type { LibraryDto } from '../../shared/tauri/contracts'
import {
  nextTheme,
  settingsWithTheme,
  type ThemeMode,
  themeFromSettings,
} from './theme'

type ThemeButtonProps = {
  library: LibraryDto | null
  onLibraryChange: (library: LibraryDto) => void
  onError: (message: string) => void
}

const labels: Record<ThemeMode, string> = {
  system: '跟随系统',
  light: '浅色',
  dark: '深色',
}

const icons: Record<ThemeMode, string> = {
  system: 'monitor',
  light: 'sun',
  dark: 'moon',
}

export function ThemeButton({
  library,
  onLibraryChange,
  onError,
}: ThemeButtonProps) {
  const [pendingTheme, setPendingTheme] = useState<ThemeMode | null>(null)
  const [saving, setSaving] = useState(false)
  const theme = pendingTheme ?? (library ? themeFromSettings(library.settingsJson) : initialThemeMode())

  const cycleTheme = async () => {
    if (!library || saving) return
    const previousTheme = theme
    const next = nextTheme(theme)
    const nextSettingsJson = settingsWithTheme(library.settingsJson, next)
    setPendingTheme(next)
    void applyThemeMode(next)
    setSaving(true)
    onError('')
    try {
      const updated = await updateLibrarySettings({
        baseSettingsRevision: library.settingsRevision,
        settingsJson: nextSettingsJson,
      })
      void applyThemeMode(themeFromSettings(updated.settingsJson), { persist: true })
      onLibraryChange(updated)
    } catch (cause) {
      void applyThemeMode(previousTheme)
      onError(cause instanceof Error ? cause.message : '无法保存主题设置。')
    } finally {
      setPendingTheme(null)
      setSaving(false)
    }
  }

  const label = `主题：${labels[theme]}`
  return (
    <button
      className="icon-button theme-button"
      type="button"
      aria-label={label}
      disabled={!library || saving}
      onClick={() => void cycleTheme()}
    >
      <Icon name={icons[theme]} />
    </button>
  )
}
