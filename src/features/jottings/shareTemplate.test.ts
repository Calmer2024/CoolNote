import {describe,expect,it} from 'vitest'

import {DEFAULT_PRODUCT_BRAND_COLOR,DEFAULT_PRODUCT_INTRO,DEFAULT_PRODUCT_NAME,DEFAULT_SHARE_SETTINGS,normalizeProductUrl,productIntroFitsCover,settingsWithShareTemplate,shareSettingsFromLibrary} from './shareTemplate'

describe('share template settings',()=>{
  it('defaults first-time users to the share template and CoolNote author name',()=>{
    expect(shareSettingsFromLibrary(null)).toEqual(DEFAULT_SHARE_SETTINGS)
  })

  it('preserves unrelated library settings when saving author information',()=>{
    const settingsJson=settingsWithShareTemplate('{"theme":"dark"}',{...DEFAULT_SHARE_SETTINGS,selectedTemplate:'product',authorName:'作者',authorBio:'简介',productName:'CoolNote',productIntro:'本地优先笔记应用',productUrl:'github.com/Calmer2024/CoolNote',productBrandColor:'#7C5CE7'})
    expect(JSON.parse(settingsJson)).toEqual({theme:'dark',shareTemplate:{version:3,selectedTemplate:'product',authorName:'作者',authorBio:'简介',productName:'CoolNote',productIntro:'本地优先笔记应用',productUrl:'https://github.com/Calmer2024/CoolNote',productBrandColor:'#7c5ce7'}})
  })

  it('normalizes empty and overlong author fields',()=>{
    const library={settingsJson:JSON.stringify({shareTemplate:{selectedTemplate:'unknown',authorName:'',authorBio:'a'.repeat(60)}})}
    expect(shareSettingsFromLibrary(library)).toEqual({...DEFAULT_SHARE_SETTINGS,authorBio:'a'.repeat(40)})
  })

  it('migrates the legacy empty biography to the new default while preserving an intentional v2 blank',()=>{
    expect(shareSettingsFromLibrary({settingsJson:'{"shareTemplate":{"authorBio":""}}'}).authorBio).toBe('快来填写你个人的独特简介吧~')
    expect(shareSettingsFromLibrary({settingsJson:'{"shareTemplate":{"version":2,"authorBio":""}}'}).authorBio).toBe('')
  })

  it('normalizes product defaults, URLs and brand colors',()=>{
    expect(normalizeProductUrl('github.com/Calmer2024/CoolNote')).toBe('https://github.com/Calmer2024/CoolNote')
    expect(normalizeProductUrl('ftp://example.com')).toBeNull()
    expect(shareSettingsFromLibrary({settingsJson:'{"shareTemplate":{"selectedTemplate":"product","productName":"","productIntro":"","productUrl":"bad url","productBrandColor":"red"}}'})).toEqual({...DEFAULT_SHARE_SETTINGS,selectedTemplate:'product',productName:DEFAULT_PRODUCT_NAME,productIntro:DEFAULT_PRODUCT_INTRO,productUrl:'',productBrandColor:DEFAULT_PRODUCT_BRAND_COLOR})
  })

  it('guards the three-line product introduction budget',()=>{
    expect(productIntroFitsCover('一段简洁的产品介绍')).toBe(true)
    expect(productIntroFitsCover('产'.repeat(73))).toBe(false)
  })
})
