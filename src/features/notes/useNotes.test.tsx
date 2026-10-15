// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const commands = vi.hoisted(() => ({
  batchNotes: vi.fn(),
  createCategory: vi.fn(),
  createWorkspaceNote: vi.fn(),
  deleteCategory: vi.fn(),
  emptyTrash: vi.fn(),
  getWorkspaceNote: vi.fn(),
  getWorkspaceSnapshot: vi.fn(),
  importNotes: vi.fn(),
  initializeLibrary: vi.fn(),
  moveNotes: vi.fn(),
  queryNotes: vi.fn(),
  reorderCategory: vi.fn(),
  renameCategory: vi.fn(),
  setNoteMood: vi.fn(),
  updateCategoryAppearance: vi.fn(),
}))

vi.mock('../../shared/tauri/commands', () => commands)

import { useNotes } from './useNotes'

const document = { schemaVersion: 1, type: 'doc', content: [{ type: 'paragraph' }] }
const summary = {
  id: 'note-1', title: '第一篇', excerpt: '', revision: 1, categoryId: null,
  isFavorite: false, isArchived: false, deletedAt: null, mood: null,
  updatedAt: '2026-08-17T08:00:00Z',
}
const note = {
  ...summary, plainText: '', document, contentHash: 'hash', createdAt: summary.updatedAt,
}

describe('useNotes list loading lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    commands.initializeLibrary.mockResolvedValue({ id: 'library', name: 'CoolNote' })
    commands.getWorkspaceSnapshot.mockResolvedValue({
      categories: [],
      systemCounts: { all: 1, favorites: 0, archived: 0, trash: 0, jottings: 0, tasks: 0, galleries: 0 },
    })
    commands.queryNotes.mockResolvedValue({ items: [summary], total: 1 })
    commands.getWorkspaceNote.mockResolvedValue(note)
  })

  it('does not issue a duplicate list query immediately after boot', async () => {
    const { result } = renderHook(() => useNotes())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 260)) })
    expect(commands.queryNotes).toHaveBeenCalledTimes(1)
    expect(result.current.isLoadingList).toBe(false)
  })

  it('does not refresh the list when selecting a note', async () => {
    const { result } = renderHook(() => useNotes())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 260)) })
    commands.queryNotes.mockClear()

    await act(async () => { await result.current.select('note-1') })
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 260)) })

    expect(result.current.selectedNoteId).toBe('note-1')
    expect(commands.queryNotes).not.toHaveBeenCalled()
    expect(result.current.isLoadingList).toBe(false)
  })

  it('removes the previous document while another note is loading', async () => {
    const { result } = renderHook(() => useNotes())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    await act(async () => { await result.current.select('note-1') })
    expect(result.current.selectedNote?.id).toBe('note-1')

    let resolveSecond!: (value:unknown) => void
    commands.getWorkspaceNote.mockImplementationOnce(() => new Promise(resolve => { resolveSecond = resolve }))
    let pending!: Promise<void>
    act(() => { pending = result.current.select('note-2') })

    expect(result.current.selectedNoteId).toBe('note-2')
    expect(result.current.selectedNote).toBeNull()
    expect(result.current.isLoadingNote).toBe(true)

    await act(async () => {
      resolveSecond({ ...note, id:'note-2', title:'第二篇' })
      await pending
    })
    expect(result.current.selectedNote?.id).toBe('note-2')
  })

  it('restores a consistent previous selection when loading fails', async () => {
    const { result } = renderHook(() => useNotes())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    await act(async () => { await result.current.select('note-1') })
    commands.getWorkspaceNote.mockRejectedValueOnce(new Error('读取失败'))

    await act(async () => { await result.current.select('note-2') })

    expect(result.current.selectedNoteId).toBe('note-1')
    expect(result.current.selectedNote?.id).toBe('note-1')
    expect(result.current.isLoadingNote).toBe(false)
    expect(result.current.error).toBe('读取失败')
  })

  it('only commits the latest note when selections resolve out of order', async () => {
    const { result } = renderHook(() => useNotes())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    let resolveSecond!: (value:unknown) => void
    let resolveThird!: (value:unknown) => void
    commands.getWorkspaceNote
      .mockImplementationOnce(() => new Promise(resolve => { resolveSecond = resolve }))
      .mockImplementationOnce(() => new Promise(resolve => { resolveThird = resolve }))

    let second!: Promise<void>
    let third!: Promise<void>
    act(() => { second = result.current.select('note-2') })
    act(() => { third = result.current.select('note-3') })
    await act(async () => {
      resolveSecond({ ...note, id:'note-2', title:'第二篇' })
      await second
    })
    expect(result.current.selectedNote).toBeNull()
    await act(async () => {
      resolveThird({ ...note, id:'note-3', title:'第三篇' })
      await third
    })

    expect(result.current.selectedNoteId).toBe('note-3')
    expect(result.current.selectedNote?.id).toBe('note-3')
  })

  it('ignores a stale list response after a newer view has loaded', async () => {
    const { result } = renderHook(() => useNotes())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 260)) })

    let resolveFavorites!: (value:unknown) => void
    let resolveArchived!: (value:unknown) => void
    commands.queryNotes.mockImplementation((query:{view:string}) => new Promise(resolve => {
      if (query.view === 'favorites') resolveFavorites = resolve
      if (query.view === 'archived') resolveArchived = resolve
    }))

    act(() => result.current.setView('favorites'))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 210)) })
    act(() => result.current.setView('archived'))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 210)) })

    const archived = { ...summary, id:'archived-note', title:'归档笔记', isArchived:true }
    await act(async () => resolveArchived({ items:[archived], total:1 }))
    await waitFor(() => expect(result.current.notes[0]?.id).toBe('archived-note'))
    await act(async () => resolveFavorites({ items:[{ ...summary, id:'favorite-note' }], total:1 }))

    expect(result.current.notes[0]?.id).toBe('archived-note')
    expect(result.current.isLoadingList).toBe(false)
  })
  it('restores the last category and note after remounting', async () => {
    commands.getWorkspaceSnapshot.mockResolvedValue({ categories:[{id:'category-1'}],systemCounts:{} })
    commands.getWorkspaceNote.mockResolvedValue({...note,categoryId:'category-1'})
    localStorage.setItem('coolnote.workspace.notes',JSON.stringify({view:'all',categoryId:'category-1',selectedNoteId:'note-1'}))
    const first = renderHook(() => useNotes())
    await waitFor(() => expect(first.result.current.status).toBe('ready'))
    expect(first.result.current.categoryId).toBe('category-1')
    expect(first.result.current.selectedNoteId).toBe('note-1')
    expect(commands.queryNotes).toHaveBeenCalledWith(expect.objectContaining({categoryId:'category-1'}))
    first.unmount()
    const second = renderHook(() => useNotes())
    await waitFor(() => expect(second.result.current.selectedNoteId).toBe('note-1'))
    second.unmount()
  })

  it('falls back safely when the remembered category and note have been removed', async () => {
    localStorage.setItem('coolnote.workspace.notes',JSON.stringify({view:'all',categoryId:'removed',selectedNoteId:'missing'}))
    commands.getWorkspaceNote.mockRejectedValue(new Error('not found'))
    const {result} = renderHook(() => useNotes())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.categoryId).toBeNull()
    expect(result.current.selectedNote).toBeNull()
    expect(result.current.notes).toHaveLength(1)
  })

  it('keeps a restored note beyond the first list page selected when refreshing', async () => {
    localStorage.setItem('coolnote.workspace.notes',JSON.stringify({view:'all',categoryId:null,selectedNoteId:'note-2'}))
    commands.getWorkspaceNote.mockResolvedValue({...note,id:'note-2'})
    commands.queryNotes.mockResolvedValue({items:[summary],total:81})
    const {result} = renderHook(() => useNotes())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    await act(async () => { await result.current.refresh() })
    expect(result.current.selectedNoteId).toBe('note-2')
  })

})
