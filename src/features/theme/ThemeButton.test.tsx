// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useThemeAppearance } from './themeAppearance'
import { updateLibrarySettings } from '../../shared/tauri/commands'
import { ThemeButton } from './ThemeButton'
import type { LibraryDto } from '../../shared/tauri/contracts'
vi.mock('../../shared/tauri/commands',()=>({updateLibrarySettings:vi.fn()}))
function Harness(props: Parameters<typeof ThemeButton>[0]) { useThemeAppearance(props.library?.settingsJson); return <ThemeButton {...props}/> }
const library=(theme:string):LibraryDto=>({id:'theme-test',name:'test',rootPath:'',formatVersion:1,createdAt:'',lastOpenedAt:'',lastCleanShutdownAt:null,settingsRevision:1,settingsJson:JSON.stringify({theme})})
afterEach(()=>{cleanup();localStorage.clear();vi.clearAllMocks();vi.unstubAllGlobals();delete document.documentElement.dataset.theme;delete document.documentElement.dataset.themeMode})
it.each([['light',true],['dark',false]] as const)('does not replace configured %s with the system appearance during library loading',async(theme,systemDark)=>{
 vi.stubGlobal('matchMedia',()=>({matches:systemDark,addEventListener:vi.fn(),removeEventListener:vi.fn()}))
 // The first document/frame already reflects the persisted preference.
 document.documentElement.dataset.theme=theme
 document.documentElement.dataset.themeMode=theme
 const changes:string[]=[]
 const observer=new MutationObserver(records=>{for(const record of records)if(record.oldValue)changes.push(record.oldValue)})
 observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme'],attributeOldValue:true})
 const props={onLibraryChange:vi.fn(),onError:vi.fn()}
 const view=render(<Harness library={null} {...props}/> )
 await Promise.resolve()
 view.rerender(<Harness library={library(theme)} {...props}/> )
 await waitFor(()=>expect(document.documentElement.dataset.theme).toBe(theme))
 await Promise.resolve()
 observer.disconnect()
 expect(changes.every(value=>value===theme),changes.join(' → ')).toBe(true)
})

it('previews immediately, persists the confirmed mode and avoids a second system-theme pass',async()=>{
 vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()}))
 let finish!:(value:LibraryDto)=>void
 vi.mocked(updateLibrarySettings).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}))
 const initial=library('light'),updated={...initial,settingsJson:'{"theme":"dark"}',settingsRevision:2}
 const changed=vi.fn()
 render(<Harness library={initial} onLibraryChange={changed} onError={vi.fn()}/> )
 fireEvent.click(screen.getByRole('button',{name:'主题：浅色'}))
 expect(document.documentElement.dataset.theme).toBe('dark')
 expect(localStorage.getItem('coolnote.themeMode')).toBe('light')
 await act(async()=>finish(updated))
 expect(changed).toHaveBeenCalledWith(updated)
 expect(document.documentElement.dataset.theme).toBe('dark')
 expect(localStorage.getItem('coolnote.themeMode')).toBe('dark')
})
it('rolls a failed preview back to the saved theme without corrupting startup cache',async()=>{
 vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener:vi.fn(),removeEventListener:vi.fn()}))
 let fail!:(error:Error)=>void
 vi.mocked(updateLibrarySettings).mockImplementationOnce(()=>new Promise((_,reject)=>{fail=reject}))
 const onError=vi.fn()
 render(<Harness library={library('light')} onLibraryChange={vi.fn()} onError={onError}/> )
 fireEvent.click(screen.getByRole('button',{name:'主题：浅色'}))
 expect(document.documentElement.dataset.theme).toBe('dark')
 await act(async()=>fail(new Error('save failed')))
 expect(document.documentElement.dataset.theme).toBe('light')
 expect(localStorage.getItem('coolnote.themeMode')).toBe('light')
 expect(onError).toHaveBeenLastCalledWith('save failed')
})
