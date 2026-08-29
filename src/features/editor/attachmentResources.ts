import { getAttachmentData } from '../../shared/tauri/commands'
import type { DocumentNode, VersionedDocument } from '../../shared/tauri/contracts'

export const ATTACHMENT_REFERENCE_PREFIX = 'coolnote-attachment:'

export const attachmentReference = (attachmentId: string) =>
  `${ATTACHMENT_REFERENCE_PREFIX}${attachmentId}`

export const isAttachmentReference = (value: unknown): value is string =>
  typeof value === 'string' && value.startsWith(ATTACHMENT_REFERENCE_PREFIX)

export function compactAttachmentSources(document: VersionedDocument): VersionedDocument {
  const compactNode = (node: DocumentNode): DocumentNode => {
    const attachmentId = typeof node.attrs?.attachmentId === 'string' ? node.attrs.attachmentId : null
    const src = node.attrs?.src
    return {
      ...node,
      attrs: attachmentId && typeof src === 'string' && src.startsWith('data:')
        ? { ...node.attrs, src: attachmentReference(attachmentId) }
        : node.attrs ? { ...node.attrs } : undefined,
      content: node.content?.map(compactNode),
      marks: node.marks?.map(mark => ({ ...mark, attrs: mark.attrs ? { ...mark.attrs } : undefined })),
    }
  }
  return { ...document, content: document.content.map(compactNode) }
}

export async function resolveAttachmentSource(src: string, attachmentId?: string | null) {
  if (!isAttachmentReference(src)) return src
  const id = attachmentId || src.slice(ATTACHMENT_REFERENCE_PREFIX.length)
  if (!id) throw new Error('附件引用缺少标识')
  return getAttachmentData(id)
}

const nearCallbacks = new WeakMap<Element, () => void>()
let nearObserver: IntersectionObserver | null = null
let nearObserverCount = 0

export function loadWhenNear(element: Element, load: () => void, rootMargin = '900px') {
  if (typeof IntersectionObserver === 'undefined') {
    load()
    return () => undefined
  }
  if (!nearObserver) nearObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      const callback = nearCallbacks.get(entry.target)
      if (!callback) continue
      nearCallbacks.delete(entry.target)
      nearObserver?.unobserve(entry.target)
      nearObserverCount -= 1
      callback()
    }
    if (nearObserverCount === 0) {
      nearObserver?.disconnect()
      nearObserver = null
    }
  }, { rootMargin })
  nearCallbacks.set(element, load)
  nearObserverCount += 1
  nearObserver.observe(element)
  return () => {
    if (!nearCallbacks.delete(element)) return
    nearObserver?.unobserve(element)
    nearObserverCount -= 1
    if (nearObserverCount === 0) {
      nearObserver?.disconnect()
      nearObserver = null
    }
  }
}

export async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  worker: (value: T, index: number) => Promise<R>,
) {
  const result = new Array<R>(values.length)
  const limit = Math.max(1, Math.min(Math.floor(concurrency) || 1, values.length || 1))
  let cursor = 0
  await Promise.all(Array.from({ length: limit }, async () => {
    while (cursor < values.length) {
      const index = cursor++
      result[index] = await worker(values[index], index)
    }
  }))
  return result
}
