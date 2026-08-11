import { render, screen } from '@testing-library/react'
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
} from '../../src/shared/tauri/commands'

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

function draftFixture(): RecoveryRecordDto {
  return {
    libraryId: library.id,
    noteId: '11111111-1111-4111-8111-111111111111',
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

describe('recovery UI', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(initializeLibrary).mockResolvedValue(library)
    vi.mocked(listNotes).mockResolvedValue({ items: [], total: 0 })
    vi.mocked(getNote).mockResolvedValue(databaseNote)
    vi.mocked(resolveRecovery).mockResolvedValue(draftFixture())
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
})
