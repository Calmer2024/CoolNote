// @vitest-environment jsdom
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { afterEach,describe,expect,it,vi } from 'vitest'
import mermaid from 'mermaid'

import { MermaidNode } from './mermaidNode'

vi.mock('mermaid',()=>({default:{initialize:vi.fn(),render:vi.fn(async()=>({svg:'<svg data-rendered="true"></svg>'}))}}))

let editor:Editor|null=null

describe('MermaidNode',()=>{
  afterEach(()=>{editor?.destroy();editor=null;document.body.replaceChildren()})
  it('persists edits from the visible source textarea and rerenders the diagram',async()=>{
    const element=document.createElement('div');document.body.append(element)
    editor=new Editor({element,extensions:[StarterKit,MermaidNode],content:{type:'doc',content:[{type:'mermaid',attrs:{source:'graph TD\nA-->B',width:100}}]}})
    const source=element.querySelector<HTMLTextAreaElement>('.mermaid-source')!
    expect(source).toBeInstanceOf(HTMLTextAreaElement)
    source.focus();source.value='graph LR\nStart-->Finish';source.dispatchEvent(new Event('input',{bubbles:true}))
    expect(editor.getJSON().content?.[0].attrs?.source).toBe('graph LR\nStart-->Finish')
    await vi.waitFor(()=>expect(element.querySelector('svg[data-rendered="true"]')).not.toBeNull(),{timeout:1000})
  })

  it('mounts its source editor in the full-width document flow',()=>{
    const element=document.createElement('div');document.body.append(element)
    editor=new Editor({element,extensions:[StarterKit,MermaidNode],content:{type:'doc',content:[{type:'mermaid',attrs:{source:'graph TD\nA-->B',width:100}}]}})
    const diagram=element.querySelector<HTMLElement>('.mermaid-diagram')!
    const source=diagram.querySelector<HTMLTextAreaElement>('.mermaid-source')!
    expect(diagram.parentElement).toBe(element.querySelector('.tiptap'))
    expect(diagram.style.width).toBe('100%')
    expect(source.hidden).toBe(false)
  })

  it('cancels native source dragging and dropping without changing the selection or document',()=>{
    const element=document.createElement('div');document.body.append(element)
    editor=new Editor({element,extensions:[StarterKit,MermaidNode],content:{type:'doc',content:[{type:'mermaid',attrs:{source:'graph TD\nA-->B'}}]}})
    const source=element.querySelector<HTMLTextAreaElement>('.mermaid-source')!
    source.focus();source.setSelectionRange(9,10)
    const before=editor.getJSON()
    for(const type of ['dragstart','dragover','drop']){
      const event=new Event(type,{bubbles:true,cancelable:true})
      source.dispatchEvent(event)
      expect(event.defaultPrevented,type).toBe(true)
    }
    expect(source.selectionStart).toBe(9)
    expect(source.selectionEnd).toBe(10)
    expect(source.value).toBe('graph TD\nA-->B')
    expect(editor.getJSON()).toEqual(before)
    expect(editor.view.dragging).toBeNull()
    // Browsers can target the draggable ancestor instead of the textarea.
    const wrapperDrag=new Event('dragstart',{bubbles:true,cancelable:true})
    source.closest('.mermaid-diagram')!.dispatchEvent(wrapperDrag)
    expect(wrapperDrag.defaultPrevented).toBe(true)
    expect(editor.view.dragging).toBeNull()
  })

  it('does not reinitialize global Mermaid configuration while another chart is rendering',async()=>{
    vi.mocked(mermaid.initialize).mockClear();vi.mocked(mermaid.render).mockClear()
    let finish!:(result:Awaited<ReturnType<typeof mermaid.render>>)=>void
    vi.mocked(mermaid.render).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}))
    const element=document.createElement('div');document.body.append(element)
    editor=new Editor({element,extensions:[StarterKit,MermaidNode],content:{type:'doc',content:[
      {type:'mermaid',attrs:{source:'graph TD\nA-->B'}},
      {type:'mermaid',attrs:{source:'sequenceDiagram\nA->>B: Hello'}},
    ]}})
    await vi.waitFor(()=>expect(mermaid.render).toHaveBeenCalledTimes(1))
    expect(mermaid.initialize).toHaveBeenCalledTimes(1)
    finish({svg:'<svg data-rendered="true"></svg>',diagramType:'flowchart-v2'})
    await vi.waitFor(()=>expect(element.querySelectorAll('.mermaid-stage svg')).toHaveLength(2))
    expect(mermaid.initialize).toHaveBeenCalledTimes(2)
  })

  it('ignores a pending syntax error as soon as the source changes',async()=>{
    let fail!:(reason:Error)=>void
    vi.mocked(mermaid.render).mockImplementationOnce(()=>new Promise((_,reject)=>{fail=reject}))
    const element=document.createElement('div');document.body.append(element)
    editor=new Editor({element,extensions:[StarterKit,MermaidNode],content:{type:'doc',content:[{type:'mermaid',attrs:{source:'graph TD\nA['}}]}})
    await vi.waitFor(()=>expect(fail).toBeTypeOf('function'))
    const source=element.querySelector<HTMLTextAreaElement>('.mermaid-source')!
    source.focus();source.value='graph TD\nA-->B';source.dispatchEvent(new Event('input',{bubbles:true}))
    fail(new Error('old source syntax error'))
    await new Promise(resolve=>setTimeout(resolve,0))
    expect(element.querySelector('.is-error')).toBeNull()
    await vi.waitFor(()=>expect(element.querySelector('.mermaid-stage svg')).not.toBeNull())
    expect(element.querySelector('.is-error')).toBeNull()
  })
  it('uses the body font stack and rerenders on fonts and theme changes without saving UI changes',async()=>{
    vi.mocked(mermaid.initialize).mockClear();vi.mocked(mermaid.render).mockClear()
    const element=document.createElement('div');document.body.append(element)
    editor=new Editor({element,extensions:[StarterKit,MermaidNode],editorProps:{attributes:{style:'font-family: "Body Latin", "Body Chinese", sans-serif'}},content:{type:'doc',content:[{type:'mermaid',attrs:{source:'graph TD\nA[中文 English]-->B'}}]}})
    const before=editor.getJSON()
    await vi.waitFor(()=>expect(mermaid.initialize).toHaveBeenCalledWith(expect.objectContaining({fontFamily:'"Body Latin", "Body Chinese", sans-serif',themeVariables:expect.objectContaining({background:'transparent'})})))
    editor.view.dom.style.fontFamily='"New Latin", "New Chinese", serif'
    await vi.waitFor(()=>expect(mermaid.initialize).toHaveBeenLastCalledWith(expect.objectContaining({fontFamily:'"New Latin", "New Chinese", serif'})))
    document.documentElement.dataset.theme='dark'
    try{
      await vi.waitFor(()=>expect(mermaid.initialize).toHaveBeenLastCalledWith(expect.objectContaining({theme:'dark',fontFamily:'"New Latin", "New Chinese", serif'})))
      expect(element.querySelector<SVGElement>('.mermaid-stage svg')?.style.backgroundColor).toBe('transparent')
      expect(editor.getJSON()).toEqual(before)
      const count=vi.mocked(mermaid.render).mock.calls.length
      await new Promise(resolve=>setTimeout(resolve,270))
      expect(mermaid.render).toHaveBeenCalledTimes(count)
    }finally{delete document.documentElement.dataset.theme}
  })

  it('waits for label fonts before measurement and remeasures after a font finishes loading',async()=>{
    vi.mocked(mermaid.initialize).mockClear();vi.mocked(mermaid.render).mockClear()
    const original=Object.getOwnPropertyDescriptor(document,'fonts')
    const fonts=new EventTarget()
    let finish!:()=>void
    const load=vi.fn().mockImplementationOnce(()=>new Promise<void>(resolve=>{finish=resolve})).mockResolvedValue([])
    Object.defineProperty(document,'fonts',{configurable:true,value:Object.assign(fonts,{load})})
    try{
      const element=document.createElement('div');document.body.append(element)
      editor=new Editor({element,extensions:[StarterKit,MermaidNode],editorProps:{attributes:{style:'font-family: "Body Latin", "Body Chinese", sans-serif'}},content:{type:'doc',content:[{type:'mermaid',attrs:{source:'graph TD\nA[中文 English]-->B'}}]}})
      await vi.waitFor(()=>expect(load).toHaveBeenCalledWith('16px "Body Latin", "Body Chinese", sans-serif','中文 ABC'))
      expect(mermaid.render).not.toHaveBeenCalled()
      finish()
      await vi.waitFor(()=>expect(mermaid.render).toHaveBeenCalledTimes(1))
      fonts.dispatchEvent(new Event('loadingdone'))
      await vi.waitFor(()=>expect(mermaid.render).toHaveBeenCalledTimes(2))
      editor.destroy();editor=null
      fonts.dispatchEvent(new Event('loadingdone'))
      await new Promise(resolve=>setTimeout(resolve,270))
      expect(mermaid.render).toHaveBeenCalledTimes(2)
    }finally{
      editor?.destroy();editor=null
      if(original)Object.defineProperty(document,'fonts',original)
      else Reflect.deleteProperty(document,'fonts')
    }
  })

})
