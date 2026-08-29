// @vitest-environment jsdom

import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { describe, expect, it } from 'vitest'

import { HighlightBlock } from './highlightBlock'

describe('HighlightBlock', () => {
  it('opens the emoji picker outside the editor clipping boundary', () => {
    const element = document.createElement('div')
    document.body.append(element)
    const editor = new Editor({
      element,
      extensions: [StarterKit, HighlightBlock],
      content: { type: 'doc', content: [{
        type: 'highlightBlock',
        attrs: { emoji: '💡' },
        content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Important' }] }],
      }] },
    })
    const trigger = element.querySelector<HTMLButtonElement>('.editor-highlight-emoji')!
    trigger.click()
    const picker = document.querySelector<HTMLElement>('.editor-highlight-picker')!
    const pickerParent = picker.parentElement
    const pickerVisible = !picker.hidden
    const option = Array.from(picker.querySelectorAll<HTMLButtonElement>('.editor-highlight-emoji-option')).find(button => button.textContent === '🎯')!
    option.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    const selectedEmoji = element.querySelector('.editor-highlight-block')?.getAttribute('data-emoji')
    const editorText = editor.getText()
    editor.destroy()
    element.remove()
    picker.remove()
    expect(pickerParent).toBe(document.body)
    expect(pickerVisible).toBe(true)
    expect(selectedEmoji).toBe('🎯')
    expect(editorText).toContain('Important')
  })

  it('preserves a large pasted block through JSON serialization and editor recreation', () => {
    const paragraphs = Array.from({ length: 160 }, (_, index) => ({
      type:'paragraph',
      content:[{ type:'text', text:`粘贴内容 ${index}：${'正文'.repeat(30)}` }],
    }))
    const firstElement = document.createElement('div')
    document.body.append(firstElement)
    const first = new Editor({
      element:firstElement,
      extensions:[StarterKit,HighlightBlock],
      content:{ type:'doc', content:[{ type:'highlightBlock', attrs:{emoji:'💡'}, content:paragraphs }] },
    })
    const serialized = first.getJSON()
    first.destroy()
    firstElement.remove()

    const secondElement = document.createElement('div')
    document.body.append(secondElement)
    const second = new Editor({ element:secondElement, extensions:[StarterKit,HighlightBlock], content:serialized })
    expect(second.getJSON()).toEqual(serialized)
    expect(second.getText()).toContain('粘贴内容 159')
    second.destroy()
    secondElement.remove()
  })

  it('keeps toolbar DOM changes outside the editable document transaction stream', async () => {
    const element = document.createElement('div')
    document.body.append(element)
    const editor = new Editor({
      element,
      extensions:[StarterKit,HighlightBlock],
      content:{ type:'doc', content:[{ type:'highlightBlock', content:[{ type:'paragraph', content:[{type:'text',text:'仍然可编辑'}] }] }] },
    })
    let transactions = 0
    editor.on('transaction', () => { transactions += 1 })
    const trigger = element.querySelector<HTMLButtonElement>('.editor-highlight-emoji')!
    for (let index = 0; index < 20; index += 1) {
      trigger.click()
      trigger.click()
    }
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(transactions).toBe(0)
    expect(editor.isEditable).toBe(true)
    expect(editor.getText()).toContain('仍然可编辑')
    editor.destroy()
    element.remove()
  })
})
