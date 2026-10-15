import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { NoteSummaryDto } from '../../shared/tauri/contracts'

// Measure actual row heights so font scaling and section labels keep their layout.
// Small lists render normally; long lists retain only the viewport plus overscan.
export function useVirtualNotes(notes: NoteSummaryDto[], hasPinned: boolean, loading: boolean) {
  const listRef = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState({ top: 0, height: 800 })
  const [sizes, setSizes] = useState<Map<string, number>>(() => new Map())
  const virtual = notes.length > 160
  const layout = useMemo(() => {
    const offsets = [0]
    notes.forEach((note, index) => {
      const label = hasPinned && (index === 0 || !!notes[index-1]?.isPinned !== !!note.isPinned)
      offsets.push(offsets[index] + (sizes.get(note.id) ?? (84 + (label ? 34 : 0))))
    })
    return offsets
  }, [notes, sizes, hasPinned])
  const indexAt = (offset: number) => {
    let low = 0, high = notes.length
    while (low < high) { const mid = (low + high) >>> 1; if (layout[mid+1] <= offset) low = mid + 1; else high = mid }
    return low
  }
  const first = virtual ? Math.max(0, indexAt(viewport.top) - 6) : 0
  const end = virtual ? Math.min(notes.length, indexAt(viewport.top + viewport.height) + 7) : notes.length
  const readViewport = () => {
    const el = listRef.current
    if (!el) return
    const top = el.scrollTop, height = el.clientHeight || 800
    setViewport(old => old.top === top && old.height === height ? old : { top, height })
  }
  useLayoutEffect(() => {
    const el = listRef.current
    if (!el) return
    readViewport()
    let width = el.clientWidth
    const observer = new ResizeObserver(() => {
      if (el.clientWidth !== width) { width = el.clientWidth; setSizes(new Map()) }
      readViewport()
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [loading, virtual])
  useLayoutEffect(() => {
    if (!virtual) return
    const elements = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[data-virtual-note-id]') ?? [])
    const measure = () => {
      const measured = elements.map(el => [el.dataset.virtualNoteId!, el.getBoundingClientRect().height] as const).filter(([,height]) => height > 0)
      setSizes(old => {
        if (measured.every(([id,height]) => Math.abs((old.get(id) ?? 0) - height) < 0.5)) return old
        const next = new Map(old)
        for (const [id,height] of measured) next.set(id,height)
        return next
      })
    }
    measure()
    const observer = new ResizeObserver(measure)
    elements.forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [virtual, first, end, notes, hasPinned, loading])
  const reveal = (index: number) => {
    const el = listRef.current
    if (!el || index < 0 || index >= notes.length) return
    const top = layout[index], bottom = layout[index+1], height = el.clientHeight || 800
    if (top < el.scrollTop) el.scrollTop = top
    else if (bottom > el.scrollTop + height) el.scrollTop = Math.max(0,bottom-height)
    readViewport()
  }
  return { listRef, virtual, layout, first, end, readViewport, reveal }
}
