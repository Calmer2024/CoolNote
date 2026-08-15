let started = false

export function startSilentUpdater() {
  const environment = (import.meta as ImportMeta & { env?: { PROD?: boolean } }).env
  if (started || !environment?.PROD || typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return
  started = true
  window.setTimeout(() => {
    void (async () => {
      try {
        const [{ check }, { relaunch }] = await Promise.all([
          import('@tauri-apps/plugin-updater'),
          import('@tauri-apps/plugin-process'),
        ])
        const update = await check({ timeout: 15_000 })
        if (!update) return
        await update.downloadAndInstall(undefined, { timeout: 120_000 })
        await relaunch()
      } catch (cause) {
        console.warn('[silent-updater] update check or install failed', cause)
      }
    })()
  }, 8_000)
}
