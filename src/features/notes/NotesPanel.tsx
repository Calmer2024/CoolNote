import { useEffect, useRef, useState } from 'react'

import type { BatchAction, CategoryDto, NoteSummaryDto, NoteView } from '../../shared/tauri/contracts'
import { Icon } from '../../shared/components/Icon'
import { FloatingLayer } from '../../shared/components/Overlay'
import { SidebarSkeleton } from '../../shared/components/Skeleton'
import { isBuiltInNote } from '../../shared/builtin'

type Props = {
  notes: NoteSummaryDto[]; total: number; selectedNoteId: string | null; selectedIds: Set<string>
  collapsed: boolean; loading: boolean; canLoadMore: boolean; loadingMore: boolean
  title: string; titleIcon: string; titleIconColor?: string; sortDirection: 'asc' | 'desc'; view: NoteView; categories: CategoryDto[]
  onDirection: (value: 'asc' | 'desc') => void; onToggleSelected: (id: string) => void
  onClearSelection: () => void; onSelectAll: () => void; onSelect: (id: string) => void; onLoadMore: () => void
  onAction: (ids: string[], action: BatchAction) => void; onMove: (ids: string[], categoryId: string) => void
  onCreate: () => void; onImport: () => void; showCreate: boolean; onEmptyTrash: () => void; onRefresh: () => void
}

const noteTitle = (title: string) => title.trim() || '无标题笔记'
const noteExcerpt = (excerpt: string) => excerpt.trim() || '开始写下你的想法…'
const updatedLabel = (value: string) => new Intl.DateTimeFormat('zh-CN', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' }).format(new Date(value))

type MenuState = { note: NoteSummaryDto; x: number; y: number; mode: 'note' | 'move' }

export function NotesPanel(props: Props) {
  const { notes, total, selectedNoteId, selectedIds } = props
  const selectedIndex = notes.findIndex((note) => note.id === selectedNoteId)
  const [activeIndex, setActiveIndex] = useState(selectedIndex >= 0 ? selectedIndex : notes.length ? 0 : -1)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [createMenu, setCreateMenu] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const panelRef = useRef<HTMLElement>(null)
  const createButtonRef = useRef<HTMLButtonElement>(null)
  useEffect(() => setActiveIndex(notes.length ? Math.max(0, selectedIndex) : -1), [notes.length, selectedIndex])
  const keydown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!notes.length) return
    if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex((value) => Math.min(notes.length - 1, value + 1)) }
    if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex((value) => Math.max(0, value - 1)) }
    if (event.key === 'Enter' && activeIndex >= 0) { event.preventDefault(); props.onSelect(notes[activeIndex].id) }
  }
  const act = (note: NoteSummaryDto, action: BatchAction) => { setMenu(null); props.onAction([note.id], action) }
  const selected = [...selectedIds]
  return <section ref={panelRef} className="notes-panel" aria-label="笔记列表" data-collapsed={props.collapsed} data-selecting={selectedIds.size > 0}>
    <div className="notes-header">
      {selectedIds.size ? <div className="selection-bar"><strong>已选择 {selectedIds.size} 项</strong>
        <button className="select-all-action" title={selectedIds.size===notes.length?'取消全选':'全选'} aria-label={selectedIds.size===notes.length?'取消全选':'全选'} onClick={props.onSelectAll}><Icon name="check-square" /></button>
        {props.view!=='trash'&&<button title="收藏" aria-label="收藏" onClick={() => props.onAction(selected, 'favorite')}><Icon name="star" /></button>}
        <button title="移动" aria-label="移动" onClick={(event) => { const rect=event.currentTarget.getBoundingClientRect(); const note=notes.find(n=>selectedIds.has(n.id)); if(note)setMenu({note,x:rect.left-160,y:rect.bottom+5,mode:'move'}) }}><Icon name="folder" /></button>
        <button title="归档" aria-label="归档" onClick={() => props.onAction(selected, props.view === 'archived' ? 'unarchive' : 'archive')}><Icon name="book-open" /></button>
        <button className="danger" title={props.view === 'trash' ? '永久删除' : '移到回收站'} aria-label={props.view === 'trash' ? '永久删除' : '移到回收站'} onClick={() => props.onAction(selected, props.view === 'trash' ? 'deletePermanently' : 'trash')}><Icon name="trash-2" /></button>
        {props.view === 'trash' && <button title="恢复" onClick={() => props.onAction(selected, 'restore')}><Icon name="rotate-ccw" /></button>}
        <button title="取消选择" aria-label="取消选择" onClick={props.onClearSelection}><Icon name="x" /></button>
      </div> : <><div className="notes-heading" data-view={props.view} style={{'--heading-icon-color':props.titleIconColor} as React.CSSProperties}><Icon name={props.titleIcon}/><strong>{props.title}</strong><span className="notes-count">{total}</span></div><div className="notes-header-actions">{props.view==='trash'&&<button className="icon-button empty-trash-button" aria-label="清空回收站" title="一键清空回收站" onClick={props.onEmptyTrash}><Icon name="trash-2"/></button>}{props.showCreate&&<button ref={createButtonRef} className="icon-button note-create-menu-trigger" aria-label="新建或导入笔记" aria-expanded={createMenu} onClick={()=>setCreateMenu(value=>!value)}><Icon name="plus"/></button>}<button className="icon-button" aria-label="刷新笔记列表" onClick={props.onRefresh}><Icon name="rotate-ccw"/></button><button className="icon-button sort-button" data-direction={props.sortDirection} aria-label={`更新时间${props.sortDirection === 'desc' ? '降序' : '升序'}`} title="切换更新时间排序" onClick={() => props.onDirection(props.sortDirection === 'desc' ? 'asc' : 'desc')}><Icon name={props.sortDirection === 'desc' ? 'sort-desc' : 'sort-asc'} /></button></div></>}
    </div>
    <FloatingLayer open={createMenu&&props.showCreate} anchor={createButtonRef} placement="bottom-start" className="product-menu note-create-dropdown" role="menu" onDismiss={()=>setCreateMenu(false)}><button onClick={()=>{setCreateMenu(false);props.onCreate()}}><Icon name="file-plus"/><span>新建笔记</span></button><button onClick={()=>{setCreateMenu(false);props.onImport()}}><Icon name="upload"/><span>导入笔记</span></button></FloatingLayer>
    {props.loading ? <div className="notes-list"><SidebarSkeleton rows={8}/></div> : notes.length ?
      <div className="notes-list" data-sort-direction={props.sortDirection} role="listbox" tabIndex={0} onKeyDown={keydown}>
        {notes.map((note, index) => <div className={`note-card-row prototype-note-row${note.id === selectedNoteId ? ' selected' : ''}${isBuiltInNote(note.id)?' built-in-note':''}`} key={note.id} onContextMenu={(event) => { if(isBuiltInNote(note.id))return;event.preventDefault(); setMenu({note,x:event.clientX,y:event.clientY,mode:'note'}) }}>
          {isBuiltInNote(note.id)?<span className="built-in-pin" title="内置产品介绍"><Icon name="pin"/></span>:<input type="checkbox" aria-label={`选择${noteTitle(note.title)}`} checked={selectedIds.has(note.id)} onChange={() => props.onToggleSelected(note.id)} />}
          <button className="note-card" type="button" aria-current={index === activeIndex ? 'true' : undefined} onClick={() => { setActiveIndex(index); props.onSelect(note.id) }}>
            <h2>{noteTitle(note.title)}</h2><p>{noteExcerpt(note.excerpt)}</p>
            <div className="note-meta"><time>{updatedLabel(note.updatedAt)}</time>{note.mood&&<span className="note-mood" aria-label={`心情 ${note.mood}`}>{note.mood}</span>}{props.categories.find(category=>category.id===note.categoryId)&&<span className="note-category-token">{props.categories.find(category=>category.id===note.categoryId)!.name}</span>}<span className="note-flags">{note.isFavorite && <Icon name="star" />}</span></div>
          </button>
          {!isBuiltInNote(note.id)&&<div className="note-hover-actions">{props.view!=='trash'&&<button className={`icon-button${note.isFavorite?' is-active':''}`} aria-label={note.isFavorite?'取消收藏':'收藏'} onClick={() => act(note,note.isFavorite?'unfavorite':'favorite')}><Icon name="star" /></button>}<button className="icon-button" aria-label="更多" onClick={(event) => { event.stopPropagation(); const rect=event.currentTarget.getBoundingClientRect(); setMenu({note,x:rect.left,y:rect.bottom+4,mode:'note'}) }}><Icon name="ellipsis" /></button></div>}
        </div>)}
      </div> : <div className="notes-list notes-empty"><Icon name="file-text" className="empty-state-icon" /><strong>没有匹配的笔记</strong></div>}
    {props.canLoadMore && <button className="load-more-button" disabled={props.loadingMore} onClick={props.onLoadMore}>{props.loadingMore ? '正在加载…' : '加载更多笔记'}</button>}
    <FloatingLayer open={!!menu} point={menu?{left:menu.x,top:menu.y}:undefined} className="product-menu note-list-menu" role="menu" onDismiss={()=>{setMenu(null);setDeleteConfirm(null)}}>
      {menu&&<>
      {menu.mode === 'move' ? <><div className="menu-label">移动到分类</div>{props.categories.map(category=><button key={category.id} onClick={()=>{props.onMove(selectedIds.size ? selected : [menu.note.id],category.id);setMenu(null)}}><Icon name={category.iconName || 'folder'} /><span>{category.name}</span></button>)}</> : <>
        {props.view!=='trash'&&<><button onClick={()=>act(menu.note,menu.note.isFavorite?'unfavorite':'favorite')}><Icon name="star" /><span>{menu.note.isFavorite?'取消收藏':'收藏'}</span></button><button onClick={()=>setMenu({...menu,mode:'move'})}><Icon name="folder" /><span>移动到</span><Icon name="chevron-right" /></button><div className="separator" /></>}
        {props.view === 'trash' ? <><button onClick={()=>act(menu.note,'restore')}><Icon name="rotate-ccw" /><span>恢复</span></button><button className={`danger${deleteConfirm===menu.note.id?' confirm-delete':''}`} onClick={()=>{if(deleteConfirm===menu.note.id){setDeleteConfirm(null);act(menu.note,'deletePermanently')}else setDeleteConfirm(menu.note.id)}}><Icon name={deleteConfirm===menu.note.id?'check-square':'trash-2'} /><span>{deleteConfirm===menu.note.id?'确认永久删除':'永久删除'}</span></button></> : <><button onClick={()=>act(menu.note,menu.note.isArchived?'unarchive':'archive')}><Icon name="book-open" /><span>{menu.note.isArchived?'取消归档':'归档'}</span></button><button className="danger" onClick={()=>act(menu.note,'trash')}><Icon name="trash-2" /><span>移到回收站</span></button></>}
      </>}
      </>}
    </FloatingLayer>
  </section>
}
