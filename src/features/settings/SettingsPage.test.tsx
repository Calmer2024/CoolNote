// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const api = vi.hoisted(() => ({ getIntegrationStatus: vi.fn(), updateIntegrationSettings: vi.fn(), getIntegrationClientConfig: vi.fn(), updateLibrarySettings: vi.fn(), listSystemFonts: vi.fn() }))
vi.mock('../../shared/tauri/commands', () => api)
import { SettingsPage } from './SettingsPage'
import type { LibraryDto } from '../../shared/tauri/contracts'

const library: LibraryDto = { id: 'library', name: '我的资料库', rootPath: 'D:/CoolNote/library', formatVersion: 1, createdAt: '', lastOpenedAt: '', lastCleanShutdownAt: null, settingsJson: '{"theme":"system","otherPreference":true}', settingsRevision: 4 }
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('ResizeObserver',class { observe(){} disconnect(){} }); api.listSystemFonts.mockResolvedValue(['PingFang SC','Segoe UI']); api.getIntegrationStatus.mockResolvedValue({ enabled: false, running: false, port: 43127, scopes: ['notes:read'], revision: 1, error: null, executable: 'C:/CoolNote.exe' }) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
const page = (onBack = vi.fn(), onLibraryChange = vi.fn()) => render(<SettingsPage library={library} onBack={onBack} onLibraryChange={onLibraryChange} />)

it('uses an independent page with working categories and real library details', () => {
  page()
  expect(screen.getByRole('main', { name: '设置' })).toBeTruthy()
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(api.getIntegrationStatus).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '关于 CoolNote' }))
  expect(screen.getByRole('heading', { name: '关于 CoolNote' })).toBe(document.activeElement)
  expect(screen.getByText(library.rootPath)).toBeTruthy()
  expect(screen.getByRole('button', { name: '关于 CoolNote' }).getAttribute('aria-current')).toBe('page')
})

it('saves theme with the current revision and preserves unrelated preferences', async () => {
  const changed = vi.fn()
  const updated = { ...library, settingsRevision: 5, settingsJson: '{"theme":"dark","otherPreference":true}' }
  api.updateLibrarySettings.mockResolvedValue(updated)
  page(vi.fn(), changed)
  fireEvent.click(screen.getByRole('combobox', { name: '主题' }))
  fireEvent.click(screen.getByRole('option', { name: '深色' }))
  await waitFor(() => expect(changed).toHaveBeenCalledWith(updated))
  expect(api.updateLibrarySettings).toHaveBeenCalledWith({ baseSettingsRevision: 4, settingsJson: '{"theme":"dark","otherPreference":true}' })
})

it('returns keyboard focus to the custom select when Escape dismisses its layer', () => {
  page()
  const trigger = screen.getByRole('combobox', { name: '主题' })
  fireEvent.click(trigger)
  const selected = screen.getByRole('option', { name: '跟随系统' })
  selected.focus()
  fireEvent.keyDown(selected, { key: 'Escape' })
  expect(screen.queryByRole('listbox', { name: '主题' })).toBeNull()
  expect(document.activeElement).toBe(trigger)
})

it('applies MCP changes without a save or discard step when returning', async () => {
  const back = vi.fn()
  api.updateIntegrationSettings.mockResolvedValue({enabled:true,running:true,port:43127,scopes:['notes:read'],revision:2,error:null,executable:'C:/CoolNote.exe'})
  page(back)
  fireEvent.click(screen.getByRole('button', { name: 'MCP 集成' }))
  await waitFor(() => expect((screen.getByRole('switch') as HTMLInputElement).disabled).toBe(false))
  fireEvent.click(screen.getByRole('switch'))
  await waitFor(() => expect((screen.getByRole('button', {name:'返回 CoolNote'}) as HTMLButtonElement).disabled).toBe(false))
  expect(api.updateIntegrationSettings).toHaveBeenCalledWith(expect.objectContaining({enabled:true}))
  fireEvent.click(screen.getByRole('button', { name: '返回 CoolNote' }))
  expect(back).toHaveBeenCalledTimes(1)
  expect(screen.queryByText('放弃更改并返回')).toBeNull()
})

it('keeps the selected theme and shows an error when saving fails', async () => {
  const changed = vi.fn()
  api.updateLibrarySettings.mockRejectedValue(new Error('无法保存外观'))
  page(vi.fn(), changed)
  fireEvent.click(screen.getByRole('combobox', { name: '主题' }))
  fireEvent.click(screen.getByRole('option', { name: '浅色' }))
  expect((await screen.findByRole('alert')).textContent).toBe('无法保存外观')
  expect(screen.getByRole('combobox', { name: '主题' }).textContent).toBe('跟随系统')
  expect(changed).not.toHaveBeenCalled()
})

it('searches detected fonts and saves a family without replacing other preferences', async () => {
  const changed = vi.fn()
  const updated = {...library, settingsRevision:5,settingsJson:'{"theme":"system","otherPreference":true,"interfaceFont":"Segoe UI"}'}
  api.updateLibrarySettings.mockResolvedValue(updated)
  page(vi.fn(),changed)
  await waitFor(() => expect((screen.getByRole('combobox',{name:'界面字体'}) as HTMLButtonElement).disabled).toBe(false))
  expect(document.querySelector('select')).toBeNull()
  expect(screen.queryByText('小记与分享模板')).toBeNull()
  fireEvent.click(screen.getByRole('combobox',{name:'界面字体'}))
  fireEvent.change(screen.getByRole('textbox',{name:'搜索界面字体'}),{target:{value:'segoe'}})
  expect(screen.getAllByRole('option').length).toBe(1)
  fireEvent.click(screen.getByRole('option',{name:'Segoe UI'}))
  await waitFor(() => expect(changed).toHaveBeenCalledWith(updated))
  expect(api.updateLibrarySettings).toHaveBeenCalledWith({baseSettingsRevision:4,settingsJson:updated.settingsJson})
})
