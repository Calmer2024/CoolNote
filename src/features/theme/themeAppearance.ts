import { invoke } from '@tauri-apps/api/core'
import { useLayoutEffect } from 'react'
import { resolvedTheme, themeFromSettings, type ThemeMode } from './theme'

const participants = new Set<() => Promise<unknown>>()
let revision = 0
let transition: ViewTransition | undefined
let pending: { mode: ThemeMode; resolved: string; done: Promise<void> } | undefined
let nativeQueue: Promise<unknown> = Promise.resolve()

export function initialThemeMode(): ThemeMode {
  const mode = document.documentElement.dataset.themeMode
  return mode === 'light' || mode === 'dark' ? mode : 'system'
}

/** Charts finish rendering before the new theme snapshot becomes visible. */
export function registerThemeParticipant(update: () => Promise<unknown>) {
  participants.add(update)
  return () => { participants.delete(update) }
}

function syncNativeTheme(mode: ThemeMode, token: number) {
  if (!('__TAURI_INTERNALS__' in window)) return
  nativeQueue = nativeQueue.catch(() => undefined).then(() => {
    if (token === revision) return invoke('set_window_theme', { mode })
  }).catch(() => undefined)
}

export function applyThemeMode(mode: ThemeMode, { animate = true, persist = false } = {}): Promise<void> {
  const root = document.documentElement
  const resolved = resolvedTheme(mode)
  if (persist) { try { localStorage.setItem('coolnote.themeMode', mode) } catch { /* Native settings remain authoritative. */ } }
  if (pending?.mode === mode && pending.resolved === resolved) return pending.done
  const token = ++revision
  transition?.skipTransition()
  root.dataset.themeMode = mode
  syncNativeTheme(mode, token)
  if (root.dataset.theme === resolved) {
    delete root.dataset.themeChanging
    pending = undefined
    return Promise.resolve()
  }
  const update = async () => {
    if (token !== revision) return
    root.dataset.theme = resolved
    root.style.colorScheme = resolved
    root.style.backgroundColor = resolved === 'dark' ? '#171a1e' : '#ffffff'
    await Promise.allSettled([...participants].map(participant => participant()))
  }
  // A single document crossfade avoids independently timed component colors.
  // Unsupported WebViews and reduced-motion users get an atomic direct update.
  root.dataset.themeChanging = 'true'
  let done: Promise<unknown>
  if (animate && document.startViewTransition && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    transition = document.startViewTransition(update)
    done = transition.finished.catch(() => undefined)
    void transition.ready.catch(() => undefined)
  } else {
    transition = undefined
    done = update()
  }
  const completion = done.finally(() => {
    if (token !== revision) return
    delete root.dataset.themeChanging
    pending = undefined
    transition = undefined
  }).then(() => undefined)
  pending = { mode, resolved, done: completion }
  return completion
}

/** Theme lifecycle belongs to the application, not a button's mount state. */
export function useThemeAppearance(settingsJson: string | undefined) {
  useLayoutEffect(() => {
    const mode = settingsJson === undefined ? initialThemeMode() : themeFromSettings(settingsJson)
    void applyThemeMode(mode, { animate: false, persist: settingsJson !== undefined })
    if (mode !== 'system' || !window.matchMedia) return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const changed = () => { void applyThemeMode(mode) }
    media.addEventListener?.('change', changed)
    return () => media.removeEventListener?.('change', changed)
  }, [settingsJson])
}
