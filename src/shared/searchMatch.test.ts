// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { matchesSearch } from './searchMatch'
import { webCreateJotting, webCreate, webSave, webGlobalSearch } from './tauri/webStore'

it('matches literal names, full pinyin, initials, spaces and mixed Latin names',()=>{
  for(const query of ['文本','wenbenhuitu','WBHT','wen ben hui tu',"hui'tu"]){
    expect(matchesSearch('文本绘图',query),query).toBe(true)
  }
  expect(matchesSearch('CoolNote项目2026','coolnotexm2026')).toBe(true)
  expect(matchesSearch('旅行','lvxing')).toBe(true)
  for(const query of ['chongxinmingming','CXMM','zhongxinmingming','ZXMM'])expect(matchesSearch('重新命名',query)).toBe(true)
  expect(matchesSearch('文本绘图','unknown')).toBe(false)
  expect(matchesSearch('代码块 code','CODE')).toBe(true)
  expect(matchesSearch('文本绘图','')).toBe(true)
})

it('finds names in global web search without changing literal body search',()=>{
  const note=webCreate()
  webSave({noteId:note.id,baseRevision:note.revision,title:'项目计划',documentJson:note.document,markdownSnapshot:'',clientTransactionId:'pinyin-test'})
  const jotting=webCreateJotting('生活记录')
  expect(webGlobalSearch('xiangmujihua',50).some(hit=>hit.id===note.id)).toBe(true)
  expect(webGlobalSearch('XMJH',50).some(hit=>hit.id===note.id)).toBe(true)
  expect(webGlobalSearch('sheng huo ji lu',50).some(hit=>hit.id===jotting.id)).toBe(true)
  expect(webGlobalSearch('生活',50).some(hit=>hit.id===jotting.id)).toBe(true)
})
