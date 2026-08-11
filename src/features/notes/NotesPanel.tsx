import type { NoteSummaryDto } from '../../shared/tauri/contracts'
import { Icon } from '../../shared/components/Icon'

type NotesPanelProps = {
  notes: NoteSummaryDto[]
  total: number
  selectedNoteId: string | null
  collapsed: boolean
  loading: boolean
  canLoadMore: boolean
  loadingMore: boolean
  onSelect: (noteId: string) => void
  onLoadMore: () => void
}

function noteTitle(title: string) {
  return title.trim() || '无标题笔记'
}

function noteExcerpt(excerpt: string) {
  return excerpt.trim() || '开始写下你的想法…'
}

function updatedLabel(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function NotesPanel({
  notes,
  total,
  selectedNoteId,
  collapsed,
  loading,
  canLoadMore,
  loadingMore,
  onSelect,
  onLoadMore,
}: NotesPanelProps) {
  return (
    <section
      className="notes-panel"
      aria-label="笔记列表"
      data-collapsed={collapsed}
    >
      <div className="notes-header">
        <div className="notes-heading">
          <strong>全部笔记</strong>
          <span className="notes-count">{total}</span>
        </div>
      </div>

      {loading ? (
        <div className="notes-list notes-empty" role="status">
          <span>正在打开笔记库…</span>
        </div>
      ) : notes.length ? (
        <div className="notes-list" role="listbox" aria-label="笔记列表">
          {notes.map((note) => {
            const selected = note.id === selectedNoteId
            return (
              <button
                className={`note-card${selected ? ' selected' : ''}`}
                type="button"
                role="option"
                aria-label={noteTitle(note.title)}
                aria-selected={selected}
                key={note.id}
                onClick={() => onSelect(note.id)}
              >
                <h2>{noteTitle(note.title)}</h2>
                <p>{noteExcerpt(note.excerpt)}</p>
                <div className="note-meta">
                  <time dateTime={note.updatedAt}>{updatedLabel(note.updatedAt)}</time>
                </div>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="notes-list notes-empty">
          <Icon name="file-text" className="empty-state-icon" />
          <strong>还没有笔记</strong>
          <span>点击“新建”开始记录</span>
        </div>
      )}
      {canLoadMore && (
        <button
          className="load-more-button"
          type="button"
          disabled={loadingMore}
          onClick={onLoadMore}
        >
          {loadingMore ? '正在加载…' : '加载更多笔记'}
        </button>
      )}
    </section>
  )
}
