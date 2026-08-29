import { describe, expect, it, vi } from 'vitest'

import { handleGalleryCardDrop } from './galleryDragDrop'

const dropEvent = (draggedItemId: string) => ({
  dataTransfer: { getData: (type: string) => type === 'text/coolnote-gallery-item' ? draggedItemId : '' },
  preventDefault: vi.fn(),
  stopPropagation: vi.fn(),
})

describe('handleGalleryCardDrop', () => {
  it('lets external file drops bubble to the gallery import surface', () => {
    const event = dropEvent('')
    const reorder = vi.fn()
    expect(handleGalleryCardDrop(event, 'target-item', reorder)).toBe(false)
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(event.stopPropagation).not.toHaveBeenCalled()
    expect(reorder).not.toHaveBeenCalled()
  })

  it('consumes internal gallery item drops for reordering', () => {
    const event = dropEvent('source-item')
    const reorder = vi.fn()
    expect(handleGalleryCardDrop(event, 'target-item', reorder)).toBe(true)
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(event.stopPropagation).toHaveBeenCalledOnce()
    expect(reorder).toHaveBeenCalledWith('source-item', 'target-item')
  })
})
