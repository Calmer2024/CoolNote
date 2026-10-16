import { listen } from '@tauri-apps/api/event'

export type IntegrationChange = {
  entity: 'note' | 'task' | 'jotting'
  id: string
  revision: number
  source: 'mcp'
}

/** Subscribe without leaking a listener when unmounted during async setup. */
export function subscribeIntegrationChanges(
  onChange: (change: IntegrationChange) => void,
  onError: (error: unknown) => void,
) {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return () => {}
  let disposed = false
  let unlisten: (() => void) | undefined
  void listen<IntegrationChange>('coolnote-data-changed', event => {
    if (!disposed) onChange(event.payload)
  }).then(stop => {
    if (disposed) stop()
    else unlisten = stop
  }).catch(error => { if (!disposed) onError(error) })
  return () => { disposed = true; unlisten?.() }
}
