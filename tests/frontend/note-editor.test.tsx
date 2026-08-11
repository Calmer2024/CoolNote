import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { NoteEditor } from '../../src/features/editor/NoteEditor'
import type { NoteDto } from '../../src/shared/tauri/contracts'

const initialBlockId = '94bcc0f3-7445-4f1e-acb4-ecb1f0ac7c90'

const note: NoteDto = {
  id: '1222cd74-a222-4b94-bb27-a39042ed4473',
  categoryId: '0261e46a-303b-456e-b5d4-0127de1f7615',
  title: '',
  document: {
    schemaVersion: 1,
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        attrs: { blockId: initialBlockId },
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

describe('Tiptap note editor', () => {
  it('preserves existing block IDs and assigns a new ID after pressing Enter', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<NoteEditor note={note} onChange={onChange} />)

    const editor = await screen.findByRole('textbox', { name: '笔记正文' })
    await user.click(editor)
    await user.type(editor, '第一段{Enter}第二段')

    await waitFor(() => {
      const lastChange = onChange.mock.calls.at(-1)?.[0]
      expect(lastChange.documentJson.content).toHaveLength(2)
      expect(lastChange.documentJson.content[0].attrs?.blockId).toBe(initialBlockId)
      expect(lastChange.documentJson.content[1].attrs?.blockId).toMatch(
        /^[0-9a-f-]{36}$/i,
      )
    })
  })
})
