// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const api=vi.hoisted(()=>({listGalleries:vi.fn(),listGalleryItems:vi.fn()}))
vi.mock('../../shared/tauri/commands',()=>api)
import { GalleryWorkspace } from './GalleryWorkspace'
const galleries=['A','B','C'].map(id=>({id,name:`画廊 ${id}`,introduction:'',cover:null,revision:1,itemCount:1}))
const item=(id:string)=>({id,galleryId:id,originalFileName:`${id}.png`,thumbnailDataUrl:'data:image/png;base64,AA==',isAnimated:false})
beforeEach(()=>{vi.clearAllMocks();localStorage.clear();api.listGalleries.mockResolvedValue(galleries)})
afterEach(cleanup)
const page=()=>render(<GalleryWorkspace collapsed={false} onToggle={vi.fn()} onToast={vi.fn()} onError={vi.fn()} onCountChange={vi.fn()} onConfirm={vi.fn()}/> )

it('shows the shared loading state and ignores stale responses after rapid gallery changes',async()=>{
  const pending=new Map<string,(value:unknown)=>void>()
  api.listGalleryItems.mockImplementation((id:string)=>id==='A'?Promise.resolve({items:[item(id)],total:1}):new Promise(resolve=>pending.set(id,resolve)))
  page()
  await screen.findByAltText('A.png')
  fireEvent.click(screen.getByRole('button',{name:'画廊 B1'}))
  expect(screen.getByRole('status',{name:'正在加载画廊'})).toBeTruthy()
  expect(screen.queryByAltText('A.png')).toBeNull()
  fireEvent.click(screen.getByRole('button',{name:'画廊 C1'}))
  await waitFor(()=>expect(pending.has('C')).toBe(true))
  await act(async()=>{pending.get('C')?.({items:[item('C')],total:1})})
  expect(screen.getByAltText('C.png')).toBeTruthy()
  await act(async()=>{pending.get('B')?.({items:[item('B')],total:1})})
  expect(screen.getByAltText('C.png')).toBeTruthy()
  expect(screen.queryByAltText('B.png')).toBeNull()
  expect(screen.queryByRole('status',{name:'正在加载画廊'})).toBeNull()
})

it('shows a retry action on load failure and recovers without stale images',async()=>{
  api.listGalleryItems.mockRejectedValueOnce(new Error('读取失败')).mockResolvedValue({items:[item('A')],total:1})
  page()
  expect((await screen.findByRole('alert')).textContent).toContain('读取失败')
  fireEvent.click(screen.getByRole('button',{name:'重新加载'}))
  await screen.findByAltText('A.png')
  expect(screen.queryByRole('alert')).toBeNull()
})
