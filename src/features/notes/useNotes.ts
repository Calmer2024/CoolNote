import { useCallback, useEffect, useRef, useState } from 'react'

import {
  createNote,
  getNote,
  initializeLibrary,
  listNotes,
} from '../../shared/tauri/commands'
import type {
  LibraryDto,
  NoteDto,
  NoteSummaryDto,
  RecoveryRecordDto,
  VersionedDocument,
} from '../../shared/tauri/contracts'
import { normalizeDocument } from '../editor/document'

type NotesStatus = 'booting' | 'ready' | 'failed'

function toSummary(note: NoteDto): NoteSummaryDto {
  return {
    id: note.id,
    title: note.title,
    excerpt: note.plainText,
    revision: note.revision,
    updatedAt: note.updatedAt,
  }
}

export function useNotes() {
  const [status, setStatus] = useState<NotesStatus>('booting')
  const [library, setLibrary] = useState<LibraryDto | null>(null)
  const [notes, setNotes] = useState<NoteSummaryDto[]>([])
  const [total, setTotal] = useState(0)
  const [selectedNote, setSelectedNote] = useState<NoteDto | null>(null)
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [isLoadingNote, setIsLoadingNote] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const selectionToken = useRef(0)

  const loadLibrary = useCallback(async () => {
    setStatus('booting')
    setLibrary(null)
    setError(null)
    try {
      const initializedLibrary = await initializeLibrary()
      const page = await listNotes(0, 50)
      setLibrary(initializedLibrary)
      setNotes(page.items)
      setTotal(page.total)
      setStatus('ready')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法打开本机笔记库')
      setStatus('failed')
    }
  }, [])

  useEffect(() => {
    void loadLibrary()
  }, [loadLibrary])

  const select = useCallback(async (noteId: string) => {
    const token = ++selectionToken.current
    setSelectedNoteId(noteId)
    setSelectedNote(null)
    setIsLoadingNote(true)
    setError(null)
    try {
      const note = await getNote(noteId)
      if (selectionToken.current === token) {
        setSelectedNote({ ...note, document: normalizeDocument(note.document) })
      }
    } catch (cause) {
      if (selectionToken.current === token) {
        setSelectedNote(null)
        setError(
          cause instanceof Error ? cause.message : '无法打开这篇笔记，请重试',
        )
      }
    } finally {
      if (selectionToken.current === token) setIsLoadingNote(false)
    }
  }, [])

  const loadMore = useCallback(async () => {
    if (isLoadingMore || notes.length >= total) return
    setIsLoadingMore(true)
    setError(null)
    try {
      const page = await listNotes(notes.length, 50)
      setNotes((current) => {
        const known = new Set(current.map((item) => item.id))
        return [...current, ...page.items.filter((item) => !known.has(item.id))]
      })
      setTotal(page.total)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法加载更多笔记')
    } finally {
      setIsLoadingMore(false)
    }
  }, [isLoadingMore, notes.length, total])

  const create = useCallback(async () => {
    if (status !== 'ready' || isCreating) return null
    setIsCreating(true)
    setError(null)
    try {
      selectionToken.current += 1
      const note = await createNote()
      const normalized = { ...note, document: normalizeDocument(note.document) }
      setNotes((current) => {
        const next = [
          toSummary(normalized),
          ...current.filter((item) => item.id !== normalized.id),
        ]
        return next.slice(0, current.length >= 50 ? current.length : current.length + 1)
      })
      setTotal((current) => current + 1)
      setSelectedNoteId(normalized.id)
      setSelectedNote(normalized)
      return normalized
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法新建笔记，请重试')
      return null
    } finally {
      setIsCreating(false)
    }
  }, [isCreating, status])

  const updateDraft = useCallback(
    (noteId: string, title: string, document: VersionedDocument) => {
      setSelectedNote((current) =>
        current?.id === noteId ? { ...current, title, document } : current,
      )
      setNotes((current) =>
        current.map((note) =>
          note.id === noteId ? { ...note, title } : note,
        ),
      )
    },
    [],
  )

  const applyRecoveredDraft = useCallback(
    (databaseNote: NoteDto, draft: RecoveryRecordDto) => {
      selectionToken.current += 1
      const document = normalizeDocument(draft.documentJson as VersionedDocument)
      const restored = { ...databaseNote, title: draft.title, document }
      setSelectedNoteId(restored.id)
      setSelectedNote(restored)
      setIsLoadingNote(false)
      setNotes((current) =>
        current.map((note) =>
          note.id === restored.id
            ? { ...note, title: restored.title, revision: restored.revision }
            : note,
        ),
      )
    },
    [],
  )

  const updateLibrary = useCallback((updated: LibraryDto) => {
    setLibrary(updated)
  }, [])

  return {
    status,
    library,
    notes,
    total,
    selectedNote,
    selectedNoteId,
    error,
    isCreating,
    isLoadingNote,
    isLoadingMore,
    create,
    select,
    loadMore,
    updateDraft,
    applyRecoveredDraft,
    updateLibrary,
    retry: loadLibrary,
  }
}
