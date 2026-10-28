// @vitest-environment jsdom
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { afterEach, expect, it, vi } from 'vitest'
import { cancelCodeLineMeasurement, scheduleCodeLineMeasurement } from './codeLineMeasurements'
import { PhycatCodeBlock } from './phycatCode'

let frames: Map<number, FrameRequestCallback>
let observers: Array<{ callback: ResizeObserverCallback; targets: Element[] }>
const editors: Editor[] = []
function setup() {
  frames = new Map()
  observers = []
  let id = 0
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++id, callback); return id })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  vi.stubGlobal('ResizeObserver', class {
    record: typeof observers[number]
    constructor(callback: ResizeObserverCallback) { this.record = { callback, targets: [] }; observers.push(this.record) }
    observe(target: Element) { this.record.targets.push(target) }
    disconnect() { this.record.targets = [] }
  })
}
function tick() {
  const current = [...frames.values()]
  frames.clear()
  current.forEach(callback => callback(0))
}
afterEach(() => { editors.forEach(editor => editor.destroy()); editors.length=0; vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.replaceChildren() })

it('batches all blocks into style-read, probe-write, height-read and gutter-write phases', () => {
  setup()
  const log: string[] = []
  const job = (name: string) => ({ prepare: () => { log.push(`style:${name}`); return () => { log.push(`probe:${name}`); return () => { log.push(`read:${name}`); return () => { log.push(`write:${name}`) } } } } })
  const a = job('a'), b = job('b'), removed = job('removed')
  scheduleCodeLineMeasurement(a); scheduleCodeLineMeasurement(a); scheduleCodeLineMeasurement(b)
  scheduleCodeLineMeasurement(removed); cancelCodeLineMeasurement(removed)
  expect(frames.size).toBe(1)
  tick()
  expect(log).toEqual(['style:a','style:b','probe:a','probe:b','read:a','read:b','write:a','write:b'])
  scheduleCodeLineMeasurement(a)
  cancelCodeLineMeasurement(a)
  expect(frames.size).toBe(0)
})

it('preserves wrapped/blank line heights, skips unchanged widths and remeasures edited code', () => {
  setup()
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(200)
  const reads = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const height = this.parentElement?.classList.contains('phycat-code-line-measure') ? (this.textContent === 'wrapped' ? 57.6 : 28.8) : 0
    return { height, width: 200, x:0, y:0, top:0, left:0, bottom:height, right:200, toJSON:()=>({}) }
  })
  const host = document.createElement('div'); document.body.append(host)
  const editor = new Editor({ element: host, extensions: [StarterKit.configure({codeBlock:false}), PhycatCodeBlock], content: {type:'doc',content:[{type:'codeBlock',content:[{type:'text',text:'wrapped\n\nlast'}]}]} })
  editors.push(editor)
  tick()
  const gutter = host.querySelector('.phycat-code-gutter')!
  expect([...gutter.children].map(el => (el as HTMLElement).style.height)).toEqual(['57.6px','28.8px','28.8px'])
  reads.mockClear()
  const observer = observers.find(observer => observer.targets.some(el => el.tagName === 'CODE'))!
  observer.callback([{ contentRect: { width:200 } }] as ResizeObserverEntry[], {} as ResizeObserver)
  tick()
  expect(reads).not.toHaveBeenCalled()
  editor.commands.setContent({type:'doc',content:[{type:'codeBlock',content:[{type:'text',text:'new\nwrapped'}]}]})
  tick()
  expect([...host.querySelectorAll('.phycat-code-line-number')].map(el => (el as HTMLElement).style.height)).toEqual(['28.8px','57.6px'])
  reads.mockClear()
  host.querySelector('code')!.style.lineHeight='40px'
  const currentObserver=observers.find(observer=>observer.targets.some(el=>el.tagName==='CODE'))!
  currentObserver.callback([{ contentRect: { width:200 } }] as ResizeObserverEntry[], {} as ResizeObserver)
  tick()
  expect(reads).toHaveBeenCalled()
})


it('copies only current model code verbatim and keeps feedback outside saved content', async () => {
  setup()
  const writeText=vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText}})
  const text='  const message = "中文 <>& ` ``` \\";\n\tconsole.log(message)\n\n'
  const host=document.createElement('div');document.body.append(host)
  const editor=new Editor({element:host,extensions:[StarterKit.configure({codeBlock:false}),PhycatCodeBlock],content:{type:'doc',content:[{type:'codeBlock',attrs:{language:'javascript'},content:[{type:'text',text}]}]}})
  editors.push(editor)
  editor.commands.setTextSelection(4)
  const selection=editor.state.selection.toJSON()
  const before=editor.getJSON()
  const button=host.querySelector<HTMLButtonElement>('.phycat-code-copy')!
  button.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true}))
  button.click()
  await vi.waitFor(()=>expect(button.querySelector('svg')?.getAttribute('data-icon')).toBe('check'))
  expect(button.textContent).toBe('')
  expect(button.getAttribute('aria-label')).toBe('已复制')
  expect(writeText).toHaveBeenCalledWith(text)
  expect(editor.state.selection.toJSON()).toEqual(selection)
  expect(editor.getJSON()).toEqual(before)
  expect(editor.getHTML()).not.toContain('已复制')
  expect(editor.getHTML()).not.toContain('<button')
  editor.commands.insertContentAt(1,'updated\n')
  expect(button.querySelector('svg')?.getAttribute('data-icon')).toBe('copy')
  button.click()
  await vi.waitFor(()=>expect(writeText).toHaveBeenLastCalledWith('updated\n'+text))
})

it('reports clipboard failure without changing the document and can retry', async () => {
  setup()
  const writeText=vi.fn().mockRejectedValueOnce(new Error('denied')).mockResolvedValue(undefined)
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText}})
  const host=document.createElement('div');document.body.append(host)
  const editor=new Editor({element:host,extensions:[StarterKit.configure({codeBlock:false}),PhycatCodeBlock],content:{type:'doc',content:[{type:'codeBlock'}]}})
  editors.push(editor)
  const before=editor.getJSON()
  const button=host.querySelector<HTMLButtonElement>('.phycat-code-copy')!
  button.click()
  await vi.waitFor(()=>expect(button.querySelector('svg')?.getAttribute('data-icon')).toBe('x'))
  button.click()
  await vi.waitFor(()=>expect(button.querySelector('svg')?.getAttribute('data-icon')).toBe('check'))
  expect(writeText).toHaveBeenLastCalledWith('')
  expect(editor.getJSON()).toEqual(before)
})
