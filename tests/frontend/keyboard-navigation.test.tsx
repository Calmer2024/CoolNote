import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { NotesPanel } from '../../src/features/notes/NotesPanel'
import type { NoteSummaryDto } from '../../src/shared/tauri/contracts'

const notes: NoteSummaryDto[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    title: '第一篇',
    excerpt: '第一篇摘要',
    revision: 1,
    updatedAt: '2026-08-11T10:01:00Z',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    title: '第二篇',
    excerpt: '第二篇摘要',
    revision: 1,
    updatedAt: '2026-08-11T10:02:00Z',
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    title: '第三篇',
    excerpt: '第三篇摘要',
    revision: 1,
    updatedAt: '2026-08-11T10:03:00Z',
  },
]

describe('note list keyboard navigation', () => {
  it('moves the active option with arrows and opens it with Enter', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(
      <NotesPanel
        notes={notes}
        total={notes.length}
        selectedNoteId={null}
        collapsed={false}
        loading={false}
        canLoadMore={false}
        loadingMore={false}
        onSelect={onSelect}
        onLoadMore={vi.fn()}
      />,
    )

    const list = screen.getByRole('listbox', { name: '笔记列表' })
    await user.click(list)
    await user.keyboard('{ArrowDown}{Enter}')

    expect(onSelect).toHaveBeenCalledOnce()
    expect(onSelect).toHaveBeenCalledWith(notes[1].id)
    expect(list).toHaveAttribute(
      'aria-activedescendant',
      `note-option-${notes[1].id}`,
    )
  })

  it('starts from the selected note and clamps at list boundaries', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(
      <NotesPanel
        notes={notes}
        total={notes.length}
        selectedNoteId={notes[2].id}
        collapsed={false}
        loading={false}
        canLoadMore={false}
        loadingMore={false}
        onSelect={onSelect}
        onLoadMore={vi.fn()}
      />,
    )

    const list = screen.getByRole('listbox', { name: '笔记列表' })
    list.focus()
    await user.keyboard('{ArrowDown}{Enter}')

    expect(onSelect).toHaveBeenCalledWith(notes[2].id)
  })
})
