// @vitest-environment jsdom
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { afterEach,describe,expect,it,vi } from 'vitest'

import { applyHeadingShortcut } from './editorShortcuts'

let editor:Editor|null=null
const makeEditor=()=>editor=new Editor({extensions:[StarterKit.configure({heading:{levels:[1,2,3,4,5]}})],content:'<p>快捷键正文</p>'})
const event=(key:string,target:EventTarget|null=null)=>({key,ctrlKey:true,metaKey:false,altKey:false,target,preventDefault:vi.fn()})

describe('applyHeadingShortcut',()=>{
  afterEach(()=>{editor?.destroy();editor=null})
  it('uses Ctrl+1 through Ctrl+5 for headings and Ctrl+6 for body text',()=>{
    const active=makeEditor(),heading=event('3')
    expect(applyHeadingShortcut(active,heading)).toBe(true)
    expect(heading.preventDefault).toHaveBeenCalledOnce()
    expect(active.isActive('heading',{level:3})).toBe(true)
    expect(applyHeadingShortcut(active,event('6'))).toBe(true)
    expect(active.isActive('paragraph')).toBe(true)
  })
  it('does not consume sidebar shortcuts or keystrokes inside nested inputs',()=>{
    const active=makeEditor(),textarea=document.createElement('textarea')
    expect(applyHeadingShortcut(active,{...event('2'),altKey:true})).toBe(false)
    expect(applyHeadingShortcut(active,event('2',textarea))).toBe(false)
    expect(active.isActive('paragraph')).toBe(true)
  })
  it('toggles the same heading back to body text and switches between heading levels',()=>{
    const active=makeEditor()
    for(const level of ['1','2','3','4','5']){
      applyHeadingShortcut(active,event(level))
      expect(active.isActive('heading',{level:Number(level)})).toBe(true)
      applyHeadingShortcut(active,event(level))
      expect(active.isActive('paragraph')).toBe(true)
    }
    applyHeadingShortcut(active,event('2'));applyHeadingShortcut(active,event('4'))
    expect(active.isActive('heading',{level:4})).toBe(true)
    expect(active.getText().trim()).toBe('快捷键正文')
  })
})
