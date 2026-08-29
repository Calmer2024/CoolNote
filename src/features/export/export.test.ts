import { describe, expect, it } from 'vitest'

import { formatGroupPageNumber, groupDirectoryName, jottingBlockFlowHeights, paginateJottingBlocks, safeFileName } from './export'

describe('jotting group export naming and pagination', () => {
  it('sanitizes slash-containing titles before building Windows paths', () => {
    expect(safeFileName('Calmer/车窗')).toBe('Calmer-车窗')
    expect(groupDirectoryName('Calmer/车窗')).not.toContain('/')
  })

  it('keeps blocks in order and starts a new page at the content boundary', () => {
    expect(paginateJottingBlocks([{ height: 60 }, { height: 60 }, { height: 60 }], 100)).toEqual([[0], [1], [2]])
    expect(paginateJottingBlocks([{ height: 50 }, { height: 40 }, { height: 20 }], 100)).toEqual([[0, 1], [2]])
  })

  it('paginates from final flow positions so paragraph gaps cannot overflow the footer', () => {
    const heights=jottingBlockFlowHeights([
      {top:42,bottom:110,marginBottom:34},
      {top:144,bottom:230,marginBottom:28},
      {top:258,bottom:344,marginBottom:28},
      {top:372,bottom:501,marginBottom:28},
    ],42)
    expect(heights).toEqual([{height:102},{height:114},{height:114},{height:157}])
    expect(paginateJottingBlocks(heights,360)).toEqual([[0,1,2],[3]])
  })

  it('formats share-template page numbers with stable two-digit counters',()=>{
    expect(formatGroupPageNumber(0,1)).toBe('01 / 01')
    expect(formatGroupPageNumber(8,12)).toBe('09 / 12')
  })
})
