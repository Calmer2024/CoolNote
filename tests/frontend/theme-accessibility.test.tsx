import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { App } from '../../src/app/App'
import {
  initializeLibrary,
  listNotes,
  listRecoveryCandidates,
} from '../../src/shared/tauri/commands'
import type { LibraryDto } from '../../src/shared/tauri/contracts'

const updateLibrarySettings = vi.hoisted(() => vi.fn())

vi.mock('../../src/shared/tauri/commands', () => ({
  createNote: vi.fn(),
  getNote: vi.fn(),
  initializeLibrary: vi.fn(),
  listNotes: vi.fn(),
  listRecoveryCandidates: vi.fn().mockResolvedValue([]),
  resolveRecovery: vi.fn(),
  saveNote: vi.fn(),
  updateLibrarySettings,
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

describe('theme accessibility', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
    vi.mocked(initializeLibrary).mockResolvedValue(library)
    vi.mocked(listNotes).mockResolvedValue({ items: [], total: 0 })
    vi.mocked(listRecoveryCandidates).mockResolvedValue([])
    updateLibrarySettings.mockImplementation(
      async ({ settingsJson, baseSettingsRevision }) => ({
        ...library,
        settingsJson,
        settingsRevision: baseSettingsRevision + 1,
      }),
    )
  })

  it('cycles system, light, and dark while persisting each revision', async () => {
    const user = userEvent.setup()
    render(<App />)

    const systemButton = await screen.findByRole('button', {
      name: '主题：跟随系统',
    })
    expect(document.documentElement.dataset.themeMode).toBe('system')

    await user.click(systemButton)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '主题：浅色' })).toBeEnabled()
    })
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(updateLibrarySettings).toHaveBeenLastCalledWith({
      baseSettingsRevision: 1,
      settingsJson: '{"theme":"light"}',
    })

    await user.click(screen.getByRole('button', { name: '主题：浅色' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '主题：深色' })).toBeEnabled()
    })
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(updateLibrarySettings).toHaveBeenLastCalledWith({
      baseSettingsRevision: 2,
      settingsJson: '{"theme":"dark"}',
    })

    await user.click(screen.getByRole('button', { name: '主题：深色' }))
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: '主题：跟随系统' }),
      ).toBeEnabled()
    })
    expect(document.documentElement.dataset.themeMode).toBe('system')
  })
})
