// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { captureReadingPosition, restoreReadingPosition, useReadingPosition } from './readingPosition'

beforeEach(()=>{localStorage.clear();vi.useFakeTimers()})
afterEach(()=>{vi.useRealTimers();document.body.replaceChildren()})
function page(kind='tiptap'){
  const container=document.createElement('div')
  container.innerHTML=`<div class="${kind}"><p data-block-id="a">第一段</p><p data-block-id="b">第二段</p><p data-block-id="c">第三段</p></div>`
  let height=1200
  Object.defineProperties(container,{clientHeight:{value:200},scrollHeight:{get:()=>height}})
  container.getBoundingClientRect=()=>({top:0} as DOMRect)
  const layout=()=>{
    Array.from(container.querySelectorAll('p')).forEach((block,index)=>{
      block.getBoundingClientRect=()=>({top:index*300-container.scrollTop,height:300} as DOMRect)
    })
  }
  layout();document.body.append(container)
  return {container,layout,shrink:()=>{height=450}}
}

it('restores the same block after preceding content is inserted and falls back after deletion',()=>{
  const {container,layout,shrink}=page()
  container.scrollTop=350
  const saved=captureReadingPosition(container)
  expect(saved.blockId).toBe('b')
  const added=document.createElement('p');added.textContent='新增'
  container.firstElementChild!.prepend(added);layout()
  container.scrollTop=0;restoreReadingPosition(container,saved)
  expect(container.scrollTop).toBe(650)
  container.querySelector('[data-block-id="b"]')!.remove();layout()
  restoreReadingPosition(container,saved)
  expect(container.scrollTop).toBe(350)
  shrink();restoreReadingPosition(container,saved)
  expect(container.scrollTop).toBe(250)
})

it('restores jotting blocks by text when HTML has no stable block IDs',()=>{
  const {container,layout}=page('jotting-markdown')
  container.querySelectorAll('p').forEach(p=>p.removeAttribute('data-block-id'))
  container.scrollTop=350;const saved=captureReadingPosition(container)
  const added=document.createElement('p');added.textContent='新增'
  container.firstElementChild!.prepend(added);layout()
  container.scrollTop=0;restoreReadingPosition(container,saved)
  expect(container.scrollTop).toBe(650)
})

it('keeps separate persistent positions across switches, remounts and hidden workspaces',()=>{
  const {container}=page();const ref={current:container}
  const hook=renderHook(({id,visible})=>useReadingPosition(id,ref,true,visible),{initialProps:{id:'note:a',visible:true}})
  act(()=>vi.advanceTimersByTime(20))
  expect(container.scrollTop).toBe(0)
  act(()=>{container.dispatchEvent(new Event('wheel'));container.scrollTop=350;container.dispatchEvent(new Event('scroll'))})
  // Leave before the debounce fires, then immediately switch to an unread item.
  hook.rerender({id:'jotting:b',visible:true});act(()=>vi.advanceTimersByTime(20))
  expect(container.scrollTop).toBe(0)
  act(()=>{container.dispatchEvent(new Event('wheel'));container.scrollTop=80;container.dispatchEvent(new Event('scroll'))})
  hook.rerender({id:'note:a',visible:true});act(()=>vi.advanceTimersByTime(20))
  expect(container.scrollTop).toBe(350)
  hook.rerender({id:'note:a',visible:false});container.scrollTop=0
  hook.rerender({id:'note:a',visible:true});act(()=>vi.advanceTimersByTime(20))
  expect(container.scrollTop).toBe(350)
  hook.unmount();container.scrollTop=0
  const fresh=renderHook(()=>useReadingPosition('jotting:b',ref,true,true));act(()=>vi.advanceTimersByTime(20))
  expect(container.scrollTop).toBe(80)
  fresh.unmount()
})

it('keeps the initial saved anchor during delayed image layout, then stops restoring after interaction',()=>{
  const {container,layout}=page();const ref={current:container}
  let first=renderHook(()=>useReadingPosition('note:a',ref,true,true));act(()=>vi.advanceTimersByTime(20))
  act(()=>{container.dispatchEvent(new Event('wheel'));container.scrollTop=350;container.dispatchEvent(new Event('scroll'))})
  first.unmount();container.scrollTop=0
  first=renderHook(()=>useReadingPosition('note:a',ref,true,true));act(()=>vi.advanceTimersByTime(20))
  const added=document.createElement('p');added.textContent='图片占位';container.firstElementChild!.prepend(added);layout()
  act(()=>container.dispatchEvent(new Event('load')))
  expect(container.scrollTop).toBe(650)
  act(()=>{container.dispatchEvent(new Event('wheel'));container.scrollTop=100;container.dispatchEvent(new Event('scroll'));container.dispatchEvent(new Event('load'))})
  expect(container.scrollTop).toBe(100)
  first.unmount()
})
