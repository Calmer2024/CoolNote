// @vitest-environment jsdom
import { fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { FloatingLayer } from './Overlay'

class TestResizeObserver {
  observe(){}
  unobserve(){}
  disconnect(){}
}

describe('FloatingLayer anchored positioning',()=>{
  beforeEach(()=>vi.stubGlobal('ResizeObserver',TestResizeObserver))
  afterEach(()=>vi.unstubAllGlobals())

  it('follows its anchor element when the document scrolls',async()=>{
    let top=100
    const anchor=document.createElement('p');document.body.append(anchor)
    anchor.getBoundingClientRect=()=>({left:80,top,right:280,bottom:top+20,width:200,height:20,x:80,y:top,toJSON:()=>({})})
    render(<FloatingLayer open anchor={{current:anchor}} className="test-floating-layer" onDismiss={()=>undefined}><span>输入组件</span></FloatingLayer>)
    const layer=document.querySelector<HTMLElement>('.test-floating-layer')!
    await waitFor(()=>expect(layer.style.top).toBe('126px'))
    top=220;fireEvent.scroll(window)
    await waitFor(()=>expect(layer.style.top).toBe('246px'))
  })
})
