// @vitest-environment jsdom
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { TableKit } from '@tiptap/extension-table'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EditingBehavior, tablePlainText } from './editingBehavior'
import { MarkdownClipboard, markdownClipboardBlocks } from './markdownClipboard'

let editor: Editor
const create = (content: string) => editor = new Editor({ extensions: [StarterKit.configure({ trailingNode: false }), TableKit, EditingBehavior], content })
const paste = (active: Editor, text: string) => {
  const event = new Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clipboardData', { value: { getData: (type: string) => type === 'text/plain' ? text : '', files: [] } })
  active.view.dom.dispatchEvent(event)
}
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

  it('copies Markdown and keeps an HTML fallback for lossless internal paste', () => {
    const active = create('<h2><strong>标题</strong></h2><p>正文</p>')
    active.commands.selectAll()
    const clipboardData = { clearData: vi.fn(), setData: vi.fn() }
    const event = new Event('copy', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: clipboardData })
    active.view.dom.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(clipboardData.setData).toHaveBeenCalledWith('text/plain', '## **标题**\n\n正文')
    expect(clipboardData.setData).toHaveBeenCalledWith('text/html', expect.stringContaining('<h2 '))
  })

  it('restores pasted Markdown headings, marks, nested lists, quotes, code and tables without dropping H1', () => {
    const active = create('<p></p>')
    paste(active, '# 一级标题\n\n**加粗**与*斜体*\n\n- 外层\n  - 内层\n\n> 引用\n\n```js\nconst a = 1\n```\n\n| 名字 | 内容 |\n| --- | --- |\n| A | B |')
    const html = active.getHTML()
    expect(html).toContain('<h1>一级标题</h1>')
    expect(html).toContain('<strong>加粗</strong>')
    expect(html).toContain('<em>斜体</em>')
    expect(html).toContain('<li><p>外层</p><ul><li><p>内层</p></li></ul></li>')
    expect(html).toContain('<blockquote><p>引用</p></blockquote>')
    expect(html).toContain('<pre><code class="language-js">const a = 1</code></pre>')
    expect(html).toContain('<table')
    expect(html).toContain('<p>B</p></td>')
  })

  it('keeps Markdown literal inside a code block', () => {
    const active = create('<pre><code>x</code></pre>')
    active.commands.setTextSelection(2)
    active.view.pasteText('**原样**', new Event('paste') as ClipboardEvent)
    expect(active.getHTML()).toBe('<pre><code>x**原样**</code></pre>')
  })

  it('supports pasting as plain text without converting Markdown', () => {
    const active = create('<p></p>')
    active.view.pasteText('# 标题\n\n- 列表', new Event('paste') as ClipboardEvent)
    expect(active.getHTML()).toBe('<p># 标题</p><p>- 列表</p>')
  })

  it('cuts as Markdown and restores formatting when that Markdown is pasted back', () => {
    const active = create('<h2>标题</h2><p><em>正文</em></p><ul><li><p>项目</p></li></ul>')
    const original = active.getHTML()
    active.commands.selectAll()
    const clipboard = new Map<string, string>()
    const event = new Event('cut', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: { clearData: () => clipboard.clear(), setData: (type: string, value: string) => clipboard.set(type, value) } })
    active.view.dom.dispatchEvent(event)
    expect(active.getText()).toBe('')
    expect(clipboard.get('text/plain')).toBe('## 标题\n\n*正文*\n\n- 项目')
    paste(active, clipboard.get('text/plain')!)
    expect(active.getHTML()).toBe(original)
  })

  it('parses large Markdown by complete blocks so nested lists survive batch boundaries', () => {
    const active = create('<p></p>')
    const text = Array.from({ length: 600 }, (_, i) => `## 标题 ${i}\n\n- 项目\n  - **嵌套**`).join('\n\n')
    const blocks = markdownClipboardBlocks(text, active.schema)
    expect(blocks).toHaveLength(1200)
    expect(blocks[150].type.name).toBe('heading')
    expect(blocks[151].firstChild!.lastChild!.type.name).toBe('bulletList')
    blocks.forEach(block => block.check())
  })

  it('restores Markdown in the smaller jotting schema and safely flattens unsupported tables', () => {
    editor = new Editor({ extensions: [StarterKit, MarkdownClipboard], content: '<p></p>' })
    paste(editor, '# 标题\n\n**正文**\n\n| A | B |\n| --- | --- |\n| C | D |')
    expect(editor.getHTML()).toContain('<h1>标题</h1>')
    expect(editor.getHTML()).toContain('<strong>正文</strong>')
    expect(editor.getText()).toContain('C')
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
