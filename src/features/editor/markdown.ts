import { marked } from 'marked'

import type { DocumentNode, VersionedDocument } from '../../shared/tauri/contracts'
import { normalizeDocument } from './document'

type MarkdownToken = Record<string, any>
type Mark = NonNullable<DocumentNode['marks']>[number]

const textNode = (text: string, marks: Mark[] = []): DocumentNode => ({
  type: 'text',
  text,
  ...(marks.length ? { marks } : {}),
})

function decoratedText(text: string, marks: Mark[]) {
  const nodes: DocumentNode[] = []
  const pattern = /(==([^=\n]+)==|\$([^$\n]+)\$)/g
  let offset = 0
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0
    if (index > offset) nodes.push(textNode(text.slice(offset, index), marks))
    if (match[2]) nodes.push(textNode(match[2], [...marks, { type: 'highlight' }]))
    if (match[3]) nodes.push({ type: 'inlineMath', attrs: { latex: match[3].trim() } })
    offset = index + match[0].length
  }
  if (offset < text.length) nodes.push(textNode(text.slice(offset), marks))
  return nodes
}

function inlineNodes(tokens: MarkdownToken[] = [], marks: Mark[] = []): DocumentNode[] {
  return tokens.flatMap((token): DocumentNode[] => {
    switch (token.type) {
      case 'text':
      case 'escape':
        return decoratedText(token.text ?? token.raw ?? '', marks)
      case 'strong':
        return inlineNodes(token.tokens, [...marks, { type: 'bold' }])
      case 'em':
        return inlineNodes(token.tokens, [...marks, { type: 'italic' }])
      case 'del':
        return inlineNodes(token.tokens, [...marks, { type: 'strike' }])
      case 'codespan':
        return [textNode(token.text ?? '', [...marks, { type: 'code' }])]
      case 'link':
        return inlineNodes(token.tokens, [...marks, { type: 'link', attrs: { href: token.href, target: '_blank', rel: 'noopener noreferrer nofollow' } }])
      case 'image':
        return [{ type: 'image', attrs: { src: token.href, alt: token.text || null, title: token.title || null } }]
      case 'br':
        return [{ type: 'hardBreak' }]
      case 'html':
        return decoratedText(token.text ?? token.raw ?? '', marks)
      default:
        return token.tokens ? inlineNodes(token.tokens, marks) : decoratedText(token.text ?? '', marks)
    }
  })
}

const paragraph = (tokens: MarkdownToken[] = []): DocumentNode => ({ type: 'paragraph', content: inlineNodes(tokens) })

function listItemContent(item: MarkdownToken) {
  const children: DocumentNode[] = []
  for (const token of item.tokens ?? []) {
    if (token.type === 'checkbox') continue
    if (token.type === 'text') {
      children.push(paragraph(token.tokens ?? [{ type: 'text', text: token.text }]))
    } else {
      children.push(...blockNodes([token]))
    }
  }
  return children.length ? children : [paragraph()]
}

function listNode(token: MarkdownToken): DocumentNode {
  const isTaskList = token.items?.some((item: MarkdownToken) => item.task)
  const type = isTaskList ? 'taskList' : token.ordered ? 'orderedList' : 'bulletList'
  return {
    type,
    ...(type === 'orderedList' && Number(token.start) > 1 ? { attrs: { start: Number(token.start) } } : {}),
    content: (token.items ?? []).map((item: MarkdownToken) => ({
      type: isTaskList ? 'taskItem' : 'listItem',
      ...(isTaskList ? { attrs: { checked: Boolean(item.checked) } } : {}),
      content: listItemContent(item),
    })),
  }
}

function tableNode(token: MarkdownToken): DocumentNode {
  const row = (cells: MarkdownToken[], header: boolean): DocumentNode => ({
    type: 'tableRow',
    content: cells.map(cell => ({
      type: header ? 'tableHeader' : 'tableCell',
      attrs: { colspan: 1, rowspan: 1, colwidth: null },
      content: [paragraph(cell.tokens)],
    })),
  })
  return { type: 'table', content: [row(token.header ?? [], true), ...(token.rows ?? []).map((cells: MarkdownToken[]) => row(cells, false))] }
}

function blockNodes(tokens: MarkdownToken[] = []): DocumentNode[] {
  return tokens.flatMap((token): DocumentNode[] => {
    switch (token.type) {
      case 'space':
        return []
      case 'heading':
        return [{ type: 'heading', attrs: { level: Math.min(5, Math.max(1, token.depth)) }, content: inlineNodes(token.tokens) }]
      case 'paragraph': {
        const math = token.text?.match(/^\s*\$\$([\s\S]+)\$\$\s*$/)
        return math ? [{ type: 'blockMath', attrs: { latex: math[1].trim() } }] : [paragraph(token.tokens)]
      }
      case 'text':
        return [paragraph(token.tokens ?? [{ type: 'text', text: token.text }])]
      case 'list':
        return [listNode(token)]
      case 'blockquote':
        return [{ type: 'blockquote', content: blockNodes(token.tokens) }]
      case 'code':
        return token.lang?.trim().toLowerCase() === 'mermaid'
          ? [{ type: 'mermaid', attrs: { source: token.text ?? '' } }]
          : [{ type: 'codeBlock', attrs: { language: token.lang?.trim() || null }, content: token.text ? [textNode(token.text)] : [] }]
      case 'table':
        return [tableNode(token)]
      case 'hr':
        return [{ type: 'horizontalRule' }]
      case 'html':
        return [paragraph([{ type: 'text', text: token.raw ?? '' }])]
      default:
        return token.tokens ? blockNodes(token.tokens) : []
    }
  })
}

export function parseMarkdownDocument(content: string): { title: string; document: VersionedDocument } {
  const tokens = marked.lexer(content.replace(/\r\n?/g, '\n'), { gfm: true, breaks: false }) as MarkdownToken[]
  const firstHeading = tokens.findIndex(token => token.type === 'heading' && token.depth === 1)
  const titleToken = firstHeading >= 0 ? tokens[firstHeading] : undefined
  const bodyTokens = firstHeading >= 0 ? tokens.filter((_, index) => index !== firstHeading) : tokens
  const contentNodes = blockNodes(bodyTokens).map(node => ({
    ...node,
    attrs: { ...node.attrs, blockId: crypto.randomUUID() },
  }))
  return {
    title: titleToken?.text?.trim() || '导入笔记',
    document: normalizeDocument({
      schemaVersion: 1,
      type: 'doc',
      content: contentNodes.length ? contentNodes : [{ type: 'paragraph', attrs: { blockId: crypto.randomUUID() }, content: [] }],
    }),
  }
}
