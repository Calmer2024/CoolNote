// @vitest-environment jsdom
import { useEffect, useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { RetainedWorkspace } from './RetainedWorkspace'
import { useWorkspaceVisibility } from '../workspaceVisibility'
import { FloatingLayer } from './Overlay'

afterEach(cleanup)
it('mounts lazily and retains the same editor DOM and local draft across visits', () => {
  const mount=vi.fn(), dispose=vi.fn()
  function Editor(){useEffect(()=>{mount();return dispose},[]);return <textarea aria-label="draft" defaultValue="original"/>}
  const page=(active:boolean)=><RetainedWorkspace active={active}><Editor/></RetainedWorkspace>
  const view=render(page(false));expect(mount).not.toHaveBeenCalled()
  view.rerender(page(true));const editor=screen.getByLabelText('draft')
  fireEvent.change(editor,{target:{value:'unsaved draft'}})
  view.rerender(page(false));expect(editor.closest('[hidden]')).not.toBeNull();expect(dispose).not.toHaveBeenCalled()
  view.rerender(page(true));expect(screen.getByLabelText('draft')).toBe(editor);expect((editor as HTMLTextAreaElement).value).toBe('unsaved draft');expect(mount).toHaveBeenCalledTimes(1)
  view.unmount();expect(dispose).toHaveBeenCalledTimes(1)
})
it('freezes hidden parent props but keeps local saves alive and resumes current props', () => {
  const renders=vi.fn()
  function Page({value}:{value:string}){const [saved,setSaved]=useState(false);renders(value);return <button onClick={()=>setSaved(true)}>{value}:{String(saved)}</button>}
  const page=(active:boolean,value:string)=><RetainedWorkspace active={active}><Page value={value}/></RetainedWorkspace>
  const view=render(page(true,'one'));const button=screen.getByRole('button')
  view.rerender(page(false,'two'));expect(renders).toHaveBeenCalledTimes(1)
  fireEvent.click(button);expect(button.textContent).toBe('one:true')
  view.rerender(page(true,'three'));expect(button.textContent).toBe('three:true')
})
it('removes hidden workspace portals and deactivates its document shortcuts', () => {
  vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}})
  const shortcut=vi.fn()
  function Page(){const active=useWorkspaceVisibility();useEffect(()=>{if(!active)return;document.addEventListener('keydown',shortcut);return()=>document.removeEventListener('keydown',shortcut)},[active]);return <FloatingLayer open point={{left:10,top:10}} className="test-popup" onDismiss={()=>{}} role="menu">menu</FloatingLayer>}
  const page=(active:boolean)=><RetainedWorkspace active={active}><Page/></RetainedWorkspace>
  const view=render(page(true));expect(screen.queryByRole('menu')).not.toBeNull();fireEvent.keyDown(document,{key:'Enter'});expect(shortcut).toHaveBeenCalledTimes(1)
  view.rerender(page(false));expect(screen.queryByRole('menu')).toBeNull();fireEvent.keyDown(document,{key:'Enter'});expect(shortcut).toHaveBeenCalledTimes(1)
  view.rerender(page(true));expect(screen.queryByRole('menu')).not.toBeNull();fireEvent.keyDown(document,{key:'Enter'});expect(shortcut).toHaveBeenCalledTimes(2)
  vi.unstubAllGlobals()
})
