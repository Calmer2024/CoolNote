import { Extension } from '@tiptap/core'
import { DOMParser, Fragment, Slice, type Schema } from '@tiptap/pm/model'
import { Plugin } from '@tiptap/pm/state'
import { marked } from 'marked'
import { blockMarkdown } from '../export/markdownExport'
import { parseMarkdownDocument } from './markdown'

export function markdownClipboardBlocks(text: string, schema: Schema) {
  const { document } = parseMarkdownDocument(text, { preserveTitle: true })
  try {
    return document.content.map(node => schema.nodeFromJSON(node))
  } catch {
    // Smaller editors (such as jottings) gracefully flatten unsupported blocks.
    const container = window.document.createElement('div')
    container.innerHTML = marked.parse(text, { async: false })
    return DOMParser.fromSchema(schema).parse(container).content.content
  }
}

export const MarkdownClipboard = Extension.create({
  name: 'markdownClipboard',
  addProseMirrorPlugins() {
    return [new Plugin({ props: {
      clipboardTextSerializer: slice => slice.content.content.map(node => blockMarkdown(node.toJSON())).join('\n\n'),
      clipboardTextParser(text, $context, plain, view) {
        if (plain || $context.parent.type.spec.code) {
          const nodes = text.replace(/\r\n?/g, '\n').split(/\n+/).map(line => view.state.schema.nodes.paragraph.create(
            null, line ? view.state.schema.text(line, $context.marks()) : undefined,
          ))
          return Slice.maxOpen(Fragment.fromArray(nodes))
        }
        return Slice.maxOpen(Fragment.fromArray(markdownClipboardBlocks(text, view.state.schema)))
      },
    } })]
  },
})
