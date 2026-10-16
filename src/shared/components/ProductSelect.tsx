import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Icon } from './Icon'
import { FloatingLayer } from './Overlay'
import './product-select.css'

type Option = { value: string; label: string }
type Props = { id?: string; label: string; value: string; options: Option[]; disabled?: boolean; searchable?: boolean; onChange: (value: string) => void }

/** Product menu, floating layer and global scrollbars; no native select popup. */
export function ProductSelect({ id, label, value, options, disabled, searchable, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const anchor = useRef<HTMLButtonElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const listId = useId()
  const filtered = options.filter(option => option.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const current = options.find(option => option.value === value)
  const close = () => { setOpen(false); anchor.current?.focus() }
  const choose = (next: string) => { close(); if (next !== value) onChange(next) }
  useEffect(() => {
    if (!open) return
    if (searchable) search.current?.focus()
    else menu.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus()
  }, [open, searchable])
  const keyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); close(); return }
    if (event.key === 'Tab') { anchor.current?.focus(); setOpen(false); return }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!filtered.length) return
      const next = event.target === search.current ? (event.key === 'ArrowDown' ? 0 : filtered.length - 1) : (index + (event.key === 'ArrowDown' ? 1 : -1) + filtered.length) % filtered.length
      setIndex(next)
      menu.current?.querySelectorAll<HTMLButtonElement>('[role="option"]')[next]?.focus()
    }
    if (event.key === 'Enter' && filtered[index]) { event.preventDefault(); choose(filtered[index].value) }
  }
  return <>
    <button id={id} ref={anchor} type="button" role="combobox" className="product-select-trigger" aria-label={label} aria-expanded={open} aria-haspopup="listbox" aria-controls={open ? listId : undefined} disabled={disabled} onClick={() => { setQuery(''); setIndex(Math.max(0, options.findIndex(option => option.value === value))); setOpen(!open) }} onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setQuery(''); setIndex(Math.max(0, options.findIndex(option => option.value === value))); setOpen(true) } }}><span>{current?.label ?? value}</span><Icon name="chevron-down" /></button>
    <FloatingLayer open={open} anchor={anchor} placement="bottom-end" className="product-menu product-select-menu product-layer" onDismiss={() => { const focusInside = menu.current?.parentElement?.contains(document.activeElement); setOpen(false); if (focusInside) anchor.current?.focus() }}>
      <div onKeyDown={keyDown}>
        {searchable && <div className="product-select-search"><Icon name="search" /><input ref={search} type="text" aria-label={`搜索${label}`} placeholder="搜索本地字体" value={query} onChange={event => { setQuery(event.target.value); setIndex(0) }} /></div>}
        <div id={listId} ref={menu} role="listbox" aria-label={label} className="product-select-options">{filtered.map((option, i) => <button type="button" role="option" aria-selected={option.value === value} className={option.value === value ? 'active' : ''} tabIndex={-1} key={option.value} onFocus={() => setIndex(i)} onClick={() => choose(option.value)}><span>{option.label}</span>{option.value === value && <Icon name="check" />}</button>)}{!filtered.length && <p className="product-select-empty">没有匹配的字体</p>}</div>
      </div>
    </FloatingLayer>
  </>
}
