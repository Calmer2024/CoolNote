import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { Icon } from '../../shared/components/Icon'
import { FloatingLayer } from '../../shared/components/Overlay'
import { ContentSkeleton } from '../../shared/components/Skeleton'
import { getJottingSnapshot, listGalleries, queryNotes } from '../../shared/tauri/commands'
import type { CategoryDto, JottingFolderDto } from '../../shared/tauri/contracts'
import { resourceIcons, resourceLabels, type ResourceKind, type ResourceTarget } from './resourceTarget'

export function resourcePath(id: string | null, folders: Array<{ id: string; parentId: string | null; name: string }>): string {
  const parts: string[] = [], seen = new Set<string>()
  while (id && !seen.has(id)) {
    seen.add(id)
    const folder = folders.find(item => item.id === id)
    if (!folder) break
    parts.unshift(folder.name); id = folder.parentId
  }
  return parts.join(' / ')
}
type Entry = ResourceTarget & { group: string | null }
type Location = { kind: ResourceKind | null; folderId: string | null }
type MenuRow = { key: string; label: string; detail?: string; icon: string; location?: Location; target?: ResourceTarget }
const ROOT: Location = { kind: null, folderId: null }

export function ResourcePicker({ anchor, categories, onChoose, onDismiss }: {
  anchor: RefObject<HTMLElement | null>; categories: CategoryDto[]; onChoose: (target: ResourceTarget) => void; onDismiss: () => void
}) {
  const [location, setLocation] = useState<Location>(ROOT)
  const [query, setQuery] = useState('')
  const [entries, setEntries] = useState<Entry[]>([])
  const [folders, setFolders] = useState<JottingFolderDto[]>([])
  const [loading, setLoading] = useState(true)
  const [errors, setErrors] = useState<Partial<Record<ResourceKind, string>>>({})
  const [attempt, setAttempt] = useState(0)
  const [index, setIndex] = useState(0)
  const rowId = useId()
  const input = useRef<HTMLInputElement>(null)
  const results = useRef<HTMLDivElement>(null)
  const searching = !!query.trim()
  useEffect(() => {
    // FloatingLayer measures while hidden on mount; focus after its visible layout commits.
    const frame = requestAnimationFrame(() => input.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [])
  useEffect(() => {
    let active = true
    setLoading(true); setErrors({})
    const notes = async (): Promise<Entry[]> => {
      const all: Entry[] = []
      for (const view of ['all', 'archived'] as const) {
        let offset = 0
        while (active) {
          const page = await queryNotes({ view, sortBy: 'updatedAt', sortDirection: 'desc', offset, limit: 200 })
          all.push(...page.items.filter(item => !item.deletedAt).map(item => ({ kind: 'note' as const, id: item.id, title: item.title || '无标题笔记', path: resourcePath(item.categoryId, categories) || '未分类', group: item.categoryId })))
          offset += page.items.length
          if (!page.items.length || offset >= page.total) break
        }
      }
      return [...new Map(all.map(item => [item.id, item])).values()]
    }
    void Promise.allSettled([notes(), getJottingSnapshot(), listGalleries()]).then(([noteResult, jottingResult, galleryResult]) => {
      if (!active) return
      const next: Entry[] = [], failures: Partial<Record<ResourceKind, string>> = {}
      if (noteResult.status === 'fulfilled') next.push(...noteResult.value)
      else failures.note = '无法加载笔记'
      if (jottingResult.status === 'fulfilled') {
        const snapshot = jottingResult.value
        setFolders(snapshot.folders)
        next.push(...snapshot.jottings.map(item => ({ kind: 'jotting' as const, id: item.id, title: item.name.replace(/\.md$/i, ''), path: resourcePath(item.folderId, snapshot.folders) || '未分类', group: item.folderId })))
      } else failures.jotting = '无法加载小记'
      if (galleryResult.status === 'fulfilled') next.push(...galleryResult.value.map(item => ({ kind: 'gallery' as const, id: item.id, title: item.name, path: '', group: null })))
      else failures.gallery = '无法加载画廊'
      setEntries(next); setErrors(failures); setLoading(false)
    })
    return () => { active = false }
  }, [categories, attempt])
  const rows = useMemo<MenuRow[]>(() => {
    if (searching) {
      const needle = query.trim().toLocaleLowerCase()
      return entries.filter(item => `${item.title} ${item.path} ${resourceLabels[item.kind]}`.toLocaleLowerCase().includes(needle)).map(item => ({ key: `${item.kind}-${item.id}`, label: item.title, detail: `${resourceLabels[item.kind]}${item.path ? ` · ${item.path}` : ''}`, icon: resourceIcons[item.kind], target: item }))
    }
    if (!location.kind) return (Object.keys(resourceLabels) as ResourceKind[]).map(kind => ({ key: kind, label: resourceLabels[kind], icon: resourceIcons[kind], location: { kind, folderId: null } }))
    const { kind, folderId } = location
    const directory = kind === 'note' ? categories : kind === 'jotting' ? folders : []
    const groups: MenuRow[] = directory.filter(item => item.parentId === folderId).map(item => ({ key: `folder-${item.id}`, label: item.name, icon: 'iconName' in item && typeof item.iconName === 'string' ? item.iconName : 'folder', location: { kind, folderId: item.id } }))
    const files: MenuRow[] = entries.filter(item => item.kind === kind && (kind === 'gallery' || item.group === folderId || (!folderId && !directory.some(folder => folder.id === item.group)))).map(item => ({ key: `${kind}-${item.id}`, label: item.title, icon: resourceIcons[kind], target: item }))
    return [...groups, ...files]
  }, [searching, query, entries, location, categories, folders])
  const navigate = (next: Location) => { setLocation(next); setIndex(0); input.current?.focus() }
  const back = () => {
    if (searching) { setQuery(''); return }
    if (!location.folderId) { navigate(ROOT); return }
    const directory = location.kind === 'note' ? categories : folders
    navigate({ kind: location.kind, folderId: directory.find(item => item.id === location.folderId)?.parentId ?? null })
  }
  const activate = (row: MenuRow) => { if (row.target) onChoose(row.target); else if (row.location) navigate(row.location) }
  const keyDown = (event: KeyboardEvent) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return
    const buttons = Array.from(results.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])
    const focused = buttons.findIndex(button => button.contains(event.target as Node))
    const fromInput = event.target === input.current
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); event.stopPropagation()
      if (!buttons.length) return
      const current = focused >= 0 ? focused : index
      const next = (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
      setIndex(next); input.current?.focus()
    }
    if ((event.key === 'Enter' || (event.key === 'ArrowRight' && !query)) && (fromInput || focused >= 0)) {
      event.preventDefault(); event.stopPropagation()
      const row = rows[focused >= 0 ? focused : index]
      if (row && buttons.length) activate(row)
    }
    if (event.key === 'ArrowLeft' && !query) { event.preventDefault(); event.stopPropagation(); back() }
  }
  useEffect(() => { setIndex(0) }, [query])
  useEffect(() => { results.current?.querySelector('.active')?.scrollIntoView?.({ block: 'nearest' }) }, [index])
  const directory = location.kind === 'note' ? categories : folders
  const label = searching ? '搜索结果' : location.folderId ? directory.find(item => item.id === location.folderId)?.name ?? '分类' : location.kind ? resourceLabels[location.kind] : '引用'
  const error = location.kind && !searching ? errors[location.kind] : searching ? Object.values(errors).join('、') : ''
  return <FloatingLayer open anchor={anchor} className="resource-picker product-menu product-layer" onDismiss={onDismiss} role="dialog">
    <div onKeyDown={keyDown}>
    <label className="resource-picker-search"><Icon name="search" /><input ref={input} aria-label="搜索引用资源" aria-activedescendant={rows[index] ? `${rowId}-${index}` : undefined} placeholder="搜索笔记、小记、画廊…" value={query} onChange={event => setQuery(event.target.value)} /></label>
    {(location.kind || searching) && <><button type="button" className="resource-picker-back" onClick={back} aria-label="返回上一级"><Icon name="chevron-right" /><span>{label}</span></button><div className="separator" /></>}
    <div className="resource-picker-results" ref={results} role="menu" aria-label={searching ? '引用搜索结果' : `${label}资源`} aria-busy={loading && (!!location.kind || searching)}>
      {loading && (location.kind || searching) ? <ContentSkeleton cards={2} /> : <>{rows.map((row, i) => <button type="button" role="menuitem" id={`${rowId}-${i}`} tabIndex={-1} onMouseDown={event => event.preventDefault()} onMouseEnter={() => setIndex(i)} className={index === i ? 'active' : ''} key={row.key} onFocus={() => setIndex(i)} onClick={() => activate(row)}><Icon name={row.icon} /><span className="resource-picker-row-copy"><span>{row.label}</span>{row.detail && <small>{row.detail}</small>}</span>{row.location && <Icon name="chevron-right" />}</button>)}{!rows.length && !error && <p className="resource-picker-empty">{searching ? '没有匹配的资源' : '暂无可引用的资源'}</p>}{error && <div className="resource-picker-empty" role="alert"><p>{error}</p><button type="button" onClick={() => setAttempt(value => value + 1)}>重新加载</button></div>}</>}
    </div>
    </div>
  </FloatingLayer>
}
