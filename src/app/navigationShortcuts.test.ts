import { describe,expect,it,vi } from 'vitest'

import { captureSidebarShortcut, sidebarViewForShortcut } from './navigationShortcuts'

describe('sidebarViewForShortcut',()=>{
  it('maps Ctrl+Alt+1 through 7 to sidebar order',()=>{
    expect(Array.from({length:7},(_,index)=>sidebarViewForShortcut({ctrlKey:true,altKey:true,key:String(index+1)}))).toEqual(['all','jottings','tasks','gallery','favorites','archived','trash'])
  })
  it('ignores incomplete modifiers and unrelated keys',()=>{
    expect(sidebarViewForShortcut({ctrlKey:true,altKey:false,key:'1'})).toBeNull()
    expect(sidebarViewForShortcut({ctrlKey:true,altKey:true,key:'8'})).toBeNull()
  })
  it('consumes sidebar shortcuts before editor heading keymaps',()=>{
    const preventDefault=vi.fn(),stopImmediatePropagation=vi.fn(),navigate=vi.fn()
    expect(captureSidebarShortcut({ctrlKey:true,altKey:true,key:'2',preventDefault,stopImmediatePropagation},navigate)).toBe(true)
    expect(preventDefault).toHaveBeenCalledOnce()
    expect(stopImmediatePropagation).toHaveBeenCalledOnce()
    expect(navigate).toHaveBeenCalledWith('jottings')
  })
})
