import { Node, mergeAttributes } from '@tiptap/core'
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react'
import { Icon } from '../../shared/components/Icon'

import { resourceIcons, resourceLabels, resourceHref, type ResourceTarget } from './resourceTarget'
export type { ResourceTarget, ResourceKind } from './resourceTarget'

function ReferenceView({ node, extension, selected }: NodeViewProps) {
  const target = node.attrs as ResourceTarget
  return <NodeViewWrapper className={`editor-resource-reference${selected ? ' selected' : ''}`} data-block-id={node.attrs.blockId} contentEditable={false}>
    <button type="button" className="resource-reference-card" onClick={() => extension.options.onOpen(target)} aria-label={`打开${resourceLabels[target.kind]}：${target.title}`}>
      <span className={`resource-reference-icon ${target.kind}`}><Icon name={resourceIcons[target.kind]} /></span>
      <span className="resource-reference-copy"><strong>{target.title || '无标题'}</strong><small>{resourceLabels[target.kind]}{target.path ? ` · ${target.path}` : ''}</small></span>
      <Icon name="chevron-right" />
    </button>
  </NodeViewWrapper>
}

export const ResourceReference = Node.create<{ onOpen: (target: ResourceTarget) => void }>({
  name: 'resourceReference', group: 'block', atom: true, draggable: true,
  addOptions() { return { onOpen: () => {} } },
  addAttributes() {
    return Object.fromEntries(['kind', 'id', 'title', 'path'].map(key => [key, {
      default: key === 'kind' ? 'note' : '',
      parseHTML: (element: HTMLElement) => element.getAttribute(`data-resource-${key}`) ?? (key === 'kind' ? 'note' : ''),
      renderHTML: (attrs: Record<string, unknown>) => ({ [`data-resource-${key}`]: attrs[key] }),
    }]))
  },
  parseHTML() { return [{ tag: 'a[data-type="resource-reference"]', getAttrs: element => {
    const kind = element.getAttribute('data-resource-kind')
    return ['note', 'jotting', 'gallery'].includes(kind ?? '') && !!element.getAttribute('data-resource-id') ? null : false
  } }] },
  renderHTML({ node, HTMLAttributes }) {
    return ['a', mergeAttributes(HTMLAttributes, { 'data-type': 'resource-reference', href: resourceHref(node.attrs.kind, node.attrs.id) }), node.attrs.title || '无标题']
  },
  renderText({ node }) { return node.attrs.title || '无标题' },
  addNodeView() { return ReactNodeViewRenderer(ReferenceView) },
})
