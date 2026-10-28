// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { applyThemeMode, registerThemeParticipant, useThemeAppearance } from './themeAppearance'
const original=Object.getOwnPropertyDescriptor(document,'startViewTransition')
beforeEach(()=>{
 document.documentElement.dataset.theme='light'
 document.documentElement.dataset.themeMode='light'
 localStorage.clear()
 vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()}))
})
afterEach(()=>{
 cleanup();vi.restoreAllMocks();vi.unstubAllGlobals()
 if(original)Object.defineProperty(document,'startViewTransition',original)
 else Reflect.deleteProperty(document,'startViewTransition')
})
it('updates colors together and persists only confirmed preferences',async()=>{
 await applyThemeMode('dark',{animate:false})
 expect(document.documentElement.dataset.theme).toBe('dark')
 expect(document.documentElement.style.colorScheme).toBe('dark')
 expect(document.documentElement.style.backgroundColor).toBe('rgb(23, 26, 30)')
 expect(localStorage.getItem('coolnote.themeMode')).toBeNull()
 await applyThemeMode('dark',{persist:true})
 expect(localStorage.getItem('coolnote.themeMode')).toBe('dark')
 expect(document.documentElement.dataset.themeChanging).toBeUndefined()
})
it('holds the shared transition until chart participants finish, merging duplicate confirmations',async()=>{
 let ready!:()=>void
 const renderChart=vi.fn(()=>new Promise<void>(resolve=>{ready=resolve}))
 const unregister=registerThemeParticipant(renderChart)
 const finished:Promise<unknown>[]=[]
 const start=vi.fn((update:()=>Promise<unknown>)=>{
  const done=Promise.resolve().then(update)
  finished.push(done)
  return {finished:done,ready:Promise.resolve(),skipTransition:vi.fn()}
 })
 Object.defineProperty(document,'startViewTransition',{configurable:true,value:start})
 try{
  const pending=applyThemeMode('dark')
  const duplicate=applyThemeMode('dark',{persist:true})
  expect(duplicate).toBe(pending)
  await Promise.resolve()
  expect(renderChart).toHaveBeenCalledTimes(1)
  expect(document.documentElement.dataset.themeChanging).toBe('true')
  ready();await pending
  expect(start).toHaveBeenCalledTimes(1)
  expect(document.documentElement.dataset.themeChanging).toBeUndefined()
 }finally{unregister()}
})
it('prevents an old transition callback from applying after a rapid reversal',async()=>{
 const callbacks:Array<()=>Promise<void>>=[]
 Object.defineProperty(document,'startViewTransition',{configurable:true,value:(update:()=>Promise<void>)=>{
  let finish!:()=>void
  const finished=new Promise<void>(resolve=>{finish=resolve})
  callbacks.push(async()=>{await update();finish()})
  return {finished,ready:Promise.resolve(),skipTransition:vi.fn()}
 }})
 const old=applyThemeMode('dark')
 await applyThemeMode('light')
 await callbacks[0]();await old
 expect(document.documentElement.dataset.theme).toBe('light')
 expect(document.documentElement.dataset.themeMode).toBe('light')
 expect(document.documentElement.dataset.themeChanging).toBeUndefined()
})
it('honors reduced motion and continues after an individual chart error',async()=>{
 vi.stubGlobal('matchMedia',()=>({matches:true}))
 const start=vi.fn()
 Object.defineProperty(document,'startViewTransition',{configurable:true,value:start})
 const unregister=registerThemeParticipant(()=>Promise.reject(new Error('chart failed')))
 try{await applyThemeMode('dark');expect(start).not.toHaveBeenCalled();expect(document.documentElement.dataset.theme).toBe('dark')}
 finally{unregister()}
})
it('listens to OS changes only when following the system and removes its listener',async()=>{
 let dark=false
 const listeners=new Set<()=>void>()
 const media={get matches(){return dark},addEventListener:(_type:string,fn:()=>void)=>listeners.add(fn),removeEventListener:(_type:string,fn:()=>void)=>listeners.delete(fn)}
 vi.stubGlobal('matchMedia',(query:string)=>query.includes('color-scheme')?media:{matches:false})
 document.documentElement.dataset.themeMode='system'
 const view=renderHook(({settings})=>useThemeAppearance(settings),{initialProps:{settings:undefined as string|undefined}})
 expect(listeners.size).toBe(1)
 await act(async()=>{dark=true;listeners.forEach(fn=>fn())})
 expect(document.documentElement.dataset.theme).toBe('dark')
 view.rerender({settings:'{"theme":"light"}'})
 expect(listeners.size).toBe(0)
 expect(document.documentElement.dataset.theme).toBe('light')
 view.unmount();expect(listeners.size).toBe(0)
})
