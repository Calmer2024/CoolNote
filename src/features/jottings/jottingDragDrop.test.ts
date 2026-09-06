import { describe, expect, it, vi } from 'vitest'

import { handleJottingTreeDrop, moveJottingInTree, reorderJottingFolders } from './jottingDragDrop'

const event=(data:Record<string,string>)=>({
  dataTransfer:{getData:(type:string)=>data[type]??''},
  preventDefault:vi.fn(),
  stopPropagation:vi.fn(),
})

describe('jotting tree drag and drop',()=>{
  it('dispatches exactly one file move for a folder drop',()=>{
    const drop=event({'text/coolnote-jotting':'note-1'});const move=vi.fn();const reorder=vi.fn()
    expect(handleJottingTreeDrop(drop,'folder-2','folder-2',move,reorder)).toBe(true)
    expect(move).toHaveBeenCalledOnce();expect(move).toHaveBeenCalledWith('note-1','folder-2');expect(reorder).not.toHaveBeenCalled()
  })

  it('dispatches a folder reorder without invoking file movement',()=>{
    const drop=event({'text/coolnote-jotting-folder':'folder-1'});const move=vi.fn();const reorder=vi.fn()
    expect(handleJottingTreeDrop(drop,null,'folder-2',move,reorder)).toBe(true)
    expect(reorder).toHaveBeenCalledOnce();expect(reorder).toHaveBeenCalledWith('folder-1','folder-2');expect(move).not.toHaveBeenCalled()
  })

  it('updates file location and folder order synchronously',()=>{
    const notes=[{id:'note-1',folderId:'folder-1',name:'A'}]
    expect(moveJottingInTree(notes,'note-1','folder-2')[0].folderId).toBe('folder-2')
    const folders=[{id:'folder-1',sortOrder:0},{id:'folder-2',sortOrder:1},{id:'folder-3',sortOrder:2}]
    expect(reorderJottingFolders(folders,'folder-3','folder-1').map(folder=>[folder.id,folder.sortOrder])).toEqual([['folder-3',0],['folder-1',1],['folder-2',2]])
  })
})
