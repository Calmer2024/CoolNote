// @vitest-environment jsdom
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { TableKit } from '@tiptap/extension-table'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EditingBehavior, tablePlainText } from './editingBehavior'

let editor: Editor
const create = (content: string) => editor = new Editor({ extensions: [StarterKit.configure({ trailingNode: false }), TableKit, EditingBehavior], content })
afterEach(() => editor?.destroy())

describe('note editing behavior', () => {
  it('resets a heading and its marks when the final character is deleted, including undo/redo', () => {
    const active = create('<h3><strong>字</strong></h3>')
    active.commands.setTextSelection(2)
    active.commands.deleteRange({ from: 1, to: 2 })
    expect(active.getHTML()).toBe('<p></p>')
    active.commands.insertContent('新的正文')
    expect(active.getHTML()).toBe('<p>新的正文</p>')
    active.commands.undo()
    expect(active.getHTML()).toBe('<h3><strong>字</strong></h3>')
    active.commands.redo()
    expect(active.getHTML()).toBe('<p>新的正文</p>')
  })

  it('clears stored inline formatting on an emptied paragraph', () => {
    const active = create('<p><em>字</em></p>')
    active.commands.setTextSelection(2)
    active.commands.deleteRange({ from: 1, to: 2 })
    active.commands.insertContent('正文')
    expect(active.getHTML()).toBe('<p>正文</p>')
  })

  it('preserves partially deleted headings and deliberately created empty headings', () => {
    const active = create('<h2>标题</h2>')
    active.commands.deleteRange({ from: 2, to: 3 })
    expect(active.getHTML()).toBe('<h2>标</h2>')
    active.commands.setContent('<h4></h4>')
    expect(active.getHTML()).toBe('<h4></h4>')
  })

  it('removes the emptied line from lists and quotes while preserving its siblings', () => {
    const active = create('<ul><li><p>字</p></li><li><p>保留</p></li></ul>')
    active.commands.setTextSelection(4)
    active.commands.deleteRange({ from: 3, to: 4 })
    expect(active.getHTML()).toBe('<p></p><ul><li><p>保留</p></li></ul>')
    active.commands.setContent('<blockquote><p>字</p><p>保留</p></blockquote>')
    active.commands.setTextSelection(3)
    active.commands.deleteRange({ from: 2, to: 3 })
    expect(active.getHTML()).toBe('<p></p><blockquote><p>保留</p></blockquote>')
  })

  it('copies only plain text, removing HTML clipboard content', () => {
    const active = create('<h2><strong>标题</strong></h2><p>正文</p>')
    active.commands.selectAll()
    const clipboardData = { clearData: vi.fn(), setData: vi.fn() }
    const event = new Event('copy', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: clipboardData })
    active.view.dom.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(clipboardData.clearData).toHaveBeenCalledOnce()
    expect(clipboardData.setData).toHaveBeenCalledExactlyOnceWith('text/plain', '标题\n正文')
  })

  it('copies table rows as TSV and prevents table dragging while preserving selection', () => {
    const active = create('<table><tr><th>名字</th><th>内容</th></tr><tr><td>A</td><td><p>第一行</p><p>第二行</p></td></tr></table>')
    expect(tablePlainText(active.state.doc.firstChild!)).toBe('名字\t内容\nA\t"第一行\n第二行"')
    const event = new Event('dragstart', { bubbles: true, cancelable: true })
    active.view.dom.querySelector('td')!.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(active.state.doc.firstChild!.childCount).toBe(2)
  })
})
