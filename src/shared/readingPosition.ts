import { useEffect, type RefObject } from 'react'
import { readWorkspaceMemory, writeWorkspaceMemory } from './workspaceMemory'

export type ReadingPosition={top:number;ratio:number;blockId:string;text:string;index:number;offset:number}
const emptyPosition:ReadingPosition={top:0,ratio:0,blockId:'',text:'',index:0,offset:0}

function blocks(container:HTMLElement){
  return Array.from(container.querySelectorAll<HTMLElement>('.tiptap > *, .jotting-markdown > *'))
}
const blockText=(block:HTMLElement)=>(block.textContent??'').trim().slice(0,160)
const relativeTop=(container:HTMLElement,block:HTMLElement)=>block.getBoundingClientRect().top-container.getBoundingClientRect().top-container.clientTop

export function captureReadingPosition(container:HTMLElement):ReadingPosition{
  const top=container.scrollTop,max=Math.max(0,container.scrollHeight-container.clientHeight)
  const candidates=blocks(container)
  // Top-level blocks follow document order. Avoid measuring every preceding
  // paragraph on each scroll in a long note.
  const viewportTop=container.getBoundingClientRect().top+container.clientTop
  let low=0,high=candidates.length
  while(low<high){
    const middle=(low+high)>>>1,box=candidates[middle].getBoundingClientRect()
    if(box.top+box.height>viewportTop)high=middle
    else low=middle+1
  }
  const index=low<candidates.length?low:-1
  const block=candidates[index]
  return {top,ratio:max?top/max:0,blockId:block?.dataset.blockId??'',text:block?blockText(block):'',index:Math.max(0,index),offset:block?-relativeTop(container,block):0}
}

export function restoreReadingPosition(container:HTMLElement,position:ReadingPosition){
  const candidates=blocks(container)
  let top=position.top
  if(top>0){
    const exact=candidates.find(block=>!!position.blockId&&block.dataset.blockId===position.blockId)
      ??candidates.reduce<HTMLElement|undefined>((best,block,index)=>{
        if(!position.text||blockText(block)!==position.text)return best
        return !best||Math.abs(index-position.index)<Math.abs(candidates.indexOf(best)-position.index)?block:best
      },undefined)
    const block=exact??candidates[Math.min(position.index,candidates.length-1)]
    top=block?container.scrollTop+relativeTop(container,block)+Math.min(position.offset,Math.max(0,block.getBoundingClientRect().height-1)):position.ratio*Math.max(0,container.scrollHeight-container.clientHeight)
  }
  const behavior=container.style.scrollBehavior
  container.style.scrollBehavior='auto'
  container.scrollTop=Math.max(0,Math.min(top,container.scrollHeight-container.clientHeight))
  container.style.scrollBehavior=behavior
}

/** Persist per content, including leaving retained workspaces and closing the app. */
export function useReadingPosition(key:string|null,ref:RefObject<HTMLElement|null>,ready:boolean,visible:boolean){
  useEffect(()=>{
    const container=ref.current
    if(!key||!ready||!visible||!container)return
    const storageKey=`reading.${key}`
    const saved=readWorkspaceMemory(storageKey,emptyPosition)
    const valid=Object.values(saved).every(value=>typeof value!=='number'||Number.isFinite(value))
    let last=valid?saved:emptyPosition,restoring=true,restored=false,restoredTop=0,timer:number|undefined
    const restore=()=>{
      if(!restoring||!container.clientHeight)return
      restoreReadingPosition(container,valid?saved:emptyPosition)
      restoredTop=container.scrollTop
      restored=true
      last=captureReadingPosition(container)
    }
    const persist=()=>{if(restored)writeWorkspaceMemory(storageKey,last)}
    const record=()=>{
      if(!restored)return
      if(Math.abs(container.scrollTop-restoredTop)>1)restoring=false
      last=captureReadingPosition(container)
      window.clearTimeout(timer);timer=window.setTimeout(persist,180)
    }
    const interact=()=>{restore();restoring=false}
    const frame=window.requestAnimationFrame(restore)
    // Images, fonts and diagrams may change layout after the first frame.
    const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(()=>{restore()})
    observer?.observe(container)
    for(const child of Array.from(container.children))observer?.observe(child)
    container.addEventListener('load',restore,true)
    container.addEventListener('scroll',record,{passive:true})
    for(const type of ['wheel','pointerdown','keydown','touchstart'])container.addEventListener(type,interact,{passive:true})
    window.addEventListener('pagehide',persist)
    window.addEventListener('beforeunload',persist)
    return()=>{
      window.cancelAnimationFrame(frame);window.clearTimeout(timer);observer?.disconnect()
      container.removeEventListener('load',restore,true);container.removeEventListener('scroll',record)
      for(const type of ['wheel','pointerdown','keydown','touchstart'])container.removeEventListener(type,interact)
      window.removeEventListener('pagehide',persist);window.removeEventListener('beforeunload',persist);persist()
    }
  },[key,ref,ready,visible])
}
