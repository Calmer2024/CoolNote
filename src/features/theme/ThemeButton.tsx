import { useEffect, useState } from 'react'

import { Icon } from '../../shared/components/Icon'
import { updateLibrarySettings } from '../../shared/tauri/commands'
import type { LibraryDto } from '../../shared/tauri/contracts'
import {
  nextTheme,
  resolvedTheme,
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
  const [theme, setTheme] = useState<ThemeMode>('system')
  const [settingsJson, setSettingsJson] = useState('{}')
  const [settingsRevision, setSettingsRevision] = useState(1)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!library) return
    setTheme(themeFromSettings(library.settingsJson))
    setSettingsJson(library.settingsJson)
    setSettingsRevision(library.settingsRevision)
  }, [library])

  useEffect(() => {
    const root = document.documentElement
    root.dataset.themeMode = theme
    const applyResolvedTheme = () => {
      root.dataset.theme = resolvedTheme(theme)
    }
    applyResolvedTheme()

    if (theme !== 'system' || typeof window.matchMedia !== 'function') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener?.('change', applyResolvedTheme)
    return () => media.removeEventListener?.('change', applyResolvedTheme)
  }, [theme])

  const cycleTheme = async () => {
    if (!library || saving) return
    const previousTheme = theme
    const previousSettingsJson = settingsJson
    const next = nextTheme(theme)
    const nextSettingsJson = settingsWithTheme(settingsJson, next)
    setTheme(next)
    setSettingsJson(nextSettingsJson)
    setSaving(true)
    onError('')
    try {
      const updated = await updateLibrarySettings({
        baseSettingsRevision: settingsRevision,
        settingsJson: nextSettingsJson,
      })
      setSettingsRevision(updated.settingsRevision)
      setSettingsJson(updated.settingsJson)
      setTheme(themeFromSettings(updated.settingsJson))
      onLibraryChange(updated)
    } catch (cause) {
      setTheme(previousTheme)
      setSettingsJson(previousSettingsJson)
      onError(cause instanceof Error ? cause.message : '无法保存主题设置。')
    } finally {
      setSaving(false)
    }
  }

  const label = `主题：${labels[theme]}`
  return (
    <button
      className="icon-button theme-button"
      type="button"
      aria-label={label}
      title={label}
      disabled={!library || saving}
      onClick={() => void cycleTheme()}
    >
      <Icon name={icons[theme]} />
    </button>
  )
}
