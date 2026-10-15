import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { DocumentNode, VersionedDocument } from '../../shared/tauri/contracts'
import { blockMarkdown, joinMarkdownSnapshot } from '../export/markdownExport'
import { normalizeDocument } from './document'

// ProseMirror nodes are immutable. Unchanged blocks can reuse their validated JSON
// and Markdown without rescanning or allocating the entire document after each edit.
export function createSnapshotSerializer() {
  const blocks = new WeakMap<ProseMirrorNode, { json:DocumentNode; markdown:string }>()
  return (doc:ProseMirrorNode, title:string) => {
    const content:DocumentNode[] = [], markdown:string[] = [], ids=new Set<string>()
    doc.forEach(node => {
      let block=blocks.get(node)
      if (!block) {
        const json=normalizeDocument({schemaVersion:1,type:'doc',content:[node.toJSON()]}).content[0]
        block={json,markdown:blockMarkdown(json)}
        blocks.set(node,block)
      }
      let json=block.json
      const id=String(json.attrs?.blockId)
      if (ids.has(id)) json={...json,attrs:{...json.attrs,blockId:crypto.randomUUID()}}
      ids.add(String(json.attrs?.blockId))
      content.push(json); markdown.push(block.markdown)
    })
    const documentJson:VersionedDocument={schemaVersion:1,type:'doc',content}
    return { documentJson, markdownSnapshot:joinMarkdownSnapshot(title,markdown) }
  }
}
