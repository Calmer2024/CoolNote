import { TextSelection, type Selection } from '@tiptap/pm/state'
import type { Node } from '@tiptap/pm/model'

const excluded = (node: Node) => node.type.name === 'codeBlock' || !!node.type.spec.tableRole

/** Never offer the text toolbar for cells, node selections, or ranges crossing a table. */
export function shouldShowSelectionToolbar(selection: Selection): boolean {
  if (!(selection instanceof TextSelection) || selection.empty) return false
  for (const position of [selection.$from, selection.$to]) {
    for (let depth = 1; depth <= position.depth; depth++) if (excluded(position.node(depth))) return false
  }
  let blocked = false
  selection.$from.doc.nodesBetween(selection.from, selection.to, node => {
    if (excluded(node)) blocked = true
    return !blocked
  })
  return !blocked
}
