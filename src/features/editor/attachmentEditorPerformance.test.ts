// @vitest-environment jsdom

import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { getAttachmentData } = vi.hoisted(() => ({
  getAttachmentData: vi.fn(async () => 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='),
}))

vi.mock('../../shared/tauri/commands', () => ({
  getAttachmentData,
  openAttachment: vi.fn(),
  openExternalResource: vi.fn(),
  revealAttachment: vi.fn(),
}))

import { ResizableImage } from './attachmentNodes'
import { attachmentReference } from './attachmentResources'

describe('attachment editor performance gate', () => {
  const originalObserver = globalThis.IntersectionObserver

  afterEach(() => {
    globalThis.IntersectionObserver = originalObserver
    getAttachmentData.mockClear()
    document.body.replaceChildren()
  })

  it('mounts and edits a 1000-image note without eagerly decoding every image', async () => {
    const observerCallbacks: IntersectionObserverCallback[] = []
    const observed: Element[] = []
    class FakeIntersectionObserver {
      constructor(callback: IntersectionObserverCallback) { observerCallbacks.push(callback) }
      observe(element: Element) { observed.push(element) }
      disconnect() {}
      unobserve() {}
      takeRecords() { return [] }
      root = null
      rootMargin = '900px'
      thresholds = [0]
    }
    globalThis.IntersectionObserver = FakeIntersectionObserver as unknown as typeof IntersectionObserver

    const element = document.createElement('div')
    document.body.append(element)
    const content = [
      { type: 'paragraph', content: [{ type: 'text', text: 'start' }] },
      ...Array.from({ length: 1_000 }, (_, index) => ({
        type: 'image',
        attrs: {
          src: attachmentReference(`image-${index}`),
          attachmentId: `image-${index}`,
          alt: `image ${index}`,
        },
      })),
    ]
    const mountStarted = performance.now()
    const editor = new Editor({
      element,
      extensions: [StarterKit, ResizableImage.configure({ allowBase64: true, inline: false })],
      content: { type: 'doc', content },
    })
    const mountMs = performance.now() - mountStarted
    expect(mountMs).toBeLessThan(5_000)
    expect(observed).toHaveLength(1_000)
    expect(getAttachmentData).not.toHaveBeenCalled()
    expect(element.querySelectorAll('img[src]')).toHaveLength(0)

    const visible = observed.slice(0, 12).map(target => ({ target, isIntersecting: true }) as IntersectionObserverEntry)
    observerCallbacks[0](visible, {} as IntersectionObserver)
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(getAttachmentData).toHaveBeenCalledTimes(12)
    expect(element.querySelectorAll('img[src]')).toHaveLength(12)

    const editStarted = performance.now()
    editor.commands.insertContentAt(2, 'x')
    const editMs = performance.now() - editStarted
    expect(editMs).toBeLessThan(500)
    expect(editor.getText().startsWith('sx')).toBe(true)
    editor.destroy()
    console.log(`metric=mount-1000-images elapsed_ms=${mountMs.toFixed(2)} threshold_ms=5000`)
    console.log(`metric=edit-1000-images elapsed_ms=${editMs.toFixed(2)} threshold_ms=500`)
  })

  it('keeps the editor usable when an attachment file cannot be read', async () => {
    const callbacks: IntersectionObserverCallback[] = []
    const observed: Element[] = []
    class FakeIntersectionObserver {
      constructor(callback: IntersectionObserverCallback) { callbacks.push(callback) }
      observe(element: Element) { observed.push(element) }
      disconnect() {}
      unobserve() {}
      takeRecords() { return [] }
      root = null
      rootMargin = '900px'
      thresholds = [0]
    }
    globalThis.IntersectionObserver = FakeIntersectionObserver as unknown as typeof IntersectionObserver
    getAttachmentData.mockRejectedValueOnce(new Error('missing file'))
    const element = document.createElement('div')
    document.body.append(element)
    const editor = new Editor({
      element,
      extensions: [StarterKit, ResizableImage.configure({ allowBase64: true, inline: false })],
      content: { type: 'doc', content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'editable' }] },
        { type: 'image', attrs: { src: attachmentReference('missing'), attachmentId: 'missing' } },
      ] },
    })
    callbacks[0]([{ target: observed[0], isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(element.querySelector('.editor-image')?.classList.contains('is-resource-error')).toBe(true)
    expect(editor.commands.insertContentAt(2, 'x')).toBe(true)
    expect(editor.getText()).toContain('exditable')
    editor.destroy()
  })
})
