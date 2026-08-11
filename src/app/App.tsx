import { getCurrentWindow } from '@tauri-apps/api/window'
import { useEffect, useMemo, useState } from 'react'

import { NoteEditor } from '../features/editor/NoteEditor'
import { useNotes } from '../features/notes/useNotes'
import { NotesPanel } from '../features/notes/NotesPanel'
import { deriveOutline, Outline } from '../features/outline/Outline'
import { RecoveryDialog } from '../features/recovery/RecoveryDialog'
import { SaveStatus } from '../features/save/SaveStatus'
import { useSaveCoordinator } from '../features/save/useSaveCoordinator'
import { ThemeButton } from '../features/theme/ThemeButton'
import { Icon } from '../shared/components/Icon'
import {
  getNote,
  listRecoveryCandidates,
  resolveRecovery,
} from '../shared/tauri/commands'
import type { RecoveryCandidateDto } from '../shared/tauri/contracts'

const deferredItems = [
  { label: '日程', icon: 'calendar-days' },
  { label: '收藏', icon: 'star' },
  { label: '回收站', icon: 'trash-2' },
]

export function App() {
  const notes = useNotes()
  const { coordinator, state: saveState, recoverySafeFailure } = useSaveCoordinator()
  const [notesCollapsed, setNotesCollapsed] = useState(false)
  const [outlineCollapsed, setOutlineCollapsed] = useState(false)
  const [focusTitleNoteId, setFocusTitleNoteId] = useState<string | null>(null)
  const [recoveryCandidates, setRecoveryCandidates] = useState<RecoveryCandidateDto[]>([])
  const [recoveryBusy, setRecoveryBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [editorVersion, setEditorVersion] = useState(0)
  const recoveryCandidate = recoveryCandidates[0] ?? null

  const outlineItems = useMemo(
    () => (notes.selectedNote ? deriveOutline(notes.selectedNote.document) : []),
    [notes.selectedNote],
  )

  const flushBeforeLeaving = async () => {
    const result = await coordinator.flush()
    if (result === 'blocked') {
      setSaveError('当前内容无法安全保存，请先修正后再切换笔记。')
      return false
    }
    return true
  }

  const handleCreate = async () => {
    if (!(await flushBeforeLeaving())) return
    const created = await notes.create()
    if (created) setFocusTitleNoteId(created.id)
  }

  const handleSelect = async (noteId: string) => {
    if (!(await flushBeforeLeaving())) return
    setFocusTitleNoteId(null)
    await notes.select(noteId)
  }

  const handleRestoreDraft = async () => {
    if (!recoveryCandidate) return
    setRecoveryBusy(true)
    setSaveError(null)
    try {
      if (!(await flushBeforeLeaving())) return
      const draft = await resolveRecovery(recoveryCandidate.draft.noteId, 'restoreDraft')
      if (!draft) {
        setSaveError('恢复草稿已不可用，请保留当前数据库版本。')
        return
      }
      const databaseNote = await getNote(draft.noteId)
      notes.applyRecoveredDraft(databaseNote, draft)
      coordinator.enqueue({
        noteId: databaseNote.id,
        baseRevision: databaseNote.revision,
        title: draft.title,
        documentJson: draft.documentJson,
      })
      coordinator.markRecovered()
      setEditorVersion((value) => value + 1)
      setRecoveryCandidates((candidates) => candidates.slice(1))
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : '恢复草稿失败，请重试。')
    } finally {
      setRecoveryBusy(false)
    }
  }

  const handleKeepDatabaseVersion = async () => {
    if (!recoveryCandidate) return
    setRecoveryBusy(true)
    setSaveError(null)
    try {
      await resolveRecovery(recoveryCandidate.draft.noteId, 'keepDatabaseVersion')
      setRecoveryCandidates((candidates) => candidates.slice(1))
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : '无法处理恢复草稿，请重试。')
    } finally {
      setRecoveryBusy(false)
    }
  }

  useEffect(() => {
    if (notes.status !== 'ready') return
    let active = true
    void listRecoveryCandidates()
      .then((candidates) => {
        if (active) setRecoveryCandidates(candidates)
      })
      .catch((cause) => {
        if (active) {
          setSaveError(cause instanceof Error ? cause.message : '无法检查恢复草稿。')
        }
      })
    return () => {
      active = false
    }
  }, [notes.status])

  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return
    let unlisten: (() => void) | undefined
    let disposed = false
    let allowClose = false

    void getCurrentWindow()
      .onCloseRequested(async (event) => {
        if (allowClose) return
        event.preventDefault()
        if ((await coordinator.flush()) === 'blocked') {
          setSaveError('当前内容无法安全保存，已取消关闭。')
          return
        }
        allowClose = true
        await getCurrentWindow().close()
      })
      .then((release) => {
        if (disposed) release()
        else unlisten = release
      })
      .catch((cause) => {
        if (!disposed) {
          setSaveError(cause instanceof Error ? cause.message : '无法注册关闭监听。')
        }
      })

    return () => {
      disposed = true
      unlisten?.()
    }
  }, [coordinator])

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
          <ThemeButton
            library={notes.library}
            onLibraryChange={notes.updateLibrary}
            onError={(message) => setSaveError(message || null)}
          />
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
          onSelect={(noteId) => void handleSelect(noteId)}
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
              <SaveStatus state={saveState} recoverySafeFailure={recoverySafeFailure} />
            </div>
          </div>

          {(notes.error || saveError) && notes.status !== 'failed' && (
            <div className="command-error" role="alert">
              <Icon name="circle-alert" />
              <span>{notes.error ?? saveError}</span>
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
                  key={`${notes.selectedNote.id}-${editorVersion}`}
                  note={notes.selectedNote}
                  focusTitle={focusTitleNoteId === notes.selectedNote.id}
                  onChange={({ title, documentJson }) => {
                    notes.updateDraft(notes.selectedNote!.id, title, documentJson)
                    coordinator.enqueue({
                      noteId: notes.selectedNote!.id,
                      baseRevision: notes.selectedNote!.revision,
                      title,
                      documentJson,
                    })
                  }}
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
      {recoveryCandidate && (
        <RecoveryDialog
          candidate={recoveryCandidate}
          busy={recoveryBusy}
          onRestore={() => void handleRestoreDraft()}
          onKeepDatabaseVersion={() => void handleKeepDatabaseVersion()}
        />
      )}
    </>
  )
}
