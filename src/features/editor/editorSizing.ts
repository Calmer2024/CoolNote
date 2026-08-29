import { useLayoutEffect, type RefObject } from 'react'

export function fitTextareaHeight(textarea: HTMLTextAreaElement) {
  textarea.style.height = '0px'
  textarea.style.height = `${Math.ceil(textarea.scrollHeight) + 2}px`
  textarea.style.overflowY = 'hidden'
}

export function useTextareaAutoHeight(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
  identity: string,
  ready: boolean,
) {
  useLayoutEffect(() => {
    const textarea = ref.current
    if (!textarea || !ready) return
    let frame = 0
    let cancelled = false
    let measuredWidth = textarea.getBoundingClientRect().width
    const fit = () => {
      if (!cancelled && textarea.isConnected) fitTextareaHeight(textarea)
    }
    fit()
    frame = window.requestAnimationFrame(fit)
    void document.fonts?.ready.then(fit)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width ?? textarea.getBoundingClientRect().width
      if (Math.abs(width - measuredWidth) < 0.5) return
      measuredWidth = width
      fit()
    })
    observer?.observe(textarea)
    window.addEventListener('resize', fit)
    return () => {
      cancelled = true
      window.cancelAnimationFrame(frame)
      observer?.disconnect()
      window.removeEventListener('resize', fit)
    }
  }, [identity, ready, ref, value])
}
