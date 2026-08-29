import { describe, expect, it } from 'vitest'
import { normalizeDocument } from './document'

describe('document block identity normalization', () => {
  it('regenerates duplicate block ids so outline navigation is unambiguous', () => {
    const normalized = normalizeDocument({ schemaVersion:1, type:'doc', content:[
      { type:'heading', attrs:{ level:1, blockId:'11111111-1111-4111-8111-111111111111' }, content:[{ type:'text', text:'甲' }] },
      { type:'heading', attrs:{ level:2, blockId:'11111111-1111-4111-8111-111111111111' }, content:[{ type:'text', text:'乙' }] },
    ] as any })
    const ids = normalized.content.map(node => node.attrs?.blockId)
    expect(ids[0]).toBe('11111111-1111-4111-8111-111111111111')
    expect(ids[1]).not.toBe(ids[0])
  })
})
