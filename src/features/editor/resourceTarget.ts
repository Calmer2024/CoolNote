export type ResourceKind = 'note' | 'jotting' | 'gallery'
export type ResourceTarget = { kind: ResourceKind; id: string; title: string; path: string }
export const resourceLabels = { note: '笔记', jotting: '小记', gallery: '画廊' }
export const resourceIcons = { note: 'file-text', jotting: 'feather', gallery: 'image' }
export const resourceHref = (kind: ResourceKind, id: string) => `coolnote://${kind}/${encodeURIComponent(id)}`


export function parseResourceHref(href: string): { kind: ResourceKind; id: string } | null {
  const match = /^coolnote:\/\/(note|jotting|gallery)\/([^/?#]+)$/.exec(href)
  if (!match) return null
  try { return { kind: match[1] as ResourceKind, id: decodeURIComponent(match[2]) } } catch { return null }
}
