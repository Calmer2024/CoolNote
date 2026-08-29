import {describe,expect,it} from 'vitest'

import {DEFAULT_SHARE_SETTINGS,settingsWithShareTemplate,shareSettingsFromLibrary} from './shareTemplate'

describe('share template settings',()=>{
  it('defaults first-time users to the share template and CoolNote author name',()=>{
    expect(shareSettingsFromLibrary(null)).toEqual(DEFAULT_SHARE_SETTINGS)
  })

  it('preserves unrelated library settings when saving author information',()=>{
    const settingsJson=settingsWithShareTemplate('{"theme":"dark"}',{selectedTemplate:'emotion',authorName:'作者',authorBio:'简介'})
    expect(JSON.parse(settingsJson)).toEqual({theme:'dark',shareTemplate:{version:2,selectedTemplate:'emotion',authorName:'作者',authorBio:'简介'}})
  })

  it('normalizes empty and overlong author fields',()=>{
    const library={settingsJson:JSON.stringify({shareTemplate:{selectedTemplate:'unknown',authorName:'',authorBio:'a'.repeat(60)}})}
    expect(shareSettingsFromLibrary(library)).toEqual({selectedTemplate:'share',authorName:'CoolNote 创作者',authorBio:'a'.repeat(40)})
  })

  it('migrates the legacy empty biography to the new default while preserving an intentional v2 blank',()=>{
    expect(shareSettingsFromLibrary({settingsJson:'{"shareTemplate":{"authorBio":""}}'}).authorBio).toBe('快来填写你个人的独特简介吧~')
    expect(shareSettingsFromLibrary({settingsJson:'{"shareTemplate":{"version":2,"authorBio":""}}'}).authorBio).toBe('')
  })
})
