// @vitest-environment jsdom
import html from '../../../index.html?raw'
import { afterEach, expect, it, vi } from 'vitest'
afterEach(()=>{localStorage.clear();vi.unstubAllGlobals();document.documentElement.removeAttribute('data-theme');document.documentElement.removeAttribute('data-theme-mode');document.documentElement.removeAttribute('style');Reflect.deleteProperty(window,'__COOLNOTE_THEME_MODE__')})
it.each([
 ['light','dark',true,'light'],
 ['dark','light',false,'dark'],
 [undefined,'dark',false,'dark'],
 ['system','light',true,'dark'],
 [undefined,'invalid',false,'light'],
] as const)('sets the first document theme before app code (native=%s cache=%s systemDark=%s)',(native,cached,systemDark,expected)=>{
 Object.defineProperty(window,'__COOLNOTE_THEME_MODE__',{configurable:true,value:native})
 localStorage.setItem('coolnote.themeMode',cached)
 vi.stubGlobal('matchMedia',()=>({matches:systemDark}))
 const match=html.match(/<script data-theme-bootstrap>([\s\S]*?)<\/script>/)
 new Function('window','document',match?.[1]??'')(window,document)
 expect(document.documentElement.dataset.theme).toBe(expected)
 expect(document.documentElement.style.colorScheme).toBe(expected)
 expect(document.documentElement.style.backgroundColor).toBe(expected==='dark'?'rgb(23, 26, 30)':'rgb(255, 255, 255)')
 expect(html.indexOf('<script data-theme-bootstrap>')).toBeLessThan(html.indexOf('<link rel="stylesheet"'))
})
