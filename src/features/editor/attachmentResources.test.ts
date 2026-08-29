// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'

import {
  ATTACHMENT_REFERENCE_PREFIX,
  attachmentReference,
  compactAttachmentSources,
  isAttachmentReference,
  loadWhenNear,
  mapWithConcurrency,
} from './attachmentResources'

describe('attachment resources', () => {
  it('keeps large image documents independent from binary payload size', () => {
    const content = Array.from({ length: 1_000 }, (_, index) => ({
      type: 'image',
      attrs: {
        attachmentId: `attachment-${index}`,
        src: attachmentReference(`attachment-${index}`),
      },
    }))
    const serialized = JSON.stringify({ schemaVersion: 1, type: 'doc', content })
    expect(serialized.length).toBeLessThan(180_000)
    expect(serialized).not.toContain('base64,')
  })

  it('recognizes only explicit CoolNote attachment references', () => {
    expect(isAttachmentReference(`${ATTACHMENT_REFERENCE_PREFIX}abc`)).toBe(true)
    expect(isAttachmentReference('data:image/png;base64,abc')).toBe(false)
    expect(isAttachmentReference('https://example.com/image.png')).toBe(false)
  })

  it('compacts legacy embedded data URLs when an attachment id is available', () => {
    const compacted = compactAttachmentSources({
      schemaVersion: 1,
      type: 'doc',
      content: [{ type: 'image', attrs: { attachmentId: 'image-1', src: `data:image/png;base64,${'a'.repeat(100_000)}` } }],
    })
    expect(compacted.content[0].attrs?.src).toBe(attachmentReference('image-1'))
    expect(JSON.stringify(compacted).length).toBeLessThan(200)
  })

  it('limits batch attachment work without changing result order', async () => {
    let active = 0
    let peak = 0
    const result = await mapWithConcurrency(
      Array.from({ length: 24 }, (_, index) => index),
      3,
      async value => {
        active += 1
        peak = Math.max(peak, active)
        await new Promise(resolve => setTimeout(resolve, 2))
        active -= 1
        return value * 2
      },
    )
    expect(peak).toBeLessThanOrEqual(3)
    expect(result).toEqual(Array.from({ length: 24 }, (_, index) => index * 2))
  })

  it('does not load an offscreen resource before intersection', () => {
    const callbacks: IntersectionObserverCallback[] = []
    const original = globalThis.IntersectionObserver
    class FakeIntersectionObserver {
      constructor(next: IntersectionObserverCallback) { callbacks.push(next) }
      observe() {}
      disconnect() {}
      unobserve() {}
      takeRecords() { return [] }
      root = null
      rootMargin = '900px'
      thresholds = [0]
    }
    globalThis.IntersectionObserver = FakeIntersectionObserver as unknown as typeof IntersectionObserver
    let loads = 0
    const element = document.createElement('div')
    const cleanup = loadWhenNear(element, () => { loads += 1 })
    expect(loads).toBe(0)
    callbacks[0]([{ target: element, isIntersecting: false } as unknown as IntersectionObserverEntry], {} as IntersectionObserver)
    expect(loads).toBe(0)
    callbacks[0]([{ target: element, isIntersecting: true } as unknown as IntersectionObserverEntry], {} as IntersectionObserver)
    expect(loads).toBe(1)
    cleanup()
    globalThis.IntersectionObserver = original
  })

  it('shares one observer across many attachment nodes', () => {
    let constructions = 0
    const original = globalThis.IntersectionObserver
    class FakeIntersectionObserver {
      constructor() { constructions += 1 }
      observe() {}
      disconnect() {}
      unobserve() {}
      takeRecords() { return [] }
      root = null
      rootMargin = '900px'
      thresholds = [0]
    }
    globalThis.IntersectionObserver = FakeIntersectionObserver as unknown as typeof IntersectionObserver
    const cleanups = Array.from({ length: 1_000 }, () => loadWhenNear(document.createElement('div'), () => undefined))
    expect(constructions).toBe(1)
    cleanups.forEach(cleanup => cleanup())
    globalThis.IntersectionObserver = original
  })
})
