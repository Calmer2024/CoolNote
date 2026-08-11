import axe from 'axe-core'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { App } from '../../src/app/App'
import type {
  LibraryDto,
  NoteDto,
  RecoveryCandidateDto,
} from '../../src/shared/tauri/contracts'
import {
  getNote,
  initializeLibrary,
  listNotes,
  listRecoveryCandidates,
  saveNote,
  updateLibrarySettings,
} from '../../src/shared/tauri/commands'

vi.mock('../../src/shared/tauri/commands', () => ({
  createNote: vi.fn(),
  getNote: vi.fn(),
  initializeLibrary: vi.fn(),
  listNotes: vi.fn(),
  listRecoveryCandidates: vi.fn(),
  resolveRecovery: vi.fn(),
  saveNote: vi.fn(),
  updateLibrarySettings: vi.fn(),
}))

const library: LibraryDto = {
  id: '8bbf0dc9-c8b4-43e6-abcd-e206f58647df',
  name: 'CoolNote',
  rootPath: 'C:\\Users\\tester\\Documents\\CoolNote',
  formatVersion: 1,
  createdAt: '2026-08-11T10:00:00Z',
  lastOpenedAt: '2026-08-11T10:00:00Z',
  lastCleanShutdownAt: null,
  settingsJson: '{"theme":"system"}',
  settingsRevision: 1,
}

const note: NoteDto = {
  id: '11111111-1111-4111-8111-111111111111',
  categoryId: '33333333-3333-4333-8333-333333333333',
  title: '无障碍验收笔记',
  document: {
    schemaVersion: 1,
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        attrs: { blockId: '44444444-4444-4444-8444-444444444444' },
        content: [{ type: 'text', text: '正文内容' }],
      },
    ],
  },
  plainText: '正文内容',
  contentHash: 'note-hash',
  revision: 1,
  createdAt: '2026-08-11T10:01:00Z',
  updatedAt: '2026-08-11T10:01:00Z',
}

function summary() {
  return {
    id: note.id,
    title: note.title,
    excerpt: note.plainText,
    revision: note.revision,
    updatedAt: note.updatedAt,
  }
}

async function expectNoSeriousViolations(container: HTMLElement) {
  const result = await axe.run(container, {
    rules: {
      'color-contrast': { enabled: false },
    },
  })
  expect(
    result.violations.filter(
      (violation) =>
        violation.impact === 'serious' || violation.impact === 'critical',
    ),
  ).toEqual([])
}

describe('application accessibility states', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
    vi.mocked(initializeLibrary).mockResolvedValue(library)
    vi.mocked(listNotes).mockResolvedValue({ items: [], total: 0 })
    vi.mocked(listRecoveryCandidates).mockResolvedValue([])
    vi.mocked(getNote).mockResolvedValue(note)
    vi.mocked(saveNote).mockResolvedValue({
      noteId: note.id,
      revision: 2,
      updatedAt: '2026-08-11T10:02:00Z',
      contentHash: 'saved-hash',
    })
    vi.mocked(updateLibrarySettings).mockResolvedValue(library)
  })

  it('has no serious violations in the empty-library state', async () => {
    const { container } = render(<App />)
    await screen.findByText('还没有笔记')
    await expectNoSeriousViolations(container)
  })

  it('has no serious violations while editing', async () => {
    vi.mocked(listNotes).mockResolvedValue({ items: [summary()], total: 1 })
    const { container } = render(<App />)
    await userEvent.click(await screen.findByRole('option', { name: note.title }))
    await screen.findByRole('textbox', { name: '笔记正文' })
    await expectNoSeriousViolations(container)
  })

  it('has no serious violations after a recovery-safe save failure', async () => {
    vi.mocked(listNotes).mockResolvedValue({ items: [summary()], total: 1 })
    vi.mocked(saveNote).mockRejectedValue({
      code: 'local_operation_failed',
      message: '磁盘暂时不可写',
      retryable: true,
      recoverySafe: true,
    })
    const user = userEvent.setup()
    const { container } = render(<App />)
    await user.click(await screen.findByRole('option', { name: note.title }))
    await user.type(
      await screen.findByRole('textbox', { name: '笔记标题' }),
      ' 已修改',
    )
    await screen.findByText('保存失败，草稿已保留', undefined, {
      timeout: 1500,
    })
    await expectNoSeriousViolations(container)
  })

  it('has no serious violations in the recovery dialog state', async () => {
    const candidate: RecoveryCandidateDto = {
      decision: 'conflict',
      databaseRevision: 2,
      draft: {
        libraryId: library.id,
        noteId: note.id,
        baseRevision: 1,
        clientTransactionId: '55555555-5555-4555-8555-555555555555',
        title: '恢复草稿',
        documentJson: note.document,
        contentHash: 'draft-hash',
        createdAt: '2026-08-11T10:03:00Z',
      },
    }
    vi.mocked(listRecoveryCandidates).mockResolvedValue([candidate])
    const { container } = render(<App />)
    await screen.findByRole('dialog', { name: '发现恢复草稿冲突' })
    await expectNoSeriousViolations(container)
  })
})
