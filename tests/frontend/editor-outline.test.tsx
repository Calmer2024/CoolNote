import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { App } from '../../src/app/App'
import {
  deriveOutline,
  Outline,
} from '../../src/features/outline/Outline'
import type { VersionedDocument } from '../../src/shared/tauri/contracts'
import { initializeLibrary, listNotes } from '../../src/shared/tauri/commands'

vi.mock('../../src/shared/tauri/commands', () => ({
  createNote: vi.fn(),
  getNote: vi.fn(),
  initializeLibrary: vi.fn(),
  listNotes: vi.fn(),
  listRecoveryCandidates: vi.fn().mockResolvedValue([]),
  resolveRecovery: vi.fn(),
  saveNote: vi.fn(),
}))

const sampleDocument: VersionedDocument = {
  schemaVersion: 1,
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 1, blockId: 'a5c5a866-d2d1-42e2-a61d-164463045881' },
      content: [{ type: 'text', text: '产品概览' }],
    },
    {
      type: 'heading',
      attrs: { level: 2, blockId: 'b810d0f5-d741-454e-a339-f6be28340542' },
      content: [],
    },
    {
      type: 'heading',
      attrs: { level: 3, blockId: '2c471b91-06a2-4788-8864-6db538fd5f9a' },
      content: [
        { type: 'text', text: '实时' },
        { type: 'text', text: '大纲' },
      ],
    },
  ],
}

describe('editor outline', () => {
  beforeEach(() => {
    vi.mocked(initializeLibrary).mockResolvedValue({
      id: '8bbf0dc9-c8b4-43e6-abcd-e206f58647df',
      name: 'CoolNote',
      rootPath: 'C:\\Users\\tester\\Documents\\CoolNote',
      formatVersion: 1,
      createdAt: '2026-08-11T10:00:00Z',
      lastOpenedAt: '2026-08-11T10:00:00Z',
      lastCleanShutdownAt: null,
      settingsJson: '{}',
    })
    vi.mocked(listNotes).mockResolvedValue({ items: [], total: 0 })
  })

  it('derives only non-empty headings with their stable block IDs', () => {
    expect(deriveOutline(sampleDocument)).toEqual([
      {
        blockId: 'a5c5a866-d2d1-42e2-a61d-164463045881',
        level: 1,
        text: '产品概览',
      },
      {
        blockId: '2c471b91-06a2-4788-8864-6db538fd5f9a',
        level: 3,
        text: '实时大纲',
      },
    ])
  })

  it('navigates to, focuses, and highlights the selected heading block', async () => {
    const block = document.createElement('h2')
    block.dataset.blockId = 'a5c5a866-d2d1-42e2-a61d-164463045881'
    block.tabIndex = -1
    block.scrollIntoView = vi.fn()
    document.body.append(block)

    render(<Outline items={deriveOutline(sampleDocument)} />)
    await userEvent.click(screen.getByRole('button', { name: '产品概览' }))

    expect(block.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'center',
    })
    expect(block).toHaveFocus()
    expect(block).toHaveAttribute('data-outline-highlight', 'true')
  })

  it('collapses only the note list and outline', async () => {
    render(<App />)

    const notes = screen.getByRole('region', { name: '笔记列表' })
    await userEvent.click(screen.getByRole('button', { name: '收起笔记列表' }))
    expect(notes).toHaveAttribute('data-collapsed', 'true')

    const outline = screen.getByRole('complementary', { name: '文章大纲' })
    await userEvent.click(screen.getByRole('button', { name: '收起大纲' }))
    expect(outline).toHaveAttribute('data-collapsed', 'true')
    expect(screen.getByTestId('outline-toggle-icon')).toHaveAttribute(
      'data-icon',
      'list-tree',
    )

    fireEvent.click(screen.getByRole('button', { name: '展开大纲' }))
    expect(outline).toHaveAttribute('data-collapsed', 'false')
    expect(screen.queryByRole('button', { name: /主导航/ })).not.toBeInTheDocument()
  })
})
