// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { BUILT_IN_NOTE_ID } from '../../shared/builtin'
import { NotesPanel } from './NotesPanel'
import type { ComponentProps } from 'react'

vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
afterEach(cleanup)
it('groups pinned notes within the current category and offers unpin', () => {
  const onAction = vi.fn()
  const base = {id:'regular',title:'普通笔记',excerpt:'正文',categoryId:'category',revision:1,isFavorite:false,isArchived:false,deletedAt:null,mood:null,updatedAt:'2026-10-15T00:00:00Z'}
  const {container} = render(<NotesPanel notes={[base,{...base,id:'pinned',title:'重要笔记',isPinned:true},{...base,id:BUILT_IN_NOTE_ID,title:'欢迎使用 CoolNote',isPinned:true}]} total={2} selectedNoteId={null} selectedIds={new Set()} collapsed={false} loading={false} canLoadMore={false} loadingMore={false} title="工作" titleIcon="folder" sortDirection="desc" view="all" categories={[]} onDirection={vi.fn()} onToggleSelected={vi.fn()} onClearSelection={vi.fn()} onSelectAll={vi.fn()} onSelect={vi.fn()} onLoadMore={vi.fn()} onAction={onAction} onMove={vi.fn()} onCreate={vi.fn()} onImport={vi.fn()} showCreate onEmptyTrash={vi.fn()} onRefresh={vi.fn()}/> )
  expect([...container.querySelectorAll('.note-card h2')].map(element=>element.textContent)).toEqual(['重要笔记','欢迎使用 CoolNote','普通笔记'])
  expect(container.querySelector('.note-section-label')?.textContent).toBe('置顶')
  expect(container.querySelectorAll('.note-section-label .icon')).toHaveLength(2)
  fireEvent.contextMenu(screen.getByText('重要笔记'),{clientX:100,clientY:100})
  fireEvent.click(screen.getByText('取消置顶'))
  expect(onAction).toHaveBeenCalledWith(['pinned'],'unpin')
  fireEvent.contextMenu(screen.getByText('欢迎使用 CoolNote'),{clientX:100,clientY:100})
  expect(screen.queryByText('移到回收站')).toBeNull()
  expect(screen.queryByText('移动到')).toBeNull()
  fireEvent.click(screen.getByText('取消置顶'))
  expect(onAction).toHaveBeenCalledWith([BUILT_IN_NOTE_ID],'unpin')
})

it('bounds rendered rows and retains navigation, selection and actions at the end of a large list', () => {
  const notes=Array.from({length:5000},(_,index)=>({id:`note-${index}`,title:`测试笔记 ${index}`,excerpt:'正文',categoryId:'category',revision:1,isFavorite:false,isArchived:false,deletedAt:null,mood:null,updatedAt:'2026-10-15T00:00:00Z'}))
  const onSelect=vi.fn(), onAction=vi.fn()
  const props:ComponentProps<typeof NotesPanel>={notes,total:notes.length,selectedNoteId:null,selectedIds:new Set(),collapsed:false,loading:false,canLoadMore:true,loadingMore:false,title:'全部笔记',titleIcon:'file-text',sortDirection:'desc',view:'all',categories:[],onDirection:vi.fn(),onToggleSelected:vi.fn(),onClearSelection:vi.fn(),onSelectAll:vi.fn(),onSelect,onLoadMore:vi.fn(),onAction,onMove:vi.fn(),onCreate:vi.fn(),onImport:vi.fn(),showCreate:true,onEmptyTrash:vi.fn(),onRefresh:vi.fn()}
  const {container,rerender}=render(<NotesPanel {...props}/>)
  expect(container.querySelectorAll('.note-card-row').length).toBeLessThan(40)
  expect(screen.queryByText('测试笔记 4999')).toBeNull()
  const list=screen.getByRole('listbox')
  fireEvent.scroll(list,{target:{scrollTop:419200}})
  expect(screen.getByText('测试笔记 4999')).toBeTruthy()
  expect(container.querySelectorAll('.note-card-row').length).toBeLessThan(40)
  fireEvent.contextMenu(screen.getByText('测试笔记 4999'),{clientX:100,clientY:100})
  fireEvent.click(screen.getByText('置顶'))
  expect(onAction).toHaveBeenCalledWith(['note-4999'],'pin')
  rerender(<NotesPanel {...props} selectedNoteId="note-4998"/>)
  expect(screen.getByText('测试笔记 4998').closest('.note-card-row')?.classList.contains('selected')).toBe(true)
  fireEvent.keyDown(list,{key:'ArrowDown'})
  fireEvent.keyDown(list,{key:'Enter'})
  expect(onSelect).toHaveBeenCalledWith('note-4999')
  fireEvent.keyDown(list,{key:'Home'})
  expect(screen.getByText('测试笔记 0')).toBeTruthy()
  expect(list.getAttribute('aria-activedescendant')).toBe('note-row-note-0')
  fireEvent.keyDown(list,{key:'End'})
  expect(screen.getByText('测试笔记 4999')).toBeTruthy()
  expect(screen.getByText('加载更多笔记')).toBeTruthy()
})
