// @vitest-environment jsdom
import { createElement } from 'react'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useVirtualNotes } from './useVirtualNotes'
import type { NoteSummaryDto } from '../../shared/tauri/contracts'

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })

it.each([20, 80])('does not rerender %i notes for width-only resize bursts with unchanged row heights', count => {
  vi.useFakeTimers()
  let width = 290, renders = 0
  const observers: Array<{ callback: ResizeObserverCallback; targets: Element[] }> = []
  vi.stubGlobal('ResizeObserver', class {
    record: typeof observers[number]
    constructor(callback: ResizeObserverCallback) { this.record = { callback, targets: [] }; observers.push(this.record) }
    observe(target: Element) { this.record.targets.push(target) }
    disconnect() { this.record.targets = [] }
  })
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => width)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(800)
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({height:84,width:290,x:0,y:0,top:0,left:0,bottom:84,right:290,toJSON:()=>({})})
  const notes = Array.from({length:count}, (_,i) => ({id:`note-${i}`} as NoteSummaryDto))
  function Fixture() {
    renders++
    const list = useVirtualNotes(notes, false, false)
    return createElement('div', {ref:list.listRef}, notes.slice(list.first,list.end).map(note => createElement('div', {key:note.id,'data-virtual-note-id':note.id})))
  }
  const view = render(<Fixture />)
  const list = view.container.firstElementChild!
  const observer = observers.find(observer => observer.targets.includes(list))!
  const initial = renders
  for (const next of [250,210,170,120,80,40,0,40,80,120,170,210,250,290]) {
    act(() => { width=next; observer.callback([], {} as ResizeObserver) })
  }
  expect(renders).toBeLessThanOrEqual(initial + 1)
  act(() => vi.advanceTimersByTime(120))
  expect(renders).toBeLessThanOrEqual(initial + 1)
  expect(list.children.length).toBe(count > 40 ? 16 : count)
})
