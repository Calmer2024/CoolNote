import { describe, expect, it } from 'vitest'

import { galleryGroupForDrop, imageDropIntent, imageLayoutRuns } from './imageLayout'

describe('imageLayoutRuns', () => {
  it('keeps images from separate paste lines in separate rows', () => {
    expect(imageLayoutRuns([
      { type: 'image', galleryGroup: 'paste-a' },
      { type: 'image', galleryGroup: 'paste-a' },
      { type: 'image', galleryGroup: 'paste-b' },
    ])).toEqual([[0, 1], [2]])
  })

  it('breaks a row around non-image attachments', () => {
    expect(imageLayoutRuns([
      { type: 'image', galleryGroup: 'paste-a' },
      { type: 'media' },
      { type: 'image', galleryGroup: 'paste-b' },
    ])).toEqual([[0], [2]])
  })

  it('absorbs an image into the target row only when dropped on its right edge', () => {
    expect(galleryGroupForDrop('row-b', 'row-a', 'right', () => 'new-row')).toBe('row-a')
    expect(galleryGroupForDrop('row-b', 'row-a', 'left', () => 'new-row')).toBe('row-b')
    expect(galleryGroupForDrop('row-b', null, null, () => 'new-row')).toBe('row-b')
  })

  it('creates a row group when absorbing into a legacy ungrouped image', () => {
    expect(galleryGroupForDrop('row-b', null, 'right', () => 'generated-row')).toBe('generated-row')
  })

  it('merges a lower image into the row above regardless of horizontal half', () => {
    expect(imageDropIntent({ sourceTop: 520, targetTop: 120, targetSide: 'left' })).toBe('merge')
    expect(galleryGroupForDrop('row-b', 'row-a', 'merge', () => 'new-row')).toBe('row-a')
  })

  it('detaches a grouped image when it is dragged into a new line below', () => {
    expect(imageDropIntent({ sourceTop: 120, targetTop: null, targetSide: null })).toBe('detach')
    expect(galleryGroupForDrop('row-a', null, 'detach', () => 'row-c')).toBe('row-c')
  })
})
