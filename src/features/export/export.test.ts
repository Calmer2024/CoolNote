import { describe, expect, it } from 'vitest'

// @vitest-environment jsdom

import { createNightPage, createProductCover, formatNightTimestamp, formatGroupPageNumber, groupDirectoryName, hasVisibleBlockContent, jottingBlockFlowHeights, paginateJottingBlocks, safeFileName } from './export'

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


  it('keeps the product terminal and mascot visible when the product URL is empty',()=>{
    const stage=document.createElement('div')
    createProductCover(stage,{logoDataUrl:'',name:'Codex Switch',intro:'产品介绍',url:'',brandColor:'#1687e8'})
    expect(stage.querySelector('.coolnote-product-terminal')).not.toBeNull()
    expect(stage.querySelector('.coolnote-product-mascot')).not.toBeNull()
  })

  it('keeps top-level image blocks when building template pages',()=>{
    const image=document.createElement('img')
    image.src='data:image/png;base64,abc'
    expect(hasVisibleBlockContent(image)).toBe(true)
  })

  it('fills the night top corners and reserves the bottom corner for pagination',()=>{
    const stage=document.createElement('div')
    const timestamp=new Date(2026,8,2,19,58).toISOString()
    const {page,number}=createNightPage(stage,{name:'失效样本',bio:'@sample404',avatarDataUrl:'data:image/png;base64,abc'},timestamp)
    expect(page.querySelector('header')?.textContent).toBe('19:58 · Sep 2, 2026@失效样本')
    expect(page.querySelector('img')).toBeNull()
    expect(page.textContent).not.toContain('@sample404')
    expect(page.querySelector('time')?.textContent).toBe('19:58 · Sep 2, 2026')
    expect(page.querySelector('time')?.getAttribute('datetime')).toBe(timestamp)
    number.textContent=formatGroupPageNumber(1,3)
    expect(page.querySelector('.coolnote-night-page-number')?.textContent).toBe('02 / 03')
    expect(page.style.backgroundColor).toBe('rgb(0, 0, 0)')
    expect(page.querySelector('.jotting-cover')).toBeNull()
  })

  it('omits an unavailable timestamp instead of exporting an invalid date',()=>{
    expect(formatNightTimestamp('')).toBe('')
    const {page}=createNightPage(document.createElement('div'),{name:'作者',bio:'',avatarDataUrl:null},'')
    expect(page.querySelector('time')).toBeNull()
    expect(page.querySelector('header')?.textContent).toBe('@作者')
  })
})
