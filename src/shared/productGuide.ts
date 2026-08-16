import guideMarkdown from './product-guide.md?raw'

import type { DocumentNode, VersionedDocument } from './tauri/contracts'

export const PRODUCT_GUIDE_TITLE = '欢迎使用 CoolNote'
export const PRODUCT_GUIDE_MARKDOWN = guideMarkdown.trim()
export const PRODUCT_GUIDE_VERSION = 'builtin-product-guide-v2'

const blockId = (index:number) => `20000000-0000-4000-8000-${String(index).padStart(12,'0')}`
const text = (value:string):DocumentNode => ({type:'text',text:value})
const paragraph = (value:string):DocumentNode => ({type:'paragraph',content:value?[text(value)]:[]})

export function buildProductGuideDocument(markdown=PRODUCT_GUIDE_MARKDOWN):VersionedDocument {
  const content:DocumentNode[]=[]
  const lines=markdown.replace(/\r\n?/g,'\n').split('\n')
  let index=1
  for(let cursor=0;cursor<lines.length;){
    const line=lines[cursor].trim()
    if(!line){cursor++;continue}
    const heading=line.match(/^(#{1,5})\s+(.+)$/)
    if(heading){content.push({type:'heading',attrs:{level:heading[1].length,blockId:blockId(index++)},content:[text(heading[2])]});cursor++;continue}
    if(line.startsWith('- ')){
      const items:DocumentNode[]=[]
      while(cursor<lines.length&&lines[cursor].trim().startsWith('- ')){
        items.push({type:'listItem',content:[paragraph(lines[cursor].trim().slice(2))]})
        cursor++
      }
      content.push({type:'bulletList',attrs:{blockId:blockId(index++)},content:items})
      continue
    }
    const paragraphLines=[line]
    cursor++
    while(cursor<lines.length&&lines[cursor].trim()&&!/^(#{1,5})\s+/.test(lines[cursor].trim())&&!lines[cursor].trim().startsWith('- ')){
      paragraphLines.push(lines[cursor].trim());cursor++
    }
    content.push({type:'paragraph',attrs:{blockId:blockId(index++)},content:[text(paragraphLines.join(' '))]})
  }
  return {schemaVersion:1,type:'doc',content}
}

export const PRODUCT_GUIDE_DOCUMENT=buildProductGuideDocument()
export const PRODUCT_GUIDE_PLAIN_TEXT=PRODUCT_GUIDE_DOCUMENT.content.map(node=>{
  const collect=(value:DocumentNode):string=>(value.text??'')+(value.content??[]).map(collect).join('')
  return collect(node)
}).filter(Boolean).join('\n')
