// @vitest-environment jsdom
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { afterEach, expect, it, vi } from 'vitest'
const api=vi.hoisted(()=>({getAttachmentData:vi.fn(async()=> 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==')}))
vi.mock('../../shared/tauri/commands',()=>({...api,openAttachment:vi.fn(),openExternalResource:vi.fn(),revealAttachment:vi.fn()}))
import { ResizableImage } from './attachmentNodes'
let editor:Editor
afterEach(()=>{editor?.destroy();document.body.replaceChildren();vi.restoreAllMocks();api.getAttachmentData.mockClear()})
const mount=async()=>{
  const element=document.createElement('div');document.body.append(element)
  editor=new Editor({element,extensions:[StarterKit,ResizableImage.configure({allowBase64:true})],content:{type:'doc',content:[{type:'image',attrs:{src:'coolnote-attachment:photo',attachmentId:'photo',width:300}}]}})
  await Promise.resolve();await Promise.resolve()
  const image=element.querySelector('img')!
  vi.spyOn(image,'getBoundingClientRect').mockImplementation(()=>({width:parseFloat(image.style.width)||300,height:image.hasAttribute('src')?(parseFloat(image.style.width)||300)*0.75:0}) as DOMRect)
  return {image,handle:element.querySelector('.editor-image-resize')!}
}
it('keeps the decoded image and its height through resize preview and commit',async()=>{
  const {image,handle}=await mount();const source=image.getAttribute('src')
  expect(source).toContain('data:image')
  handle.dispatchEvent(new MouseEvent('pointerdown',{clientX:300,bubbles:true,cancelable:true}))
  window.dispatchEvent(new MouseEvent('pointermove',{clientX:380}))
  expect(image.getBoundingClientRect().height).toBe(285)
  window.dispatchEvent(new MouseEvent('pointerup'))
  // A commit must never collapse the image while resolving the same attachment again.
  expect(image.getAttribute('src')).toBe(source)
  expect(image.getBoundingClientRect().height).toBe(285)
  expect(editor.state.doc.firstChild?.attrs.width).toBe(380)
  await Promise.resolve()
  expect(api.getAttachmentData).toHaveBeenCalledTimes(1)
})

it('does not animate size-only updates but still animates gallery layout changes',async()=>{
  const animate=vi.fn()
  vi.spyOn(window,'requestAnimationFrame').mockImplementation(callback=>{callback(0);return 1})
  const {image}=await mount()
  const figure=image.parentElement!
  Object.defineProperty(figure,'animate',{configurable:true,value:animate})
  editor.commands.setNodeSelection(0)
  editor.commands.updateAttributes('image',{width:420})
  expect(animate).not.toHaveBeenCalled()
  expect(image.getAttribute('src')).toContain('data:image')
  editor.commands.updateAttributes('image',{layout:'gallery',gallerySize:2})
  expect(animate).toHaveBeenCalledTimes(1)
})

it('keeps pointer previews out of document history and cancels without committing',async()=>{
  const {image,handle}=await mount()
  handle.dispatchEvent(new MouseEvent('pointerdown',{clientX:300,bubbles:true,cancelable:true}))
  window.dispatchEvent(new MouseEvent('pointermove',{clientX:400}))
  await new Promise(resolve=>setTimeout(resolve,0))
  expect(image.style.width).toBe('400px')
  expect(editor.state.doc.firstChild?.attrs.width).toBe(300)
  window.dispatchEvent(new MouseEvent('pointercancel'))
  window.dispatchEvent(new MouseEvent('pointermove',{clientX:450}))
  window.dispatchEvent(new MouseEvent('pointerup'))
  expect(image.style.width).toBe('300px')
  expect(editor.state.doc.firstChild?.attrs.width).toBe(300)
})

it('still reloads when the actual image source changes',async()=>{
  const {image}=await mount()
  api.getAttachmentData.mockResolvedValueOnce('data:image/png;base64,new-photo')
  editor.commands.setNodeSelection(0)
  editor.commands.updateAttributes('image',{src:'coolnote-attachment:other',attachmentId:'other'})
  await vi.waitFor(()=>expect(image.getAttribute('src')).toBe('data:image/png;base64,new-photo'))
  expect(api.getAttachmentData).toHaveBeenLastCalledWith('other')
  expect(image.getAttribute('src')).toBe('data:image/png;base64,new-photo')
})
