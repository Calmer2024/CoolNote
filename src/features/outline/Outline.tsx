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
let activeNavigator: ((blockId: string) => HTMLElement | null) | null = null

export function registerOutlineNavigator(navigator: ((blockId: string) => HTMLElement | null) | null) {
  activeNavigator = navigator
}

function nodeText(node: DocumentNode): string {
  if (typeof node.text === 'string') return node.text
  return node.content?.map(nodeText).join('') ?? ''
}

export function deriveOutline(document: VersionedDocument): OutlineItem[] {
  const seen = new Set<string>()
  return document.content.flatMap((node) => {
    if (node.type !== 'heading') return []
    const blockId = node.attrs?.blockId
    const level = node.attrs?.level
    const text = nodeText(node).trim()
    if (typeof blockId !== 'string' || typeof level !== 'number' || !text || seen.has(blockId)) {
      return []
    }
    seen.add(blockId)
    return [{ blockId, level, text }]
  })
}

function highlightBlock(block: HTMLElement) {
  const scroller = block.closest<HTMLElement>('.document-body')
  if (scroller) {
    const scrollerRect = scroller.getBoundingClientRect()
    const blockRect = block.getBoundingClientRect()
    const targetTop = scroller.scrollTop + blockRect.top - scrollerRect.top -
      (scroller.clientHeight - blockRect.height) / 2
    const maxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight)
    scroller.scrollTo({ top: Math.max(0, Math.min(maxTop, targetTop)), behavior: 'auto' })
  } else {
    block.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' })
  }
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
  onNavigate?: (blockId: string) => HTMLElement | null
}

export function Outline({ items, collapsed = false, onToggle, onNavigate }: OutlineProps) {
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
          aria-expanded={!collapsed}
          onClick={onToggle}
        >
          <Icon name="list-ordered" testId="outline-toggle-icon" />
          <span>文章大纲</span>
        </button>
      </div>
      <nav aria-label="大纲导航" inert={collapsed} aria-hidden={collapsed}>
        {items.map((item) => (
          <button
            className="outline-link"
            type="button"
            key={item.blockId}
            style={{ paddingLeft: `${5 + (item.level - 1) * 12}px` }}
            onClick={() => {
              const block = (onNavigate ?? activeNavigator)?.(item.blockId) ?? null
              if (block) highlightBlock(block)
            }}
          >
            {item.text}
          </button>
        ))}
        {!items.length && <span className="outline-empty">暂无标题</span>}
      </nav>
    </aside>
  )
}
