import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { describe, expect, it } from 'vitest'

import { StableBlockIds } from './NoteEditor'

describe('StableBlockIds', () => {
  it('assigns a unique block id to every paragraph created by Enter', () => {
    const originalId = crypto.randomUUID()
    const editor = new Editor({
      extensions: [StarterKit, StableBlockIds],
      content: {
        type: 'doc',
        content: [{
          type: 'paragraph',
          attrs: { blockId: originalId },
          content: [{ type: 'text', text: 'first' }],
        }],
      },
    })

    for (let index = 0; index < 5; index += 1) {
      editor.commands.setTextSelection(editor.state.doc.content.size - 1)
      expect(editor.commands.splitBlock()).toBe(true)
    }

    const blockIds: string[] = []
    editor.state.doc.forEach(node => blockIds.push(node.attrs.blockId))
    expect(blockIds).toHaveLength(6)
    expect(new Set(blockIds).size).toBe(blockIds.length)
    expect(blockIds[0]).toBe(originalId)
    editor.destroy()
  })
})
// @vitest-environment jsdom
