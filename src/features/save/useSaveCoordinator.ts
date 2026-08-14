import { useEffect, useRef, useState } from 'react'

import { saveNote } from '../../shared/tauri/commands'
import { SaveCoordinator, type SaveState } from './SaveCoordinator'

export function useSaveCoordinator(onSaved?: (result: import('../../shared/tauri/contracts').SaveNoteResult) => void) {
  const coordinatorRef = useRef<SaveCoordinator | null>(null)
  if (!coordinatorRef.current) {
    coordinatorRef.current = new SaveCoordinator(saveNote, { debounceMs: 300, onSaved })
  }

  const coordinator = coordinatorRef.current
  const [state, setState] = useState<SaveState>('idle')
  const [recoverySafeFailure, setRecoverySafeFailure] = useState(false)

  useEffect(
    () => coordinator.subscribe((nextState) => {
      setState(nextState)
      setRecoverySafeFailure(coordinator.isRecoverySafeFailure)
    }),
    [coordinator],
  )

  return { coordinator, state, recoverySafeFailure }
}
