// @vitest-environment jsdom
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { TableKit } from '@tiptap/extension-table'
import { CellSelection } from '@tiptap/pm/tables'
import { NodeSelection, TextSelection } from '@tiptap/pm/state'
import { afterEach, expect, it } from 'vitest'
import { shouldShowSelectionToolbar } from './selectionToolbar'

let editor: Editor
afterEach(() => editor?.destroy())
const create = () => {
  editor = new Editor({extensions:[StarterKit,TableKit],content:'<p>before text</p><table><tbody><tr><td><p>cell text</p></td><td><p>other cell</p></td></tr></tbody></table><p>after text</p><pre><code>code text</code></pre>'})
  return editor.state.doc
}
const textAt = (text: string) => { let found = 0; editor.state.doc.descendants((node,pos) => { if(node.isText && node.text === text) found=pos }); return found }

it('shows the toolbar for a non-empty normal text selection', () => {
  const doc=create(), from=textAt('before text')
  expect(shouldShowSelectionToolbar(TextSelection.create(doc,from,from+4))).toBe(true)
})
it('rejects text selected inside a table cell', () => {
  const doc=create(), from=textAt('cell text')
  expect(shouldShowSelectionToolbar(TextSelection.create(doc,from,from+4))).toBe(false)
})
it('rejects a range spanning a table even when both ends are outside it', () => {
  const doc=create()
  expect(shouldShowSelectionToolbar(TextSelection.create(doc,textAt('before text'),textAt('after text')+3))).toBe(false)
})
it('rejects selected cells and an entire table node', () => {
  const doc=create()
  let table=0,cell=0
  doc.descendants((node,pos)=>{if(node.type.name==='table')table=pos;if(!cell && node.type.name==='tableCell')cell=pos})
  expect(shouldShowSelectionToolbar(NodeSelection.create(doc,table))).toBe(false)
  expect(shouldShowSelectionToolbar(CellSelection.create(doc,cell))).toBe(false)
})
it('rejects a caret and code-block text selections', () => {
  const doc=create(), from=textAt('code text')
  expect(shouldShowSelectionToolbar(TextSelection.create(doc,1))).toBe(false)
  expect(shouldShowSelectionToolbar(TextSelection.create(doc,from,from+4))).toBe(false)
})
