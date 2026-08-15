import { useCallback, useEffect, useRef, useState } from 'react'

import {
  batchNotes,
  createCategory,
  createWorkspaceNote,
  deleteCategory,
  emptyTrash,
  getWorkspaceNote,
  getWorkspaceSnapshot,
  importNotes,
  initializeLibrary,
  moveNotes,
  queryNotes,
  renameCategory,
  setNoteMood,
  updateCategoryAppearance,
} from '../../shared/tauri/commands'
import type {
  BatchAction,
  CategoryDto,
  LibraryDto,
  NoteDto,
  NoteQuery,
  NoteSort,
  NoteSummaryDto,
  NoteView,
  RecoveryRecordDto,
  SaveNoteResult,
  SystemCountsDto,
  VersionedDocument,
} from '../../shared/tauri/contracts'
import { normalizeDocument } from '../editor/document'
import { parseMarkdownDocument } from '../editor/markdown'

type NotesStatus = 'booting' | 'ready' | 'failed'
const PAGE_SIZE = 80

function toSummary(note: NoteDto): NoteSummaryDto {
  return {
    id: note.id,
    title: note.title,
    excerpt: note.plainText,
    revision: note.revision,
    categoryId: note.categoryId,
    isFavorite: note.isFavorite,
    isArchived: note.isArchived,
    deletedAt: note.deletedAt,
    mood: note.mood,
    updatedAt: note.updatedAt,
  }
}

export function useNotes() {
  const [status, setStatus] = useState<NotesStatus>('booting')
  const [library, setLibrary] = useState<LibraryDto | null>(null)
  const [notes, setNotes] = useState<NoteSummaryDto[]>([])
  const [categories, setCategories] = useState<CategoryDto[]>([])
  const [systemCounts,setSystemCounts]=useState<SystemCountsDto>({all:0,favorites:0,archived:0,trash:0,jottings:0,galleries:0})
  const [total, setTotal] = useState(0)
  const [selectedNote, setSelectedNote] = useState<NoteDto | null>(null)
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [view, setViewState] = useState<NoteView>('all')
  const [categoryId, setCategoryIdState] = useState<string | null>(null)
  const [search, setSearchState] = useState('')
  const [sortBy, setSortByState] = useState<NoteSort>('updatedAt')
  const [sortDirection, setSortDirectionState] = useState<'asc' | 'desc'>('desc')
  const [error, setError] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [isLoadingNote, setIsLoadingNote] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const selectionToken = useRef(0)
  const queryRef = useRef({ view, categoryId, search, sortBy, sortDirection })
  queryRef.current = { view, categoryId, search, sortBy, sortDirection }

  const makeQuery = useCallback((offset = 0): NoteQuery => ({
    ...queryRef.current,
    offset,
    limit: PAGE_SIZE,
  }), [])

  const refreshWorkspace = useCallback(async () => {
    const snapshot = await getWorkspaceSnapshot()
    setCategories(snapshot.categories)
    setSystemCounts(snapshot.systemCounts)
  }, [])

  const refreshNotes = useCallback(async () => {
    const page = await queryNotes(makeQuery())
    setNotes(page.items)
    setTotal(page.total)
    setSelectedIds(new Set())
    if (selectedNoteId && !page.items.some((item) => item.id === selectedNoteId)) {
      setSelectedNoteId(null)
      setSelectedNote(null)
    }
  }, [makeQuery, selectedNoteId])

  const loadLibrary = useCallback(async () => {
    setStatus('booting')
    setError(null)
    try {
      const [initializedLibrary, snapshot, page] = await Promise.all([
        initializeLibrary(),
        getWorkspaceSnapshot(),
        queryNotes(makeQuery()),
      ])
      setLibrary(initializedLibrary)
      setCategories(snapshot.categories)
      setSystemCounts(snapshot.systemCounts)
      setNotes(page.items)
      setTotal(page.total)
      setStatus('ready')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法打开本机笔记库')
      setStatus('failed')
    }
  }, [makeQuery])

  useEffect(() => { void loadLibrary() }, [loadLibrary])
  useEffect(() => {
    if (status !== 'ready') return
    const timer = setTimeout(() => void refreshNotes().catch((cause) => setError(cause instanceof Error ? cause.message : '无法刷新笔记')), 180)
    return () => clearTimeout(timer)
  }, [view, categoryId, search, sortBy, sortDirection, refreshNotes, status])

  const select = useCallback(async (noteId: string) => {
    const token = ++selectionToken.current
    setSelectedNoteId(noteId)
    setIsLoadingNote(true)
    setError(null)
    try {
      const note = await getWorkspaceNote(noteId)
      if (selectionToken.current === token) setSelectedNote({ ...note, document: normalizeDocument(note.document) })
    } catch (cause) {
      if (selectionToken.current === token) setError(cause instanceof Error ? cause.message : '无法打开这篇笔记')
    } finally {
      if (selectionToken.current === token) setIsLoadingNote(false)
    }
  }, [])

  const loadMore = useCallback(async () => {
    if (isLoadingMore || notes.length >= total) return
    setIsLoadingMore(true)
    try {
      const page = await queryNotes(makeQuery(notes.length))
      setNotes((current) => [...current, ...page.items.filter((item) => !current.some((known) => known.id === item.id))])
      setTotal(page.total)
    } catch (cause) { setError(cause instanceof Error ? cause.message : '无法加载更多笔记') }
    finally { setIsLoadingMore(false) }
  }, [isLoadingMore, makeQuery, notes.length, total])

  const create = useCallback(async (targetCategoryId?: string | null) => {
    if (status !== 'ready' || isCreating) return null
    setIsCreating(true)
    try {
      const note = await createWorkspaceNote(targetCategoryId === undefined ? categoryId : targetCategoryId)
      const normalized = { ...note, document: normalizeDocument(note.document) }
      setNotes((current) => [toSummary(normalized), ...current])
      setTotal((value) => value + 1)
      setSelectedNoteId(normalized.id)
      setSelectedNote(normalized)
      await refreshWorkspace()
      return normalized
    } catch (cause) { setError(cause instanceof Error ? cause.message : '无法新建笔记'); return null }
    finally { setIsCreating(false) }
  }, [categoryId, isCreating, refreshWorkspace, status])

  const updateDraft = useCallback((noteId: string, title: string, document: VersionedDocument) => {
    setSelectedNote((current) => current?.id === noteId ? { ...current, title, document } : current)
    setNotes((current) => current.map((note) => note.id === noteId ? { ...note, title } : note))
  }, [])

  const applySaved = useCallback((saved: SaveNoteResult) => {
    setSelectedNote((current) => current?.id === saved.noteId ? { ...current, revision: saved.revision, updatedAt: saved.updatedAt, contentHash: saved.contentHash } : current)
    setNotes((current) => current.map((note) => note.id === saved.noteId ? { ...note, revision: saved.revision, updatedAt: saved.updatedAt } : note))
  }, [])

  const applyRecoveredDraft = useCallback((databaseNote: NoteDto, draft: RecoveryRecordDto) => {
    let document:VersionedDocument
    try { document=normalizeDocument(draft.documentJson as VersionedDocument) }
    catch { document=parseMarkdownDocument(draft.markdownSnapshot).document }
    const restored = { ...databaseNote, title: draft.title, document }
    setSelectedNoteId(restored.id); setSelectedNote(restored); setNotes((current) => current.map((note) => note.id === restored.id ? toSummary(restored) : note))
  }, [])

  const toggleSelected = useCallback((id: string) => setSelectedIds((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next }), [])
  const selectAll = useCallback(() => setSelectedIds((current) => current.size === notes.length ? new Set() : new Set(notes.map((note) => note.id))), [notes])
  const performBatch = useCallback(async (action: BatchAction, ids = [...selectedIds]) => {
    if (!ids.length) return
    await batchNotes(ids, action)
    if (ids.includes(selectedNoteId ?? '') && ['archive', 'trash', 'deletePermanently'].includes(action)) { setSelectedNote(null); setSelectedNoteId(null) }
    await Promise.all([refreshNotes(), refreshWorkspace()])
  }, [refreshNotes, refreshWorkspace, selectedIds, selectedNoteId])
  const clearTrash = useCallback(async () => { await emptyTrash(); setSelectedNote(null); setSelectedNoteId(null); await Promise.all([refreshNotes(),refreshWorkspace()]) }, [refreshNotes,refreshWorkspace])
  const moveSelected = useCallback(async (target: string, requestedIds?: string[]) => { const ids=requestedIds??[...selectedIds]; if(!ids.length)return; await moveNotes(ids,target); await Promise.all([refreshNotes(),refreshWorkspace()]) }, [refreshNotes,refreshWorkspace,selectedIds])
  const updateMood = useCallback(async (mood:string|null) => { if(!selectedNoteId)return; await setNoteMood(selectedNoteId,mood); setSelectedNote(current=>current?{...current,mood}:current); setNotes(current=>current.map(note=>note.id===selectedNoteId?{...note,mood}:note)) }, [selectedNoteId])

  return {
    status, library, notes, categories, systemCounts, total, selectedNote, selectedNoteId, selectedIds,
    view, categoryId, search, sortBy, sortDirection, error, isCreating, isLoadingNote, isLoadingMore,
    create, select, loadMore, updateDraft, applySaved, applyRecoveredDraft, toggleSelected, selectAll, performBatch, clearTrash, moveSelected, updateMood,
    clearSelection: () => setSelectedIds(new Set()),
    setView: (next: NoteView) => { setViewState(next); setCategoryIdState(null) },
    setCategory: (id: string | null) => { setCategoryIdState(id); setViewState('all') },
    setSearch: setSearchState, setSortBy: setSortByState, setSortDirection: setSortDirectionState,
    addCategory: async (name: string, parentId?: string | null) => { const created=await createCategory(name,parentId); await refreshWorkspace(); return created },
    editCategory: async (id:string,name:string) => { await renameCategory(id,name); await refreshWorkspace() },
    editCategoryAppearance: async (id:string,iconName:string,color:string) => { await updateCategoryAppearance(id,iconName,color); await refreshWorkspace() },
    removeCategory: async (id:string) => { await deleteCategory(id); await Promise.all([refreshWorkspace(),refreshNotes()]) },
    importContent: async (content:string,format:'markdown'|'html'|'json') => { await importNotes(content,format,categoryId); await Promise.all([refreshNotes(),refreshWorkspace()]) },
    updateLibrary: setLibrary, retry: loadLibrary, refresh: refreshNotes,
  }
}
