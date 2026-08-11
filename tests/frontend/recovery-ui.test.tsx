import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { App } from '../../src/app/App'
import type { LibraryDto, NoteDto, RecoveryCandidateDto, RecoveryRecordDto } from '../../src/shared/tauri/contracts'
import {
  getNote,
  initializeLibrary,
  listNotes,
  listRecoveryCandidates,
  resolveRecovery,
  saveNote,
} from '../../src/shared/tauri/commands'

const { getCurrentWindow } = vi.hoisted(() => ({ getCurrentWindow: vi.fn() }))

vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow }))

vi.mock('../../src/shared/tauri/commands', () => ({
  createNote: vi.fn(),
  getNote: vi.fn(),
  initializeLibrary: vi.fn(),
  listNotes: vi.fn(),
  listRecoveryCandidates: vi.fn(),
  resolveRecovery: vi.fn(),
  saveNote: vi.fn(),
}))

const library: LibraryDto = {
  id: '8bbf0dc9-c8b4-43e6-abcd-e206f58647df',
  name: 'CoolNote',
  rootPath: 'C:\\Users\\tester\\Documents\\CoolNote',
  formatVersion: 1,
  createdAt: '2026-08-11T10:00:00Z',
  lastOpenedAt: '2026-08-11T10:00:00Z',
  lastCleanShutdownAt: null,
  settingsJson: '{}',
}

const databaseNote: NoteDto = {
  id: '11111111-1111-4111-8111-111111111111',
  categoryId: '33333333-3333-4333-8333-333333333333',
  title: '数据库版本',
  document: { schemaVersion: 1, type: 'doc', content: [] },
  plainText: '',
  contentHash: 'database-hash',
  revision: 7,
  createdAt: '2026-08-11T10:00:00Z',
  updatedAt: '2026-08-11T10:00:00Z',
}

const editedNote: NoteDto = {
  ...databaseNote,
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  title: '正在编辑的笔记',
  revision: 3,
}

const recoveredDatabaseNote: NoteDto = {
  ...databaseNote,
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  title: '数据库中的 B',
  revision: 9,
}

function draftFixture(noteId = databaseNote.id): RecoveryRecordDto {
  return {
    libraryId: library.id,
    noteId,
    baseRevision: 7,
    clientTransactionId: '22222222-2222-4222-8222-222222222222',
    title: '未保存草稿',
    documentJson: { schemaVersion: 1, type: 'doc', content: [] },
    contentHash: 'draft-hash',
    createdAt: '2026-08-11T10:00:00Z',
  }
}

function mockRecoveryCandidate(candidate: RecoveryCandidateDto) {
  vi.mocked(listRecoveryCandidates).mockResolvedValue([candidate])
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('recovery UI', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
    vi.mocked(initializeLibrary).mockResolvedValue(library)
    vi.mocked(listNotes).mockResolvedValue({ items: [], total: 0 })
    vi.mocked(listRecoveryCandidates).mockResolvedValue([])
    vi.mocked(getNote).mockResolvedValue(databaseNote)
    vi.mocked(resolveRecovery).mockResolvedValue(draftFixture())
    vi.mocked(saveNote).mockResolvedValue({
      noteId: databaseNote.id,
      revision: 8,
      updatedAt: '2026-08-11T10:00:00Z',
      contentHash: 'saved-hash',
    })
  })

  it('offers a safe draft', async () => {
    const user = userEvent.setup()
    mockRecoveryCandidate({ decision: 'offerDraft', databaseRevision: 7, draft: draftFixture() })
    render(<App />)
    await user.click(await screen.findByRole('button', { name: '恢复草稿' }))
    expect(screen.getByText('已恢复草稿')).toBeInTheDocument()
  })

  it('does not auto-overwrite a newer database revision', async () => {
    mockRecoveryCandidate({ decision: 'conflict', databaseRevision: 9, draft: draftFixture() })
    render(<App />)
    expect(await screen.findByRole('dialog', { name: '发现恢复草稿冲突' })).toBeInTheDocument()
  })

  it('flushes the current note before applying a recovered draft for another note', async () => {
    const user = userEvent.setup()
    const currentSave = deferred<{ noteId: string; revision: number; updatedAt: string; contentHash: string }>()
    const candidates = deferred<RecoveryCandidateDto[]>()
    const draft = draftFixture(recoveredDatabaseNote.id)
    vi.mocked(listNotes).mockResolvedValue({
      items: [{ id: editedNote.id, title: editedNote.title, excerpt: '', revision: 3, updatedAt: editedNote.updatedAt }],
      total: 1,
    })
    vi.mocked(listRecoveryCandidates).mockReturnValue(candidates.promise)
    vi.mocked(getNote).mockImplementation((noteId) =>
      Promise.resolve(noteId === editedNote.id ? editedNote : recoveredDatabaseNote),
    )
    vi.mocked(resolveRecovery).mockResolvedValue(draft)
    vi.mocked(saveNote)
      .mockReturnValueOnce(currentSave.promise)
      .mockResolvedValue({
        noteId: recoveredDatabaseNote.id,
        revision: 10,
        updatedAt: '2026-08-11T10:00:00Z',
        contentHash: 'recovered-hash',
      })

    render(<App />)
    await user.click(await screen.findByRole('option', { name: editedNote.title }))
    await user.type(await screen.findByRole('textbox', { name: '笔记标题' }), ' 已修改')

    await act(async () => candidates.resolve([{ decision: 'offerDraft', databaseRevision: 9, draft }]))
    await user.click(await screen.findByRole('button', { name: '恢复草稿' }))

    expect(saveNote).toHaveBeenCalledWith(
      expect.objectContaining({ noteId: editedNote.id, title: '正在编辑的笔记 已修改' }),
    )
    expect(screen.getByRole('dialog', { name: '发现未保存草稿' })).toBeInTheDocument()

    await act(async () => currentSave.resolve({
      noteId: editedNote.id,
      revision: 4,
      updatedAt: '2026-08-11T10:00:00Z',
      contentHash: 'edited-hash',
    }))

    expect(await screen.findByRole('textbox', { name: '笔记标题' })).toHaveValue('未保存草稿')
    await waitFor(() => expect(saveNote).toHaveBeenLastCalledWith(
      expect.objectContaining({ noteId: recoveredDatabaseNote.id, baseRevision: 9 }),
    ))
  })

  it('does not let an older note load overwrite a restored draft', async () => {
    const user = userEvent.setup()
    const staleLoad = deferred<NoteDto>()
    const draft = draftFixture(recoveredDatabaseNote.id)
    vi.mocked(listNotes).mockResolvedValue({
      items: [{ id: editedNote.id, title: editedNote.title, excerpt: '', revision: 3, updatedAt: editedNote.updatedAt }],
      total: 1,
    })
    mockRecoveryCandidate({ decision: 'offerDraft', databaseRevision: 9, draft })
    vi.mocked(getNote).mockImplementation((noteId) =>
      noteId === editedNote.id ? staleLoad.promise : Promise.resolve(recoveredDatabaseNote),
    )
    vi.mocked(resolveRecovery).mockResolvedValue(draft)

    render(<App />)
    await user.click(await screen.findByRole('option', { name: editedNote.title }))
    await user.click(await screen.findByRole('button', { name: '恢复草稿' }))
    expect(await screen.findByRole('textbox', { name: '笔记标题' })).toHaveValue('未保存草稿')

    await act(async () => staleLoad.resolve(editedNote))

    expect(screen.getByRole('textbox', { name: '笔记标题' })).toHaveValue('未保存草稿')
  })

  it('refuses Tauri close when the backend cannot confirm recovery data', async () => {
    const user = userEvent.setup()
    let closeRequested!: (event: { preventDefault: () => void }) => Promise<void>
    const close = vi.fn()
    const onCloseRequested = vi.fn().mockImplementation(async (handler) => {
      closeRequested = handler
      return vi.fn()
    })
    getCurrentWindow.mockReturnValue({ onCloseRequested, close })
    ;(window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {}
    vi.mocked(listNotes).mockResolvedValue({
      items: [{ id: editedNote.id, title: editedNote.title, excerpt: '', revision: 3, updatedAt: editedNote.updatedAt }],
      total: 1,
    })
    vi.mocked(getNote).mockResolvedValue(editedNote)
    vi.mocked(saveNote).mockRejectedValue({ code: 'recovery_write_failed', recoverySafe: false })

    render(<App />)
    await user.click(await screen.findByRole('option', { name: editedNote.title }))
    await user.type(await screen.findByRole('textbox', { name: '笔记标题' }), ' x')
    await waitFor(() => expect(onCloseRequested).toHaveBeenCalledOnce())

    const preventDefault = vi.fn()
    await act(async () => closeRequested({ preventDefault }))

    expect(preventDefault).toHaveBeenCalledOnce()
    expect(close).not.toHaveBeenCalled()
    expect(await screen.findByRole('alert')).toHaveTextContent('当前内容无法安全保存，已取消关闭。')
  })

  it('reports close-listener setup errors', async () => {
    const onCloseRequested = vi.fn().mockRejectedValue(new Error('关闭监听不可用'))
    getCurrentWindow.mockReturnValue({ onCloseRequested, close: vi.fn() })
    ;(window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {}

    render(<App />)

    expect(await screen.findByRole('alert')).toHaveTextContent('关闭监听不可用')
  })
})
