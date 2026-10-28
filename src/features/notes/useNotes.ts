import { readWorkspaceMemory, writeWorkspaceMemory } from '../../shared/workspaceMemory'
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
  reorderCategory,
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
import { BUILT_IN_NOTE_ID } from '../../shared/builtin'

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
    isPinned: note.isPinned,
    isArchived: note.isArchived,
    deletedAt: note.deletedAt,
    mood: note.mood,
    updatedAt: note.updatedAt,
  }
}

export function useNotes() {
  const [remembered] = useState(() => readWorkspaceMemory('notes', {view:'all' as NoteView,categoryId:null as string|null,selectedNoteId:null as string|null}))
  const [status, setStatus] = useState<NotesStatus>('booting')
  const [library, setLibrary] = useState<LibraryDto | null>(null)
  const acceptLibrary = useCallback((incoming: LibraryDto) => {
    setLibrary(current => current?.id === incoming.id && current.settingsRevision > incoming.settingsRevision ? current : incoming)
  }, [])
  const [notes, setNotes] = useState<NoteSummaryDto[]>([])
  const [categories, setCategories] = useState<CategoryDto[]>([])
  const [systemCounts,setSystemCounts]=useState<SystemCountsDto>({all:0,favorites:0,archived:0,trash:0,jottings:0,tasks:0,galleries:0})
  const [total, setTotal] = useState(0)
  const [selectedNote, setSelectedNote] = useState<NoteDto | null>(null)
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [view, setViewState] = useState<NoteView>(remembered.view)
  const [categoryId, setCategoryIdState] = useState<string | null>(remembered.categoryId)
  const [search, setSearchState] = useState('')
  const [sortBy, setSortByState] = useState<NoteSort>('updatedAt')
  const [sortDirection, setSortDirectionState] = useState<'asc' | 'desc'>('desc')
  const [error, setError] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [isLoadingNote, setIsLoadingNote] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [isLoadingList, setIsLoadingList] = useState(false)
  const selectionToken = useRef(0)
  const listRequestToken = useRef(0)
  const libraryReady = useRef(false)
  const selectedNoteIdRef = useRef<string | null>(null)
  const selectedNoteRef = useRef<NoteDto | null>(null)
  const resolvedSelectionRef = useRef<{ id:string; note:NoteDto } | null>(null)
  const queryRef = useRef({ view, categoryId, search, sortBy, sortDirection })
  queryRef.current = { view, categoryId, search, sortBy, sortDirection }
  selectedNoteIdRef.current = selectedNoteId
  selectedNoteRef.current = selectedNote

  useEffect(() => { if (status === 'ready' && !isLoadingNote) writeWorkspaceMemory('notes', {view,categoryId,selectedNoteId}) }, [status,view,categoryId,selectedNoteId,isLoadingNote])

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
    const token = ++listRequestToken.current
    setIsLoadingList(true)
    try {
      const page = await queryNotes(makeQuery())
      if (listRequestToken.current !== token) return
      setNotes(page.items)
      setTotal(page.total)
      setSelectedIds(new Set())
      const currentSelectedId = selectedNoteIdRef.current
      const current = selectedNoteRef.current
      const query = queryRef.current
      const matchesView = current && (query.view === 'trash' ? !!current.deletedAt : !current.deletedAt && (query.view === 'archived' ? current.isArchived : !current.isArchived && (query.view !== 'favorites' || current.isFavorite)))
      const canKeepSelection = page.total > page.items.length && matchesView && (!query.categoryId || current?.categoryId === query.categoryId) && (!query.search || `${current?.title} ${current?.plainText}`.toLowerCase().includes(query.search.toLowerCase()))
      if (currentSelectedId && !page.items.some((item) => item.id === currentSelectedId) && !canKeepSelection) {
        selectionToken.current += 1
        selectedNoteIdRef.current = null
        selectedNoteRef.current = null
        resolvedSelectionRef.current = null
        setSelectedNoteId(null)
        setSelectedNote(null)
      }
    } finally {
      if (listRequestToken.current === token) setIsLoadingList(false)
    }
  }, [makeQuery])

  const loadLibrary = useCallback(async () => {
    libraryReady.current = false
    setStatus('booting')
    setError(null)
    try {
      const [initializedLibrary, snapshot, page] = await Promise.all([
        initializeLibrary().then(value => { acceptLibrary(value); return value }),
        getWorkspaceSnapshot(),
        queryNotes(makeQuery()),
      ])
      if (remembered.categoryId && !snapshot.categories.some(category => category.id === remembered.categoryId)) {
        queryRef.current.categoryId = null
        setCategoryIdState(null)
        const fallbackPage = await queryNotes(makeQuery())
        page.items = fallbackPage.items; page.total = fallbackPage.total
      }
      if (remembered.selectedNoteId) {
        try {
          const restored = await getWorkspaceNote(remembered.selectedNoteId)
          const query = queryRef.current
          const inView = query.view === 'trash' ? !!restored.deletedAt : !restored.deletedAt && (query.view === 'archived' ? restored.isArchived : !restored.isArchived && (query.view !== 'favorites' || restored.isFavorite))
          if (inView && (!query.categoryId || restored.categoryId === query.categoryId)) {
            const normalized = {...restored,document:normalizeDocument(restored.document)}
            selectedNoteIdRef.current = normalized.id; selectedNoteRef.current = normalized
            resolvedSelectionRef.current = {id:normalized.id,note:normalized}
            setSelectedNoteId(normalized.id); setSelectedNote(normalized)
          }
        } catch { /* A removed note should not prevent opening the workspace. */ }
      }
      acceptLibrary(initializedLibrary)
      setCategories(snapshot.categories)
      setSystemCounts(snapshot.systemCounts)
      setNotes(page.items)
      setTotal(page.total)
      libraryReady.current = true
      setStatus('ready')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法打开本机笔记库')
      setStatus('failed')
    }
  }, [makeQuery, acceptLibrary])

  useEffect(() => { void loadLibrary() }, [loadLibrary])
  useEffect(() => {
    if (!libraryReady.current) return
    const timer = setTimeout(() => void refreshNotes().catch((cause) => setError(cause instanceof Error ? cause.message : '无法刷新笔记')), search ? 180 : 0)
    return () => clearTimeout(timer)
  }, [view, categoryId, search, sortBy, sortDirection, refreshNotes])

  const select = useCallback(async (noteId: string) => {
    const token = ++selectionToken.current
    const fallback = resolvedSelectionRef.current
    selectedNoteIdRef.current = noteId
    selectedNoteRef.current = null
    setSelectedNoteId(noteId)
    setSelectedNote(null)
    setIsLoadingNote(true)
    setError(null)
    try {
      const note = await getWorkspaceNote(noteId)
      if (selectionToken.current === token) {
        const normalized = { ...note, document: normalizeDocument(note.document) }
        selectedNoteIdRef.current = normalized.id
        selectedNoteRef.current = normalized
        resolvedSelectionRef.current = { id:normalized.id, note:normalized }
        setSelectedNoteId(normalized.id)
        setSelectedNote(normalized)
      }
    } catch (cause) {
      if (selectionToken.current === token) {
        selectedNoteIdRef.current = fallback?.id ?? null
        selectedNoteRef.current = fallback?.note ?? null
        setSelectedNoteId(fallback?.id ?? null)
        setSelectedNote(fallback?.note ?? null)
        setError(cause instanceof Error ? cause.message : '无法打开这篇笔记')
      }
    } finally {
      if (selectionToken.current === token) setIsLoadingNote(false)
    }
  }, [])

  const loadMore = useCallback(async () => {
    if (isLoadingMore || notes.length >= total) return
    setIsLoadingMore(true)
    try {
      const page = await queryNotes(makeQuery(notes.length))
      setNotes((current) => { const known = new Set(current.map(note => note.id)); return [...current, ...page.items.filter(item => !known.has(item.id))] })
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
      selectedNoteIdRef.current = normalized.id
      selectedNoteRef.current = normalized
      resolvedSelectionRef.current = { id:normalized.id, note:normalized }
      setSelectedNoteId(normalized.id)
      setSelectedNote(normalized)
      await refreshWorkspace()
      return normalized
    } catch (cause) { setError(cause instanceof Error ? cause.message : '无法新建笔记'); return null }
    finally { setIsCreating(false) }
  }, [categoryId, isCreating, refreshWorkspace, status])

  const updateDraft = useCallback((noteId: string, title: string, document: VersionedDocument) => {
    setSelectedNote((current) => {
      if (current?.id !== noteId) return current
      const next = { ...current, title, document }
      selectedNoteRef.current = next
      resolvedSelectionRef.current = { id:noteId, note:next }
      return next
    })
    setNotes((current) => current.map((note) => note.id === noteId ? { ...note, title } : note))
  }, [])

  const applySaved = useCallback((saved: SaveNoteResult) => {
    setSelectedNote((current) => {
      if (current?.id !== saved.noteId) return current
      const next = { ...current, revision: saved.revision, updatedAt: saved.updatedAt, contentHash: saved.contentHash }
      selectedNoteRef.current = next
      resolvedSelectionRef.current = { id:saved.noteId, note:next }
      return next
    })
    setNotes((current) => current.map((note) => note.id === saved.noteId ? { ...note, revision: saved.revision, updatedAt: saved.updatedAt } : note))
  }, [])

  const applyRecoveredDraft = useCallback((databaseNote: NoteDto, draft: RecoveryRecordDto) => {
    let document:VersionedDocument
    try { document=normalizeDocument(draft.documentJson as VersionedDocument) }
    catch { document=parseMarkdownDocument(draft.markdownSnapshot).document }
    const restored = { ...databaseNote, title: draft.title, document }
    selectedNoteIdRef.current=restored.id; selectedNoteRef.current=restored; resolvedSelectionRef.current={id:restored.id,note:restored}
    setSelectedNoteId(restored.id); setSelectedNote(restored); setNotes((current) => current.map((note) => note.id === restored.id ? toSummary(restored) : note))
  }, [])

  const refreshExternal = useCallback(async (noteId: string, revision: number, isClean: () => boolean) => {
    // Updating a list must not clear the selected editor or its unsaved draft.
    const token = ++listRequestToken.current
    const page = await queryNotes(makeQuery())
    if (token === listRequestToken.current) {
      setNotes(page.items); setTotal(page.total)
    }
    await refreshWorkspace()
    const current = selectedNoteRef.current
    if (current?.id !== noteId || current.revision >= revision) return 'unchanged' as const
    if (!isClean()) return 'conflict' as const
    const selection = selectionToken.current
    const note = await getWorkspaceNote(noteId)
    if (selection !== selectionToken.current || selectedNoteIdRef.current !== noteId) return 'unchanged' as const
    // Typing may have started while the backend read was in flight.
    if (!isClean()) return 'conflict' as const
    const normalized = { ...note, document: normalizeDocument(note.document) }
    selectedNoteRef.current = normalized
    resolvedSelectionRef.current = { id: noteId, note: normalized }
    setSelectedNote(normalized)
    return 'reloaded' as const
  }, [makeQuery, refreshWorkspace])

  const toggleSelected = useCallback((id: string) => setSelectedIds((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next }), [])
  const selectAll = useCallback(() => setSelectedIds((current) => current.size === notes.length ? new Set() : new Set(notes.map((note) => note.id))), [notes])
  const performBatch = useCallback(async (action: BatchAction, ids = [...selectedIds]) => {
    const allowed=ids.filter(id=>id!==BUILT_IN_NOTE_ID||!['archive','trash','deletePermanently'].includes(action))
    if (!allowed.length) return
    await batchNotes(allowed, action)
    if (['pin','unpin'].includes(action) && allowed.includes(selectedNoteIdRef.current ?? '')) {
      const current = selectedNoteRef.current
      if (current) {
        const next = {...current,isPinned:action === 'pin'}
        selectedNoteRef.current = next; resolvedSelectionRef.current = {id:next.id,note:next}; setSelectedNote(next)
      }
    }
    if (allowed.includes(selectedNoteId ?? '') && ['archive', 'trash', 'deletePermanently'].includes(action)) { selectionToken.current+=1; selectedNoteIdRef.current=null; selectedNoteRef.current=null; resolvedSelectionRef.current=null; setSelectedNote(null); setSelectedNoteId(null) }
    await Promise.all([refreshNotes(), refreshWorkspace()])
  }, [refreshNotes, refreshWorkspace, selectedIds, selectedNoteId])
  const clearTrash = useCallback(async () => { await emptyTrash(); selectionToken.current+=1; selectedNoteIdRef.current=null; selectedNoteRef.current=null; resolvedSelectionRef.current=null; setSelectedNote(null); setSelectedNoteId(null); await Promise.all([refreshNotes(),refreshWorkspace()]) }, [refreshNotes,refreshWorkspace])
  const moveSelected = useCallback(async (target: string, requestedIds?: string[]) => { const ids=(requestedIds??[...selectedIds]).filter(id=>id!==BUILT_IN_NOTE_ID); if(!ids.length)return; await moveNotes(ids,target); await Promise.all([refreshNotes(),refreshWorkspace()]) }, [refreshNotes,refreshWorkspace,selectedIds])
  const updateMood = useCallback(async (mood:string|null) => { if(!selectedNoteId)return; await setNoteMood(selectedNoteId,mood); setSelectedNote(current=>{if(!current)return current;const next={...current,mood};selectedNoteRef.current=next;resolvedSelectionRef.current={id:next.id,note:next};return next}); setNotes(current=>current.map(note=>note.id===selectedNoteId?{...note,mood}:note)) }, [selectedNoteId])

  return {
    status, library, notes, categories, systemCounts, total, selectedNote, selectedNoteId, selectedIds,
    view, categoryId, search, sortBy, sortDirection, error, isCreating, isLoadingNote, isLoadingMore, isLoadingList,
    create, select, loadMore, updateDraft, applySaved, applyRecoveredDraft, refreshExternal, toggleSelected, selectAll, performBatch, clearTrash, moveSelected, updateMood,
    clearSelection: () => setSelectedIds(new Set()),
    setView: (next: NoteView) => {
      if (view === next && categoryId === null) return
      setIsLoadingList(true); setViewState(next); setCategoryIdState(null)
    },
    setCategory: (id: string | null) => {
      if (categoryId === id && view === 'all') return
      setIsLoadingList(true); setCategoryIdState(id); setViewState('all')
    },
    setSearch: (value:string) => { if (value !== search) setIsLoadingList(true); setSearchState(value) },
    setSortBy: (value:NoteSort) => { if (value !== sortBy) setIsLoadingList(true); setSortByState(value) },
    setSortDirection: (value:'asc'|'desc') => { if (value !== sortDirection) setIsLoadingList(true); setSortDirectionState(value) },
    addCategory: async (name: string, parentId?: string | null) => { const created=await createCategory(name,parentId); await refreshWorkspace(); return created },
    editCategory: async (id:string,name:string) => { await renameCategory(id,name); await refreshWorkspace() },
    editCategoryAppearance: async (id:string,iconName:string,color:string) => { await updateCategoryAppearance(id,iconName,color); await refreshWorkspace() },
    moveCategory: async (id:string,beforeId?:string|null) => { await reorderCategory(id,beforeId); await refreshWorkspace() },
    removeCategory: async (id:string) => { await deleteCategory(id); await Promise.all([refreshWorkspace(),refreshNotes()]) },
    importContent: async (content:string,format:'markdown'|'html'|'json') => { await importNotes(content,format,categoryId); await Promise.all([refreshNotes(),refreshWorkspace()]) },
    updateLibrary: acceptLibrary, retry: loadLibrary, refresh: refreshNotes,
  }
}
