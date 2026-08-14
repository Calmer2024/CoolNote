import type {
  DocumentNode,
  VersionedDocument,
} from '../../shared/tauri/contracts'

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const SUPPORTED_TOP_LEVEL_NODES = new Set([
  'paragraph',
  'heading',
  'bulletList',
  'orderedList',
  'taskList',
  'blockquote',
  'codeBlock',
  'image',
  'table',
  'blockMath',
  'mermaid',
])

const SUPPORTED_NODES = new Set([
  ...SUPPORTED_TOP_LEVEL_NODES,
  'listItem',
  'taskItem',
  'text',
  'hardBreak',
  'image',
  'table',
  'tableRow',
  'tableHeader',
  'tableCell',
  'blockMath',
  'inlineMath',
  'mermaid',
])

const SUPPORTED_MARKS = new Set(['bold', 'italic', 'strike', 'code', 'underline', 'link'])

const ALLOWED_CHILDREN: Record<string, Set<string>> = {
  paragraph: new Set(['text', 'hardBreak', 'inlineMath', 'image']),
  heading: new Set(['text', 'hardBreak', 'inlineMath', 'image']),
  codeBlock: new Set(['text']),
  bulletList: new Set(['listItem']),
  orderedList: new Set(['listItem']),
  taskList: new Set(['taskItem']),
  table: new Set(['tableRow']),
  tableRow: new Set(['tableHeader', 'tableCell']),
  tableHeader: new Set(['paragraph', 'heading', 'bulletList', 'orderedList', 'taskList', 'blockquote', 'codeBlock', 'image', 'blockMath']),
  tableCell: new Set(['paragraph', 'heading', 'bulletList', 'orderedList', 'taskList', 'blockquote', 'codeBlock', 'image', 'blockMath']),
  listItem: new Set([
    'paragraph',
    'heading',
    'bulletList',
    'orderedList',
    'taskList',
    'blockquote',
    'codeBlock',
  ]),
  taskItem: new Set([
    'paragraph',
    'heading',
    'bulletList',
    'orderedList',
    'taskList',
    'blockquote',
    'codeBlock',
  ]),
  blockquote: new Set([
    'paragraph',
    'heading',
    'bulletList',
    'orderedList',
    'taskList',
    'blockquote',
    'codeBlock',
  ]),
  text: new Set(),
  hardBreak: new Set(),
  image: new Set(),
  blockMath: new Set(),
  inlineMath: new Set(),
  mermaid: new Set(),
}

function validateNode(node: DocumentNode) {
  if (!SUPPORTED_NODES.has(node.type)) {
    throw new Error(`不支持的文档节点：${node.type}`)
  }
  for (const mark of node.marks ?? []) {
    if (!SUPPORTED_MARKS.has(mark.type)) {
      throw new Error(`不支持的文档标记：${mark.type}`)
    }
  }
  const allowedChildren = ALLOWED_CHILDREN[node.type]
  for (const child of node.content ?? []) {
    if (!SUPPORTED_NODES.has(child.type)) {
      throw new Error(`不支持的文档节点：${child.type}`)
    }
    if (!allowedChildren?.has(child.type)) {
      throw new Error(`节点 ${node.type} 不能包含 ${child.type}`)
    }
    validateNode(child)
  }
}

function normalizeTopLevelNode(node: DocumentNode): DocumentNode {
  if (!SUPPORTED_TOP_LEVEL_NODES.has(node.type)) {
    throw new Error(`不支持的文档节点：${node.type}`)
  }
  validateNode(node)
  if (
    node.type === 'heading' &&
    (!Number.isInteger(node.attrs?.level) ||
      ![1, 2, 3].includes(node.attrs?.level as number))
  ) {
    throw new Error('标题级别必须为 1、2 或 3')
  }

  const blockId = node.attrs?.blockId
  if (typeof blockId === 'string' && UUID_PATTERN.test(blockId)) {
    return structuredClone(node)
  }

  if (blockId !== undefined && blockId !== null) {
    throw new Error(`无效的块标识：${String(blockId)}`)
  }

  return {
    ...structuredClone(node),
    attrs: {
      ...node.attrs,
      blockId: crypto.randomUUID(),
    },
  }
}

export function normalizeDocument(document: VersionedDocument): VersionedDocument {
  if (document.schemaVersion !== 1 || document.type !== 'doc') {
    throw new Error('不支持的文档版本')
  }

  return {
    schemaVersion: 1,
    type: 'doc',
    content: document.content.map(normalizeTopLevelNode),
  }
}

export function toTiptapDocument(document: VersionedDocument) {
  const normalized = normalizeDocument(document)
  return { type: normalized.type, content: normalized.content }
}
