import { useEffect, useRef, type RefObject } from 'react'
import { subscribeIntegrationChanges } from '../../shared/integrationEvents'
import type { NoteEditorHandle } from '../editor/NoteEditor'
import type { SaveCoordinator } from '../save/SaveCoordinator'
import type { useNotes } from './useNotes'

type Options = {
  notes: ReturnType<typeof useNotes>
  coordinator: SaveCoordinator
  editor: RefObject<NoteEditorHandle | null>
  onReload: () => void
  onConflict: (noteId: string) => void
  onError: (error: unknown) => void
}

export function useIntegrationSync(options: Options) {
  const latest = useRef(options)
  latest.current = options
  useEffect(() => {
    let active = true
    let queue = Promise.resolve()
    const stop = subscribeIntegrationChanges(change => {
      queue = queue.then(async () => {
        if (!active) return
        const current = latest.current
        const isClean = () => !current.coordinator.hasUnsavedChanges && !current.editor.current?.hasPendingChanges()
        const result = await current.notes.refreshExternal(change.entity === 'note' ? change.id : '', change.revision, isClean)
        if (!active) return
        if (result === 'reloaded') latest.current.onReload()
        if (result === 'conflict') latest.current.onConflict(change.id)
      }).catch(error => { if (active) latest.current.onError(error) })
    }, error => { if (active) latest.current.onError(error) })
    return () => { active = false; stop() }
  }, [])
}
