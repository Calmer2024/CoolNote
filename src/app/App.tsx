import { useMemo, useState } from 'react'

import { NoteEditor } from '../features/editor/NoteEditor'
import { useNotes } from '../features/notes/useNotes'
import { NotesPanel } from '../features/notes/NotesPanel'
import { deriveOutline, Outline } from '../features/outline/Outline'
import { Icon } from '../shared/components/Icon'

const deferredItems = [
  { label: '日程', icon: 'calendar-days' },
  { label: '收藏', icon: 'star' },
  { label: '回收站', icon: 'trash-2' },
]

export function App() {
  const notes = useNotes()
  const [notesCollapsed, setNotesCollapsed] = useState(false)
  const [outlineCollapsed, setOutlineCollapsed] = useState(false)
  const [focusTitleNoteId, setFocusTitleNoteId] = useState<string | null>(null)

  const outlineItems = useMemo(
    () => (notes.selectedNote ? deriveOutline(notes.selectedNote.document) : []),
    [notes.selectedNote],
  )

  const handleCreate = async () => {
    const created = await notes.create()
    if (created) setFocusTitleNoteId(created.id)
  }

  return (
    <>
      <header className="app-header">
        <button
          className="search-box"
          type="button"
          aria-label="搜索笔记"
          title="后续里程碑提供"
          disabled
        >
          <Icon name="search" />
          <span className="search-placeholder">搜索笔记...</span>
          <kbd>Ctrl K</kbd>
        </button>
        <div className="header-actions">
          <button
            className="icon-button theme-button"
            type="button"
            aria-label="切换主题"
            title="后续里程碑提供"
            disabled
          >
            <Icon name="sun" />
          </button>
          <button
            className="new-note-button"
            type="button"
            disabled={notes.status !== 'ready' || notes.isCreating}
            onClick={() => void handleCreate()}
          >
            <Icon name="plus" />
            <span>{notes.isCreating ? '新建中…' : '新建'}</span>
          </button>
        </div>
      </header>

      <main className="workspace" data-notes-collapsed={notesCollapsed}>
        <aside className="sidebar" aria-label="主导航">
          <div className="sidebar-header">
            <div className="brand">
              <img src="/assets/logo.svg" width="42" height="42" alt="" />
              <span>CoolNote</span>
            </div>
          </div>
          <div className="sidebar-content">
            <nav className="primary-nav" aria-label="系统视图">
              <button className="nav-item active" type="button" aria-current="page">
                <Icon name="file-text" />
                <span>全部笔记</span>
              </button>
              {deferredItems.map((item) => (
                <button
                  className="nav-item"
                  type="button"
                  key={item.label}
                  disabled
                  title="后续里程碑提供"
                >
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                </button>
              ))}
            </nav>
            <div className="section-label">分类</div>
            <p className="sidebar-empty">分类将在后续里程碑提供</p>
          </div>
        </aside>

        <NotesPanel
          notes={notes.notes}
          total={notes.total}
          selectedNoteId={notes.selectedNoteId}
          collapsed={notesCollapsed}
          loading={notes.status === 'booting'}
          canLoadMore={notes.notes.length < notes.total}
          loadingMore={notes.isLoadingMore}
          onLoadMore={() => void notes.loadMore()}
          onSelect={(noteId) => {
            setFocusTitleNoteId(null)
            void notes.select(noteId)
          }}
        />

        <section className="document-panel" aria-label="笔记工作区">
          <div className="document-toolbar">
            <button
              className="icon-button panel-toggle"
              type="button"
              aria-label={notesCollapsed ? '展开笔记列表' : '收起笔记列表'}
              title={notesCollapsed ? '展开笔记列表' : '收起笔记列表'}
              onClick={() => setNotesCollapsed((value) => !value)}
            >
              <Icon name={notesCollapsed ? 'panel-left-open' : 'panel-left-close'} />
            </button>
            <div className="document-actions">
              <span className="save-status" aria-live="polite" />
            </div>
          </div>

          {notes.error && notes.status !== 'failed' && (
            <div className="command-error" role="alert">
              <Icon name="circle-alert" />
              <span>{notes.error}</span>
            </div>
          )}

          {notes.status === 'failed' ? (
            <div className="document-empty" role="alert">
              <Icon name="circle-alert" className="empty-document-icon" />
              <h1>无法打开笔记库</h1>
              <p>{notes.error}</p>
              <button className="retry-button" type="button" onClick={() => void notes.retry()}>
                重试
              </button>
            </div>
          ) : (
            <div
              className="reading-layout"
              data-outline-collapsed={outlineCollapsed}
            >
              {notes.selectedNote ? (
                <NoteEditor
                  key={notes.selectedNote.id}
                  note={notes.selectedNote}
                  focusTitle={focusTitleNoteId === notes.selectedNote.id}
                  onChange={({ title, documentJson }) =>
                    notes.updateDraft(notes.selectedNote!.id, title, documentJson)
                  }
                />
              ) : (
                <div className="document-empty">
                  <Icon name="book-open-text" className="empty-document-icon" />
                  <h1>
                    {notes.status === 'booting'
                      ? '正在打开笔记库…'
                      : notes.isLoadingNote
                        ? '正在打开笔记…'
                      : '选择或新建一篇笔记'}
                  </h1>
                  <p>你的内容将保存在本机笔记库中。</p>
                </div>
              )}
              <Outline
                items={outlineItems}
                collapsed={outlineCollapsed}
                onToggle={() => setOutlineCollapsed((value) => !value)}
              />
            </div>
          )}
        </section>
      </main>
    </>
  )
}
