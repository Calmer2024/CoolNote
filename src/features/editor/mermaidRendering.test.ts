// @vitest-environment jsdom
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { afterEach, expect, it, vi } from 'vitest'
import { MermaidNode } from './mermaidNode'

let editor:Editor|null=null
afterEach(()=>{editor?.destroy();editor=null;vi.restoreAllMocks();document.body.replaceChildren()})

it('contains real Mermaid parse failures in their own chart and continues rendering valid charts',async()=>{
  // jsdom has no SVG layout engine; Mermaid needs these measurements.
  Object.defineProperty(SVGElement.prototype,'getBBox',{configurable:true,value:()=>({x:0,y:0,width:100,height:20})})
  Object.defineProperty(SVGElement.prototype,'getComputedTextLength',{configurable:true,value:()=>100})
  const element=document.createElement('div');document.body.append(element)
  editor=new Editor({element,extensions:[StarterKit,MermaidNode],content:{type:'doc',content:[
    {type:'mermaid',attrs:{source:'graph TD\nA[unfinished'}},
    {type:'paragraph',content:[{type:'text',text:'仍可编辑的正文'}]},
    {type:'mermaid',attrs:{source:'graph TD\nA-->B'}},
  ]}})
  await vi.waitFor(()=>{
    expect(element.querySelector('.mermaid-diagram.is-error .mermaid-stage')?.textContent).toContain('无法渲染')
    expect(element.querySelectorAll('.mermaid-stage svg')).toHaveLength(1)
  },{timeout:15000})
  expect(document.body.querySelectorAll(':scope > div')).toHaveLength(1)
  expect(document.body.textContent).not.toContain('Syntax error in text')
  expect(element.querySelectorAll('.mermaid-diagram.is-error')).toHaveLength(1)
  editor.commands.insertContentAt(2,'继续')
  expect(editor.getText()).toContain('继续仍可编辑的正文')
  const source=element.querySelector<HTMLTextAreaElement>('.mermaid-source')!
  source.focus();source.value='sequenceDiagram\nAlice->>Bob: Hello'
  source.dispatchEvent(new Event('input',{bubbles:true}))
  await vi.waitFor(()=>{
    expect(element.querySelectorAll('.mermaid-stage svg')).toHaveLength(2)
    expect(element.querySelector('.mermaid-diagram.is-error')).toBeNull()
    expect(document.body.querySelectorAll(':scope > div')).toHaveLength(1)
  },{timeout:5000})
},30000)
