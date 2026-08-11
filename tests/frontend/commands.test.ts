import { beforeEach, describe, expect, it, vi } from 'vitest'

import { saveNote } from '../../src/shared/tauri/commands'

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }))

vi.mock('@tauri-apps/api/core', () => ({ invoke }))

describe('typed Tauri commands', () => {
  beforeEach(() => invoke.mockReset())

  it('sends the revision-safe save payload unchanged', async () => {
    invoke.mockResolvedValue({
      noteId: 'note-id',
      revision: 2,
      updatedAt: '2026-08-11T00:00:00Z',
      contentHash: 'hash',
    })
    const request = {
      noteId: 'note-id',
      baseRevision: 1,
      clientTransactionId: 'transaction-id',
      title: '',
      documentJson: { schemaVersion: 1, type: 'doc', content: [] },
    }

    await saveNote(request)

    expect(invoke).toHaveBeenCalledWith('save_note', { request })
  })
})
