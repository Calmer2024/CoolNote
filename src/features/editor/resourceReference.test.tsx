// @vitest-environment jsdom
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ResourceReference } from './resourceReference'
import { normalizeDocument } from './document'
import { noteToMarkdown } from '../export/markdownExport'
import { parseMarkdownDocument } from './markdown'
import { CodeLanguageIcon } from './CodeLanguageIcon'
import { ResourcePicker, resourcePath } from './ResourcePicker'
import { queryNotes, getJottingSnapshot, listGalleries } from '../../shared/tauri/commands'

vi.mock('../../shared/tauri/commands', () => ({ queryNotes: vi.fn(), getJottingSnapshot: vi.fn(), listGalleries: vi.fn() }))
const target = { kind: 'note', id: 'target-id', title: '研究 [草稿]', path: '工作 / 研究' }
const categories = [{ id: 'work', parentId: null, name: '工作', iconName: 'folder', color: '', sortOrder: 0, noteCount: 1 }]
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} })
  vi.mocked(queryNotes).mockResolvedValue({ total: 1, items: [{ id: 'target-id', title: target.title, categoryId: 'work' } as any] })
  vi.mocked(getJottingSnapshot).mockResolvedValue({ folders: [], jottings: [{ id: 'jot', name: '随想.md', folderId: null } as any] })
  vi.mocked(listGalleries).mockResolvedValue([{ id: 'gallery', name: '旅行照片' } as any])
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks() })

describe('resource references', () => {
  it('preserves resource IDs through editor recreation, HTML and Markdown', () => {
    const doc = normalizeDocument({ schemaVersion: 1, type: 'doc', content: [{ type: 'resourceReference', attrs: target }] })
    const editor = new Editor({ extensions: [StarterKit, ResourceReference], content: doc })
    const json = editor.getJSON()
    const html = editor.getHTML()
    const restored = new Editor({ extensions: [StarterKit, ResourceReference], content: html })
    expect(json.content?.[0].attrs).toMatchObject(target)
    expect(restored.getJSON().content?.[0].attrs).toMatchObject(target)
    expect(editor.getText()).toContain(target.title)
    const imported = parseMarkdownDocument(noteToMarkdown('来源', doc)).document.content[0]
    expect(imported.type).toBe('resourceReference')
    expect(imported.attrs).toMatchObject({ kind: 'note', id: target.id, title: target.title })
    editor.destroy(); restored.destroy()
  })
  it('supports references inside list items and table cells without losing persistence', () => {
    const doc = normalizeDocument({ schemaVersion: 1, type: 'doc', content: [
      { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph' }, { type: 'resourceReference', attrs: target }] }] },
      { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'resourceReference', attrs: target }] }] }] },
    ] })
    expect(doc.content).toHaveLength(2)
  })
  it('rejects invalid resource targets before saving', () => {
    expect(() => normalizeDocument({ schemaVersion: 1, type: 'doc', content: [{ type: 'resourceReference', attrs: { ...target, kind: 'task' } }] })).toThrow('无效的引用资源')
  })
  it('shows resource kinds, then categories, then notes with back navigation', async () => {
    const choose = vi.fn()
    render(<ResourcePicker anchor={{ current: document.body }} categories={categories} onChoose={choose} onDismiss={() => {}} />)
    expect(screen.getAllByRole('menuitem').map(item => item.textContent)).toEqual(['笔记', '小记', '画廊'])
    fireEvent.click(screen.getByRole('menuitem', { name: '笔记' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: '工作' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: target.title }))
    expect(choose).toHaveBeenCalledWith(expect.objectContaining({ id: target.id, kind: 'note' }))
    fireEvent.click(screen.getByRole('button', { name: '返回上一级' }))
    expect(screen.getByRole('menuitem', { name: '工作' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '返回上一级' }))
    expect(screen.getByRole('menuitem', { name: '小记' })).toBeTruthy()
  })
  it('searches across kinds and category paths without entering a hierarchy', async () => {
    const choose = vi.fn()
    render(<ResourcePicker anchor={{ current: document.body }} categories={categories} onChoose={choose} onDismiss={() => {}} />)
    const input = screen.getByRole('textbox', { name: '搜索引用资源' })
    fireEvent.change(input, { target: { value: '工作' } })
    await screen.findByRole('menuitem', { name: /研究/ })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(choose).toHaveBeenCalledWith(expect.objectContaining({ id: target.id, path: '工作', kind: 'note' }))
    fireEvent.change(input, { target: { value: '旅行照片' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(choose).toHaveBeenCalledWith(expect.objectContaining({ id: 'gallery', kind: 'gallery' }))
  })
  it('keeps search focused while navigating kinds, categories and files with the keyboard', async () => {
    const choose = vi.fn()
    render(<ResourcePicker anchor={{ current: document.body }} categories={categories} onChoose={choose} onDismiss={() => {}} />)
    const input = screen.getByRole('textbox', { name: '搜索引用资源' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(screen.getByRole('menuitem', { name: '小记' }).classList.contains('active')).toBe(true)
    expect(document.activeElement).toBe(input)
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(screen.getByRole('menuitem', { name: '笔记' }).classList.contains('active')).toBe(true)
    fireEvent.keyDown(input, { key: 'Enter' })
    await screen.findByRole('menuitem', { name: '工作' })
    expect(document.activeElement).toBe(input)
    fireEvent.keyDown(input, { key: 'Enter' })
    const note = await screen.findByRole('menuitem', { name: target.title })
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(input)
    expect(input.getAttribute('aria-activedescendant')).toBe(note.id)
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(choose).toHaveBeenCalledTimes(1)
    expect(choose).toHaveBeenCalledWith(expect.objectContaining({ id: target.id }))
  })
  it('can type a search immediately after arrow navigation and confirm with Enter', async () => {
    const choose = vi.fn()
    render(<ResourcePicker anchor={{ current: document.body }} categories={categories} onChoose={choose} onDismiss={() => {}} />)
    const input = screen.getByRole('textbox', { name: '搜索引用资源' })
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(screen.getByRole('menuitem', { name: '画廊' }).classList.contains('active')).toBe(true)
    expect(document.activeElement).toBe(input)
    fireEvent.change(input, { target: { value: '旅行' } })
    const gallery = await screen.findByRole('menuitem', { name: /旅行照片/ })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input.getAttribute('aria-activedescendant')).toBe(gallery.id)
    expect(document.activeElement).toBe(input)
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
    expect(choose).not.toHaveBeenCalled()
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(choose).toHaveBeenCalledWith(expect.objectContaining({ id: 'gallery', kind: 'gallery' }))
  })
  it('browses nested categories before showing their notes', async () => {
    const nested = [...categories, { ...categories[0], id: 'child', parentId: 'work', name: '研究' }]
    vi.mocked(queryNotes).mockResolvedValue({ total: 1, items: [{ id: 'target-id', title: target.title, categoryId: 'child' } as any] })
    render(<ResourcePicker anchor={{ current: document.body }} categories={nested} onChoose={() => {}} onDismiss={() => {}} />)
    fireEvent.click(screen.getByRole('menuitem', { name: '笔记' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: '工作' }))
    expect(screen.queryByRole('menuitem', { name: target.title })).toBeNull()
    fireEvent.click(screen.getByRole('menuitem', { name: '研究' }))
    expect(screen.getByRole('menuitem', { name: target.title })).toBeTruthy()
  })
  it('browses jotting folders and galleries and removes the jotting file suffix', async () => {
    const choose = vi.fn()
    vi.mocked(getJottingSnapshot).mockResolvedValue({ folders: [{ id: 'thoughts', parentId: null, name: '灵感', sortOrder: 0 }], jottings: [{ id: 'jot', name: '随想.md', folderId: 'thoughts' } as any] })
    render(<ResourcePicker anchor={{ current: document.body }} categories={categories} onChoose={choose} onDismiss={() => {}} />)
    fireEvent.click(screen.getByRole('menuitem', { name: '小记' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: '灵感' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '随想' }))
    expect(choose).toHaveBeenCalledWith(expect.objectContaining({ id: 'jot', title: '随想', kind: 'jotting' }))
    fireEvent.click(screen.getByRole('button', { name: '返回上一级' }))
    fireEvent.click(screen.getByRole('button', { name: '返回上一级' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '画廊' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '旅行照片' }))
    expect(choose).toHaveBeenCalledWith(expect.objectContaining({ id: 'gallery', kind: 'gallery' }))
  })
  it('keeps other resource kinds available when one source fails', async () => {
    vi.mocked(queryNotes).mockRejectedValue(new Error('offline'))
    render(<ResourcePicker anchor={{ current: document.body }} categories={categories} onChoose={() => {}} onDismiss={() => {}} />)
    fireEvent.click(screen.getByRole('menuitem', { name: '笔记' }))
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: '返回上一级' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '画廊' }))
    expect(screen.getByRole('menuitem', { name: '旅行照片' })).toBeTruthy()
  })
  it('builds nested paths and stops malformed category cycles', () => {
    expect(resourcePath('child', [{ id: 'child', parentId: 'root', name: '研究' }, { id: 'root', parentId: null, name: '工作' }])).toBe('工作 / 研究')
    expect(resourcePath('a', [{ id: 'a', parentId: 'a', name: '循环' }])).toBe('循环')
  })
  it('renders actual language logos with their multi-color layers', () => {
    const { container } = render(<><CodeLanguageIcon language="python" /><CodeLanguageIcon language="javascript" /><CodeLanguageIcon language="bash" /></>)
    expect(container.querySelectorAll('.ty-fi-python>span')).toHaveLength(2)
    expect(container.querySelector('.ty-fi-javascript')).toBeTruthy()
    expect(container.querySelector('.ty-fi-console')).toBeTruthy()
    expect(container.querySelector('svg')).toBeNull()
  })
})
