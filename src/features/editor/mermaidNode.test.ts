// @vitest-environment jsdom
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { afterEach,describe,expect,it,vi } from 'vitest'

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
})
