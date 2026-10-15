// @vitest-environment jsdom
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { expect, it } from 'vitest'
import { StableBlockIds } from './NoteEditor'
import { normalizeDocument } from './document'
import { noteToMarkdown } from '../export/markdownExport'
import { createSnapshotSerializer } from './editorSnapshot'

it('reuses unchanged blocks while snapshots and Markdown stay equivalent through edit and undo', () => {
  const editor=new Editor({extensions:[StarterKit,StableBlockIds],content:{type:'doc',content:[
    {type:'heading',attrs:{level:2,blockId:'10000000-0000-4000-8000-000000000001'},content:[{type:'text',text:'标题',marks:[{type:'bold'}]}]},
    {type:'paragraph',attrs:{blockId:'10000000-0000-4000-8000-000000000002'},content:[{type:'text',text:'正文'}]},
  ]}})
  const serialize=createSnapshotSerializer()
  const before=serialize(editor.state.doc,'测试')
  editor.commands.insertContentAt(2,'新')
  const after=serialize(editor.state.doc,'更名')
  expect(after.documentJson.content[1]).toBe(before.documentJson.content[1])
  expect(after.documentJson.content[0]).not.toBe(before.documentJson.content[0])
  const expected=normalizeDocument({schemaVersion:1,type:'doc',content:editor.state.doc.toJSON().content})
  expect(after.documentJson).toEqual(expected)
  expect(after.markdownSnapshot).toBe(noteToMarkdown('更名',expected))
  // Snapshots already queued for saving must remain immutable.
  expect(before.markdownSnapshot).not.toContain('新')
  editor.commands.undo()
  const undone=serialize(editor.state.doc,'撤销')
  const restored=normalizeDocument({schemaVersion:1,type:'doc',content:editor.state.doc.toJSON().content})
  expect(undone.documentJson).toEqual(restored)
  expect(undone.markdownSnapshot).toBe(noteToMarkdown('撤销',restored))
  editor.destroy()
})
