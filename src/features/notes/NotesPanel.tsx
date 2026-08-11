import { useEffect, useState } from 'react'

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
  const selectedIndex = notes.findIndex((note) => note.id === selectedNoteId)
  const [activeIndex, setActiveIndex] = useState(
    selectedIndex >= 0 ? selectedIndex : notes.length ? 0 : -1,
  )

  useEffect(() => {
    setActiveIndex((current) => {
      if (!notes.length) return -1
      if (selectedIndex >= 0) return selectedIndex
      return Math.min(Math.max(current, 0), notes.length - 1)
    })
  }, [notes, selectedIndex])

  const handleListKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!notes.length) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((current) => Math.min(Math.max(current, 0) + 1, notes.length - 1))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((current) => Math.max(current <= 0 ? 0 : current - 1, 0))
      return
    }
    if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault()
      onSelect(notes[activeIndex].id)
    }
  }

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
        <div
          className="notes-list"
          role="listbox"
          aria-label="笔记列表"
          aria-activedescendant={
            activeIndex >= 0 ? `note-option-${notes[activeIndex].id}` : undefined
          }
          tabIndex={0}
          onKeyDown={handleListKeyDown}
        >
          {notes.map((note, index) => {
            const selected = note.id === selectedNoteId
            return (
              <button
                id={`note-option-${note.id}`}
                className={`note-card${selected ? ' selected' : ''}`}
                type="button"
                role="option"
                aria-label={noteTitle(note.title)}
                aria-selected={selected}
                data-active={index === activeIndex}
                tabIndex={-1}
                key={note.id}
                onClick={() => {
                  setActiveIndex(index)
                  onSelect(note.id)
                }}
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
