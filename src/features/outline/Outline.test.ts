import { describe, expect, it } from 'vitest'
import { deriveOutline } from './Outline'

const heading = (blockId:string, text:string) => ({ type:'heading', attrs:{ blockId, level:2 }, content:[{ type:'text', text }] })

describe('outline derivation', () => {
  it('keeps document order and ignores non-heading blocks', () => {
    const result = deriveOutline({ schemaVersion:1, type:'doc', content:[
      { type:'paragraph', attrs:{ blockId:'p' }, content:[{ type:'text', text:'正文' }] },
      heading('h-1','第一章'), heading('h-2','第二章'),
    ] as any })
    expect(result.map(item => item.blockId)).toEqual(['h-1','h-2'])
  })

  it('filters duplicate block ids so navigation keys stay unique', () => {
    const result = deriveOutline({ schemaVersion:1, type:'doc', content:[heading('same','甲'), heading('same','乙')] as any })
    expect(result).toHaveLength(1)
  })
})
