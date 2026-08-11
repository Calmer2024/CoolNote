import { Extension } from '@tiptap/core'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Plugin } from '@tiptap/pm/state'
import { useEffect, useMemo, useRef } from 'react'

import type { NoteDto, VersionedDocument } from '../../shared/tauri/contracts'
import {
  SUPPORTED_TOP_LEVEL_NODES,
  normalizeDocument,
  toTiptapDocument,
} from './document'

export type EditorChange = {
  title: string
  documentJson: VersionedDocument
}

const StableBlockIds = Extension.create({
  name: 'stableBlockIds',

  addGlobalAttributes() {
    return [
      {
        types: [...SUPPORTED_TOP_LEVEL_NODES],
        attributes: {
          blockId: {
            default: null,
            parseHTML: (element) => element.getAttribute('data-block-id'),
            renderHTML: (attributes) =>
              attributes.blockId
                ? {
                    'data-block-id': attributes.blockId,
                    tabindex: '-1',
                  }
                : {},
          },
        },
      },
    ]
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction: (_transactions, _oldState, state) => {
          const transaction = state.tr
          let changed = false
          state.doc.forEach((node, offset) => {
            if (
              SUPPORTED_TOP_LEVEL_NODES.has(node.type.name) &&
              !node.attrs.blockId
            ) {
              transaction.setNodeMarkup(offset, undefined, {
                ...node.attrs,
                blockId: crypto.randomUUID(),
              })
              changed = true
            }
          })
          return changed ? transaction : null
        },
      }),
    ]
  },
})

type NoteEditorProps = {
  note: NoteDto
  focusTitle?: boolean
  onChange: (change: EditorChange) => void
}

export function NoteEditor({ note, focusTitle = false, onChange }: NoteEditorProps) {
  const titleRef = useRef<HTMLInputElement>(null)
  const document = useMemo(() => normalizeDocument(note.document), [note.id])
  const latestTitle = useRef(note.title)
  const latestDocument = useRef(document)

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        horizontalRule: false,
        link: false,
        underline: false,
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      StableBlockIds,
    ],
    content: toTiptapDocument(document),
    editorProps: {
      attributes: {
        class: 'note-editor-content',
        role: 'textbox',
        'aria-label': '笔记正文',
        'aria-multiline': 'true',
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      const json = currentEditor.getJSON()
      const nextDocument = normalizeDocument({
        schemaVersion: 1,
        type: 'doc',
        content: json.content ?? [],
      })
      latestDocument.current = nextDocument
      onChange({ title: latestTitle.current, documentJson: nextDocument })
    },
  })

  useEffect(() => {
    latestTitle.current = note.title
  }, [note.title])

  useEffect(() => {
    latestDocument.current = document
    editor?.commands.setContent(toTiptapDocument(document), { emitUpdate: false })
  }, [document, editor, note.id])

  useEffect(() => {
    if (focusTitle) titleRef.current?.focus()
  }, [focusTitle, note.id])

  return (
    <div className="document-body">
      <div className="document-heading">
        <input
          ref={titleRef}
          className="document-title-input"
          aria-label="笔记标题"
          value={note.title}
          placeholder="无标题笔记"
          onChange={(event) => {
            latestTitle.current = event.target.value
            onChange({
              title: event.target.value,
              documentJson: latestDocument.current,
            })
          }}
        />
        <div className="document-tags" aria-label="笔记元数据">
          <span className="document-chip">本机笔记</span>
        </div>
      </div>
      <EditorContent editor={editor} />
    </div>
  )
}
