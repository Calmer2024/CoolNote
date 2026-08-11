import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { App } from '../../src/app/App'
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

describe('CoolNote application shell', () => {
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
      settingsRevision: 1,
    })
    vi.mocked(listNotes).mockResolvedValue({ items: [], total: 0 })
  })

  it('renders without demo notes or the removed Canvas entry', async () => {
    render(<App />)

    expect(await screen.findByText('还没有笔记')).toBeInTheDocument()
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(
      screen.getByRole('complementary', { name: '主导航' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('MiraAgent')).not.toBeInTheDocument()
    expect(screen.queryByText('画板')).not.toBeInTheDocument()
  })
})
