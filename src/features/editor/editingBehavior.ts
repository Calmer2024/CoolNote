import { Extension } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { MarkdownClipboard } from './markdownClipboard'
import { EditorState, Plugin } from '@tiptap/pm/state'
import { liftListItem } from '@tiptap/pm/schema-list'
import { isHistoryTransaction } from '@tiptap/pm/history'
import { liftTarget, Mapping } from '@tiptap/pm/transform'

const leafText = (node: ProseMirrorNode) => node.type.name === 'hardBreak' ? '\n' : String(node.attrs.latex ?? node.attrs.alt ?? '')

export function tablePlainText(table: ProseMirrorNode): string {
  const rows: string[] = []
  table.forEach(row => {
    const cells: string[] = []
    row.forEach(cell => {
      const value = cell.textBetween(0, cell.content.size, '\n', leafText)
      cells.push(/[\t\n"]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value)
    })
    rows.push(cells.join('\t'))
  })
  return rows.join('\n')
}

export const EditingBehavior = Extension.create({
  name: 'editingBehavior',
  priority: 110,
  addExtensions() { return [MarkdownClipboard] },
  addKeyboardShortcuts() {
    return {
      Backspace: () => {
        const { state, view } = this.editor
        const { $from, empty } = state.selection
        if (view.composing || !empty || !$from.depth || !$from.parent.isTextblock || $from.parent.content.size) return false
        const wrappers = ['listItem', 'taskItem', 'blockquote', 'highlightBlock']
        const hasWrapper = $from.depth > 1 && wrappers.includes($from.node($from.depth - 1).type.name)
        if ($from.parent.type.name === 'paragraph' && !hasWrapper && !state.storedMarks?.length) return false
        const tr = state.tr.setNodeMarkup($from.before(), state.schema.nodes.paragraph, { blockId: $from.parent.attrs.blockId })
        // Lift only this line, leaving sibling blocks and table cells intact.
        for (let remaining = $from.depth; remaining > 1; remaining--) {
          const cursor = tr.selection.$from
          const wrapper = cursor.node(cursor.depth - 1)
          if (wrapper.type.name === 'listItem' || wrapper.type.name === 'taskItem') {
            const current = EditorState.create({ schema: state.schema, doc: tr.doc, selection: tr.selection })
            if (!liftListItem(wrapper.type)(current, lifted => {
              lifted.steps.forEach(step => tr.step(step))
              tr.setSelection(lifted.selection.getBookmark().resolve(tr.doc))
            })) break
          } else if (wrapper.type.name === 'blockquote' || wrapper.type.name === 'highlightBlock') {
            const range = cursor.blockRange()
            const target = range && liftTarget(range)
            if (!range || target == null) break
            tr.lift(range, target)
          } else break
        }
        view.dispatch(tr.setStoredMarks([]))
        return true
      },
    }
  },
  addProseMirrorPlugins() {
    return [new Plugin({
      filterTransaction(transaction, state) {
        const { $from, $to } = state.selection
        const next = transaction.selection
        // Tiptap also clears a document when all its text was selected. Keep a
        // single emptied textblock formatted for the same Backspace behavior.
        if (transaction.docChanged && $from.sameParent($to) && $from.parent.isTextblock &&
            next.empty && next.$from.parent.isTextblock && !next.$from.parent.content.size &&
            next.$from.parent.type === $from.parent.type) {
          transaction.setMeta('preventClearDocument', true)
        }
        return true
      },
      props: {
        handleDOMEvents: {
          dragstart(view, event) {
            const target = event.target instanceof Element ? event.target : null
            const { $from } = view.state.selection
            const inTable = Array.from({ length: $from.depth }, (_, index) => $from.node(index + 1).type.name).includes('table')
            if (!target?.closest('table') && !inTable) return false
            event.preventDefault()
            return true
          },
        },
      },
      appendTransaction(transactions, oldState, state) {
        if (transactions.some(isHistoryTransaction)) return null
        // Do not carry delimiter marks across Markdown input rules.
        const inputRules = state.plugins.filter(plugin => plugin.spec.isInputRules)
        if (transactions.some(transaction => inputRules.some(plugin => transaction.getMeta(plugin)))) return null
        let deletedContent = false
        transactions.forEach(transaction => transaction.steps.forEach(step => step.getMap().forEach((oldStart, oldEnd, newStart, newEnd) => {
          if (oldEnd - oldStart > newEnd - newStart) deletedContent = true
        })))
        if (!deletedContent || !state.selection.empty) return null
        const { $from } = state.selection
        if (!$from.depth || !$from.parent.isTextblock || $from.parent.content.size) return null
        const mapping = new Mapping()
        transactions.forEach(transaction => mapping.appendMapping(transaction.mapping))
        const previous = oldState.doc.resolve(mapping.invert().map($from.start(), -1)).parent
        if (!previous.isTextblock || !previous.content.size) return null
        const marks = oldState.storedMarks ?? oldState.selection.$from.marks()
        if (!marks.length || state.storedMarks !== null || !$from.parent.type.allowsMarks(marks)) return null
        return state.tr.setStoredMarks(marks)
      },
    })]
  },
})
