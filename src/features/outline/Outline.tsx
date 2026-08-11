import type {
  DocumentNode,
  VersionedDocument,
} from '../../shared/tauri/contracts'
import { Icon } from '../../shared/components/Icon'

export type OutlineItem = {
  blockId: string
  level: number
  text: string
}

const highlightTimers = new WeakMap<HTMLElement, number>()

function nodeText(node: DocumentNode): string {
  if (typeof node.text === 'string') return node.text
  return node.content?.map(nodeText).join('') ?? ''
}

export function deriveOutline(document: VersionedDocument): OutlineItem[] {
  return document.content.flatMap((node) => {
    if (node.type !== 'heading') return []
    const blockId = node.attrs?.blockId
    const level = node.attrs?.level
    const text = nodeText(node).trim()
    if (typeof blockId !== 'string' || typeof level !== 'number' || !text) {
      return []
    }
    return [{ blockId, level, text }]
  })
}

function navigateToBlock(blockId: string) {
  const block = globalThis.document.querySelector<HTMLElement>(
    `[data-block-id="${blockId}"]`,
  )
  if (!block) return

  block.scrollIntoView({ behavior: 'smooth', block: 'center' })
  block.focus({ preventScroll: true })
  block.dataset.outlineHighlight = 'true'
  const previousTimer = highlightTimers.get(block)
  if (previousTimer !== undefined) window.clearTimeout(previousTimer)
  const timer = window.setTimeout(() => {
    if (block.dataset.outlineHighlight === 'true') {
      delete block.dataset.outlineHighlight
    }
    highlightTimers.delete(block)
  }, 1200)
  highlightTimers.set(block, timer)
}

type OutlineProps = {
  items: OutlineItem[]
  collapsed?: boolean
  onToggle?: () => void
}

export function Outline({ items, collapsed = false, onToggle }: OutlineProps) {
  return (
    <aside
      className="outline"
      aria-label="文章大纲"
      data-collapsed={collapsed}
    >
      <div className="outline-header">
        <button
          className="outline-title-toggle"
          type="button"
          aria-label={collapsed ? '展开大纲' : '收起大纲'}
          onClick={onToggle}
        >
          <Icon name="list-tree" testId="outline-toggle-icon" />
          <span>文章大纲</span>
        </button>
      </div>
      <nav aria-label="大纲导航">
        {items.map((item) => (
          <button
            className="outline-link"
            type="button"
            key={item.blockId}
            style={{ paddingLeft: `${5 + (item.level - 1) * 12}px` }}
            onClick={() => navigateToBlock(item.blockId)}
          >
            {item.text}
          </button>
        ))}
        {!items.length && <span className="outline-empty">暂无标题</span>}
      </nav>
    </aside>
  )
}
