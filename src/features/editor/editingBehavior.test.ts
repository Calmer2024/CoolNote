// @vitest-environment jsdom
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { TableKit } from '@tiptap/extension-table'
import { TaskList } from '@tiptap/extension-task-list'
import { TaskItem } from '@tiptap/extension-task-item'
import { HighlightBlock } from './highlightBlock'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EditingBehavior, tablePlainText } from './editingBehavior'
import { MarkdownClipboard, markdownClipboardBlocks } from './markdownClipboard'

let editor: Editor
const create = (content: string) => editor = new Editor({ extensions: [StarterKit.configure({ trailingNode: false }), TableKit, TaskList, TaskItem, HighlightBlock, EditingBehavior], content })
const backspace = (active: Editor) => active.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }))
const paste = (active: Editor, text: string) => {
  const event = new Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clipboardData', { value: { getData: (type: string) => type === 'text/plain' ? text : '', files: [] } })
  active.view.dom.dispatchEvent(event)
}
afterEach(() => editor?.destroy())

describe('note editing behavior', () => {
  it.each([
    ['-', '<ul><li><p></p></li></ul>'],
    ['1.', '<ol><li><p></p></li></ol>'],
    ['>', '<blockquote><p></p></blockquote>'],
    ['##', '<h2></h2>'],
    ['```', '<pre><code></code></pre>'],
  ])('preserves the block created by typing "%s "', (prefix, html) => {
    const active = create('<p></p>')
    active.commands.insertContent(prefix)
    const { from, to } = active.state.selection
    const handled = active.view.someProp('handleTextInput', handler => handler(active.view, from, to, ' ', () => active.state.tr.insertText(' ')))
    expect(handled).toBe(true)
    expect(active.getHTML()).toBe(html)
    active.commands.insertContent('正文')
    expect(active.getHTML()).toBe(html.replace('</p>', '正文</p>').replace('</h2>', '正文</h2>').replace('</code>', '正文</code>'))
    const { $from } = active.state.selection
    active.commands.deleteRange({ from: $from.start(), to: $from.end() })
    expect(active.getHTML()).toBe(html)
    backspace(active)
    expect(active.getHTML()).toBe('<p></p>')
  })

  it.each(['-', '1.', '>'])('can undo the "%s " input rule back to literal text', prefix => {
    const active = create('<p></p>')
    active.commands.insertContent(prefix)
    const { from, to } = active.state.selection
    active.view.someProp('handleTextInput', handler => handler(active.view, from, to, ' ', () => active.state.tr.insertText(' ')))
    expect(active.commands.undoInputRule()).toBe(true)
    expect(active.getJSON().content?.[0]).toMatchObject({ type: 'paragraph', content: [{ type: 'text', text: `${prefix} ` }] })
  })

  it('preserves an emptied heading and its marks until another Backspace, including undo/redo', () => {
    const active = create('<h3><strong>字</strong></h3>')
    active.commands.setTextSelection(2)
    active.commands.deleteRange({ from: 1, to: 2 })
    expect(active.getHTML()).toBe('<h3></h3>')
    expect(active.isActive('bold')).toBe(true)
    backspace(active)
    expect(active.getHTML()).toBe('<p></p>')
    active.commands.insertContent('新的正文')
    expect(active.getHTML()).toBe('<p>新的正文</p>')
    active.commands.undo()
    expect(active.getHTML()).toBe('<h3><strong>字</strong></h3>')
    active.commands.redo()
    expect(active.getHTML()).toBe('<p>新的正文</p>')
  })

  it('keeps inline formatting on an emptied paragraph until another Backspace', () => {
    const active = create('<p><em>字</em></p>')
    active.commands.setTextSelection(2)
    active.commands.deleteRange({ from: 1, to: 2 })
    expect(active.isActive('italic')).toBe(true)
    backspace(active)
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

  it('continues typing in the same heading and inline style after deleting its text', () => {
    const active = create('<h2><strong>字</strong></h2>')
    active.commands.setTextSelection(2)
    active.commands.deleteRange({ from: 1, to: 2 })
    active.commands.insertContent('新标题')
    expect(active.getHTML()).toBe('<h2><strong>新标题</strong></h2>')
  })

  it('preserves a heading when its selected text is deleted', () => {
    const active = create('<h2>标题</h2>')
    active.commands.setTextSelection({ from: 1, to: 3 })
    active.commands.deleteSelection()
    expect(active.getHTML()).toBe('<h2></h2>')
    backspace(active)
    expect(active.getHTML()).toBe('<p></p>')
  })

  it('clears an empty heading before merging it with the preceding paragraph', () => {
    const active = create('<p>保留</p><h2></h2>')
    active.commands.setTextSelection(5)
    backspace(active)
    expect(active.getHTML()).toBe('<p>保留</p><p></p>')
    backspace(active)
    expect(active.getHTML()).toBe('<p>保留</p>')
  })

  it.each([
    '<blockquote><h2>字</h2></blockquote>',
    '<aside data-type="highlight-block"><h2>字</h2></aside>',
    '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>字</p></li></ul>',
    '<blockquote><ul><li><p>字</p></li></ul></blockquote>',
  ])('clears all formatting on the empty line in %s on Backspace', content => {
    const active = create(content)
    let from = 0
    active.state.doc.descendants((node, pos) => { if (node.isText) from = pos })
    const original = active.getHTML().replace('字', '')
    active.commands.setTextSelection(from + 1)
    active.commands.deleteRange({ from, to: from + 1 })
    expect(active.getHTML()).toBe(original)
    backspace(active)
    expect(active.getHTML()).toBe('<p></p>')
  })

  it('keeps an empty heading inside its table cell when clearing formatting', () => {
    const active = create('<table><tr><td><h2>字</h2></td><td><p>保留</p></td></tr></table>')
    active.commands.setTextSelection(5)
    active.commands.deleteRange({ from: 4, to: 5 })
    expect(active.isActive('heading')).toBe(true)
    backspace(active)
    expect(active.state.doc.firstChild!.firstChild!.firstChild!.firstChild!.type.name).toBe('paragraph')
    expect(active.getText()).toContain('保留')
    expect(active.state.doc.firstChild!.firstChild!.childCount).toBe(2)
  })

  it('only removes an empty line from lists and quotes on another Backspace, preserving siblings', () => {
    const active = create('<ul><li><p>字</p></li><li><p>保留</p></li></ul>')
    active.commands.setTextSelection(4)
    active.commands.deleteRange({ from: 3, to: 4 })
    expect(active.getHTML()).toBe('<ul><li><p></p></li><li><p>保留</p></li></ul>')
    backspace(active)
    expect(active.getHTML()).toBe('<p></p><ul><li><p>保留</p></li></ul>')
    active.commands.setContent('<blockquote><p>字</p><p>保留</p></blockquote>')
    active.commands.setTextSelection(3)
    active.commands.deleteRange({ from: 2, to: 3 })
    expect(active.getHTML()).toBe('<blockquote><p></p><p>保留</p></blockquote>')
    backspace(active)
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
