import { createPortal } from 'react-dom'
import { type CSSProperties, type ReactNode, type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

import { Icon } from './Icon'

type TooltipState = { target: HTMLElement; label: string }

/** One delegated, anchor-following tooltip system for every labelled button. */
export function GlobalTooltip() {
  const tooltipRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<number | null>(null)
  const suppressUntilRef = useRef(0)
  const [active, setActive] = useState<TooltipState | null>(null)
  const [position, setPosition] = useState<CSSProperties>({ visibility:'hidden' })
  const update = useCallback(() => {
    if (!active || !tooltipRef.current || !active.target.isConnected) return
    const margin=8;const gap=8;const anchor=active.target.getBoundingClientRect();const box=tooltipRef.current.getBoundingClientRect()
    let left=anchor.left+(anchor.width-box.width)/2
    let top=anchor.top-box.height-gap
    if(top<margin)top=anchor.bottom+gap
    left=Math.max(margin,Math.min(left,window.innerWidth-box.width-margin))
    top=Math.max(margin,Math.min(top,window.innerHeight-box.height-margin))
    setPosition({left,top,visibility:'visible'})
  },[active])
  useLayoutEffect(update,[update])
  useEffect(()=>{
    const find=(node:EventTarget|null)=>node instanceof Element?node.closest<HTMLElement>('[data-tooltip],button[aria-label],button[title],[role="button"][aria-label]'):null
    const label=(target:HTMLElement)=>target.dataset.tooltip||target.getAttribute('aria-label')||target.getAttribute('title')||''
    const show=(target:HTMLElement,immediate=false)=>{if(performance.now()<suppressUntilRef.current)return;const value=label(target).trim();if(!value)return;if(timerRef.current!==null)window.clearTimeout(timerRef.current);const nativeTitle=target.getAttribute('title');if(nativeTitle){target.dataset.nativeTooltip=nativeTitle;target.removeAttribute('title')}timerRef.current=window.setTimeout(()=>setActive({target,label:value}),immediate?0:360)}
    const restore=(target:HTMLElement|null)=>{if(target?.dataset.nativeTooltip){target.setAttribute('title',target.dataset.nativeTooltip);delete target.dataset.nativeTooltip}}
    const hide=(target:HTMLElement|null)=>{if(timerRef.current!==null){window.clearTimeout(timerRef.current);timerRef.current=null}setActive(current=>{if(!target||current?.target===target){restore(current?.target??target);return null}return current});restore(target)}
    const over=(event:PointerEvent)=>{const target=find(event.target);if(!target||event.relatedTarget instanceof Node&&target.contains(event.relatedTarget))return;show(target)}
    const out=(event:PointerEvent)=>{const target=find(event.target);if(!target||event.relatedTarget instanceof Node&&target.contains(event.relatedTarget))return;hide(target)}
    const focus=(event:FocusEvent)=>{const target=find(event.target);if(target)show(target,true)}
    const blur=(event:FocusEvent)=>{const target=find(event.target);if(target)hide(target)}
    const dismiss=()=>{suppressUntilRef.current=performance.now()+180;hide(null)}
    const reposition=()=>update()
    document.addEventListener('pointerover',over,true);document.addEventListener('pointerout',out,true);document.addEventListener('pointerdown',dismiss,true);document.addEventListener('keydown',dismiss,true);document.addEventListener('focusin',focus,true);document.addEventListener('focusout',blur,true);window.addEventListener('resize',reposition);window.addEventListener('scroll',reposition,true)
    return()=>{if(timerRef.current!==null)window.clearTimeout(timerRef.current);document.removeEventListener('pointerover',over,true);document.removeEventListener('pointerout',out,true);document.removeEventListener('pointerdown',dismiss,true);document.removeEventListener('keydown',dismiss,true);document.removeEventListener('focusin',focus,true);document.removeEventListener('focusout',blur,true);window.removeEventListener('resize',reposition);window.removeEventListener('scroll',reposition,true)}
  },[update])
  if(!active)return null
  return createPortal(<div ref={tooltipRef} className="global-tooltip" role="tooltip" style={position}>{active.label}</div>,document.body)
}

type FloatingLayerProps = {
  open: boolean
  anchor?: RefObject<HTMLElement | null>
  boundary?: RefObject<HTMLElement | null>
  point?: { left: number; top: number }
  placement?: 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end'
  className: string
  children: ReactNode
  onDismiss: () => void
  role?: string
  gap?: number
  style?: CSSProperties
}

/** Shared light-dismiss and viewport-aware layer used by every non-modal popover. */
export function FloatingLayer({ open, anchor, boundary, point, placement = 'bottom-start', className, children, onDismiss, role, gap = 6, style }: FloatingLayerProps) {
  const layerRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<CSSProperties>({ visibility: 'hidden' })
  const update = useCallback(() => {
    const layer = layerRef.current
    if (!layer || !open) return
    const margin = 8
    const minimumHeight = 80
    const box = layer.getBoundingClientRect()
    const anchorBox = anchor?.current?.getBoundingClientRect()
    const boundaryBox = boundary?.current?.getBoundingClientRect()
    const bounds = {
      left: Math.max(margin, boundaryBox?.left ?? margin),
      top: Math.max(margin, boundaryBox?.top ?? margin),
      right: Math.min(window.innerWidth - margin, boundaryBox?.right ?? window.innerWidth - margin),
      bottom: Math.min(window.innerHeight - margin, boundaryBox?.bottom ?? window.innerHeight - margin),
    }
    const originLeft = point?.left ?? anchorBox?.left ?? bounds.left
    const originTop = point?.top ?? anchorBox?.bottom ?? bounds.top
    let left = placement.endsWith('end') ? (anchorBox?.right ?? originLeft) - box.width : originLeft
    let top = placement.startsWith('top') ? (anchorBox?.top ?? originTop) - box.height - gap : originTop + (point ? 0 : gap)
    let maxHeight = Math.max(minimumHeight, bounds.bottom - top)
    if(anchorBox){
      const above=Math.max(0,anchorBox.top-bounds.top-gap);const below=Math.max(0,bounds.bottom-anchorBox.bottom-gap)
      const preferAbove=placement.startsWith('top');const useAbove=preferAbove?above>=minimumHeight||above>=below:box.height>below&&above>below
      maxHeight=Math.max(minimumHeight,useAbove?above:below)
      const visibleHeight=Math.min(box.height,maxHeight)
      top=useAbove?anchorBox.top-visibleHeight-gap:anchorBox.bottom+gap
    }
    const boundaryHeight=Math.max(0,bounds.bottom-bounds.top)
    maxHeight=Math.min(maxHeight,boundaryHeight)
    const visibleHeight=Math.min(box.height,maxHeight)
    left = Math.max(Math.ceil(bounds.left), Math.min(left, Math.floor(bounds.right - box.width)))
    top = Math.max(Math.ceil(bounds.top), Math.min(top, Math.floor(bounds.bottom - visibleHeight)))
    const next={ left:Math.round(left), top:Math.round(top), visibility:'visible' as const, maxHeight:Math.floor(maxHeight) }
    setPosition(current=>current.left===next.left&&current.top===next.top&&current.visibility===next.visibility&&current.maxHeight===next.maxHeight?current:next)
  }, [anchor, boundary, gap, open, placement, point?.left, point?.top])
  useLayoutEffect(update, [update])
  useEffect(() => {
    if (!open) return
    const dismiss = (event: PointerEvent) => {
      const target = event.target as Node
      if (!layerRef.current?.contains(target) && !anchor?.current?.contains(target)) onDismiss()
    }
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && onDismiss()
    const reposition = (event?: Event) => {
      if (event?.type === 'scroll' && event.target instanceof Node && layerRef.current?.contains(event.target)) return
      update()
    }
    document.addEventListener('pointerdown', dismiss, true)
    document.addEventListener('keydown', escape, true)
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    const observer = new ResizeObserver(() => reposition())
    if (anchor?.current) observer.observe(anchor.current)
    if (boundary?.current) observer.observe(boundary.current)
    if (layerRef.current) observer.observe(layerRef.current)
    return () => {
      document.removeEventListener('pointerdown', dismiss, true)
      document.removeEventListener('keydown', escape, true)
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
      observer.disconnect()
    }
  }, [anchor, boundary, onDismiss, open, update])
  if (!open) return null
  return createPortal(<div ref={layerRef} className={className} role={role} style={{ ...style, ...position }}>{children}</div>, document.body)
}

export type DialogState = {
  title: string
  description?: string
  label?: string
  value?: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: (value: string) => void | Promise<void>
}

type DialogProps = {
  state: DialogState | null
  busy?: boolean
  onClose: () => void
}

export function ProductDialog({ state, busy = false, onClose }: DialogProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [submitting, setSubmitting] = useState(false)
  useEffect(() => {
    if (!state) return
    setSubmitting(false)
    const timer = window.setTimeout(() => inputRef.current?.select(), 30)
    const close = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    document.addEventListener('keydown', close)
    return () => { window.clearTimeout(timer); document.removeEventListener('keydown', close) }
  }, [onClose, state])
  if (!state) return null
  let currentValue = state.value ?? ''
  return <div className="product-dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <form className="product-dialog" role="dialog" aria-modal="true" aria-labelledby="product-dialog-title" onSubmit={(event) => { event.preventDefault(); if(submitting||busy)return; setSubmitting(true); void (async()=>{try{await state.onConfirm(currentValue);onClose()}finally{setSubmitting(false)}})() }}>
      <div className="dialog-icon"><Icon name={state.danger ? 'triangle-alert' : 'sparkles'} /></div>
      <h2 id="product-dialog-title">{state.title}</h2>
      {state.description && <p>{state.description}</p>}
      {state.label && <label>{state.label}<input ref={inputRef} defaultValue={state.value} onChange={(event) => { currentValue = event.target.value }} /></label>}
      <div className="dialog-actions"><button type="button" onClick={onClose} disabled={submitting||busy}>取消</button><button type="submit" className={state.danger ? 'danger primary' : 'primary'} disabled={submitting||busy}>{submitting||busy ? '处理中…' : state.confirmLabel ?? '确认'}</button></div>
    </form>
  </div>
}

export type ToastState = { id: number; message: string; undo?: () => void | Promise<void>; tone?: 'success' | 'error' | 'info' }

export function ProductToast({ toast, onClose }: { toast: ToastState | null; onClose: () => void }) {
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose }, [onClose])
  const timeoutMs = toast?.undo ? 8000 : 3000
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => closeRef.current(), timeoutMs)
    return () => window.clearTimeout(timer)
  }, [toast?.id, timeoutMs])
  if (!toast) return null
  return <div className={`product-toast ${toast.tone??'success'}`} role={toast.tone==='error'?'alert':'status'}><Icon name={toast.tone==='error'?'message-square':'check-square'} /><span>{toast.message}</span>{toast.undo && <button onClick={() => { void toast.undo?.(); onClose() }}>撤销</button>}<button className="toast-close" aria-label="关闭" onClick={onClose}><Icon name="x" /></button></div>
}

export type ProgressToastState = { id: number; title: string; current: number; total: number; detail: string; active: boolean; actionLabel?: string; onAction?: () => void }

export function ProductProgressToast({ toast, onClose }: { toast: ProgressToastState | null; onClose: () => void }) {
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose }, [onClose])
  useEffect(() => {
    if (!toast || toast.active) return
    const timer = window.setTimeout(() => closeRef.current(), 3000)
    return () => window.clearTimeout(timer)
  }, [toast?.active, toast?.id])
  if (!toast) return null
  return <div className="product-toast product-progress-toast info" role="status"><Icon name={toast.active?'image-up':'check-square'} /><div className="progress-toast-content"><div><strong>{toast.title}</strong><span>{toast.current} / {toast.total}</span></div><progress value={toast.current} max={Math.max(1,toast.total)}/><small>{toast.detail}</small></div>{toast.active&&toast.onAction&&<button onClick={toast.onAction}>{toast.actionLabel??'取消'}</button>}<button className="toast-close" aria-label="关闭" onClick={onClose}><Icon name="x" /></button></div>
}
