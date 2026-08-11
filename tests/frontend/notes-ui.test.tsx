import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { App } from '../../src/app/App'
import type { LibraryDto, NoteDto } from '../../src/shared/tauri/contracts'
import {
  createNote,
  getNote,
  initializeLibrary,
  listNotes,
  listRecoveryCandidates,
} from '../../src/shared/tauri/commands'

vi.mock('../../src/shared/tauri/commands', () => ({
  createNote: vi.fn(),
  getNote: vi.fn(),
  initializeLibrary: vi.fn(),
  listNotes: vi.fn(),
  listRecoveryCandidates: vi.fn().mockResolvedValue([]),
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

const createdNote: NoteDto = {
  id: '1222cd74-a222-4b94-bb27-a39042ed4473',
  categoryId: '0261e46a-303b-456e-b5d4-0127de1f7615',
  title: '',
  document: {
    schemaVersion: 1,
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        attrs: { blockId: '94bcc0f3-7445-4f1e-acb4-ecb1f0ac7c90' },
        content: [],
      },
    ],
  },
  plainText: '',
  contentHash: 'empty-document-hash',
  revision: 1,
  createdAt: '2026-08-11T10:01:00Z',
  updatedAt: '2026-08-11T10:01:00Z',
}

function noteFixture(id: string, title: string): NoteDto {
  return {
    ...createdNote,
    id,
    title,
    updatedAt: title === '第二篇' ? '2026-08-11T10:03:00Z' : '2026-08-11T10:02:00Z',
  }
}

function summaryFixture(note: NoteDto) {
  return {
    id: note.id,
    title: note.title,
    excerpt: note.plainText,
    revision: note.revision,
    updatedAt: note.updatedAt,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('real note startup and creation', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(initializeLibrary).mockResolvedValue(library)
    vi.mocked(listNotes).mockResolvedValue({ items: [], total: 0 })
    vi.mocked(createNote).mockResolvedValue(createdNote)
    vi.mocked(getNote).mockResolvedValue(createdNote)
    vi.mocked(listRecoveryCandidates).mockResolvedValue([])
  })

  it('shows an empty library from real command data without demo notes', async () => {
    render(<App />)

    expect(await screen.findByText('还没有笔记')).toBeInTheDocument()
    expect(initializeLibrary).toHaveBeenCalledOnce()
    expect(listNotes).toHaveBeenCalledWith(0, 50)
    expect(screen.queryByText('MiraAgent')).not.toBeInTheDocument()
  })

  it('creates, selects, and focuses a real note', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: '新建' }))

    const title = await screen.findByRole('textbox', { name: '笔记标题' })
    await waitFor(() => expect(title).toHaveFocus())
    expect(createNote).toHaveBeenCalledOnce()
    expect(screen.getByRole('option', { name: '无标题笔记' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('does not claim a note is saved before autosave is implemented', async () => {
    const existing = noteFixture(
      '11111111-1111-4111-8111-111111111111',
      '尚未接入保存',
    )
    vi.mocked(listNotes).mockResolvedValue({
      items: [summaryFixture(existing)],
      total: 1,
    })
    vi.mocked(getNote).mockResolvedValue(existing)

    render(<App />)
    await userEvent.click(
      await screen.findByRole('option', { name: '尚未接入保存' }),
    )

    expect(
      await screen.findByRole('textbox', { name: '笔记标题' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('已保存')).not.toBeInTheDocument()
  })

  it('loads subsequent note pages in batches of 50', async () => {
    const first = noteFixture('11111111-1111-4111-8111-111111111111', '第一篇')
    const second = noteFixture('22222222-2222-4222-8222-222222222222', '第二篇')
    vi.mocked(listNotes)
      .mockResolvedValueOnce({ items: [summaryFixture(first)], total: 2 })
      .mockResolvedValueOnce({ items: [summaryFixture(second)], total: 2 })

    render(<App />)
    expect(await screen.findByRole('option', { name: '第一篇' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '加载更多笔记' }))

    expect(await screen.findByRole('option', { name: '第二篇' })).toBeInTheDocument()
    expect(listNotes).toHaveBeenLastCalledWith(1, 50)
  })

  it('keeps the latest note selection when earlier requests resolve late', async () => {
    const first = noteFixture('11111111-1111-4111-8111-111111111111', '第一篇')
    const second = noteFixture('22222222-2222-4222-8222-222222222222', '第二篇')
    const firstRequest = deferred<NoteDto>()
    const secondRequest = deferred<NoteDto>()
    vi.mocked(listNotes).mockResolvedValue({
      items: [summaryFixture(first), summaryFixture(second)],
      total: 2,
    })
    vi.mocked(getNote).mockImplementation((noteId) =>
      noteId === first.id ? firstRequest.promise : secondRequest.promise,
    )

    render(<App />)
    await userEvent.click(await screen.findByRole('option', { name: '第一篇' }))
    await userEvent.click(screen.getByRole('option', { name: '第二篇' }))

    await act(async () => secondRequest.resolve(second))
    expect(await screen.findByRole('textbox', { name: '笔记标题' })).toHaveValue('第二篇')

    await act(async () => firstRequest.resolve(first))
    expect(screen.getByRole('textbox', { name: '笔记标题' })).toHaveValue('第二篇')
  })

  it('shows command errors even while an existing note is open', async () => {
    const first = noteFixture('11111111-1111-4111-8111-111111111111', '第一篇')
    vi.mocked(listNotes).mockResolvedValue({
      items: [summaryFixture(first)],
      total: 1,
    })
    vi.mocked(getNote).mockResolvedValue(first)
    vi.mocked(createNote).mockRejectedValue(new Error('磁盘空间不足'))

    render(<App />)
    await userEvent.click(await screen.findByRole('option', { name: '第一篇' }))
    expect(await screen.findByRole('textbox', { name: '笔记标题' })).toHaveValue('第一篇')

    await userEvent.click(screen.getByRole('button', { name: '新建' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('磁盘空间不足')
  })
})
