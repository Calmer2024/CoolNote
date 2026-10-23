import { resourceHref, type ResourceKind } from '../editor/resourceTarget'
import type { DocumentNode, VersionedDocument } from '../../shared/tauri/contracts'

export const escapeMarkdown=(value:string)=>value.replace(/([\\`*_[\]<>])/g,'\\$1')

const inlineMarkdown=(nodes:DocumentNode[]=[]):string=>nodes.map(node=>{
  if(node.type==='hardBreak')return '  \n'
  if(node.type==='inlineMath')return `$${String(node.attrs?.latex??'')}$`
  if(node.type==='image')return `![${node.attrs?.alt??''}](${node.attrs?.src??''}${node.attrs?.title?` "${node.attrs.title}"`:''})`
  if(node.type==='media')return `[${node.attrs?.fileName??'附件'}](${node.attrs?.src??''})`
  let value=escapeMarkdown(node.text??'')
  for(const mark of node.marks??[]){
    if(mark.type==='code')value=`\`${value}\``
    if(mark.type==='bold')value=`**${value}**`
    if(mark.type==='italic')value=`*${value}*`
    if(mark.type==='strike')value=`~~${value}~~`
    if(mark.type==='highlight')value=`==${value}==`
    if(mark.type==='link')value=`[${value}](${mark.attrs?.href??''})`
  }
  return value
}).join('')

export const blockMarkdown=(node:DocumentNode,depth=0):string=>{
  const content=node.content??[]
  if(node.type==='resourceReference')return `[${String(node.attrs?.title??'无标题').replace(/[\[\]\\]/g,'\\$&')}](${resourceHref(node.attrs?.kind as ResourceKind,String(node.attrs?.id??''))})`
  if(node.type==='paragraph')return inlineMarkdown(content)
  if(node.type==='heading')return `${'#'.repeat(Number(node.attrs?.level)||1)} ${inlineMarkdown(content)}`
  if(node.type==='blockquote')return content.map(child=>blockMarkdown(child,depth)).join('\n\n').split('\n').map(line=>`> ${line}`).join('\n')
  if(node.type==='highlightBlock'){const emoji=String(node.attrs?.emoji??'💡');return content.map(child=>blockMarkdown(child,depth)).join('\n\n').split('\n').map((line,index)=>`> ${index===0?`${emoji} `:''}${line}`).join('\n')}
  if(node.type==='codeBlock')return `\`\`\`${node.attrs?.language??''}\n${content.map(child=>child.text??'').join('')}\n\`\`\``
  if(node.type==='mermaid')return `\`\`\`mermaid\n${node.attrs?.source??''}\n\`\`\``
  if(node.type==='blockMath')return `$$\n${node.attrs?.latex??''}\n$$`
  if(node.type==='horizontalRule')return '---'
  if(node.type==='image')return `![${node.attrs?.alt??''}](${node.attrs?.src??''}${node.attrs?.title?` "${node.attrs.title}"`:''})`
  if(node.type==='bulletList'||node.type==='orderedList'||node.type==='taskList')return content.map((item,index)=>{
    const prefix=node.type==='orderedList'?`${index+(Number(node.attrs?.start)||1)}. `:node.type==='taskList'?`- [${item.attrs?.checked?'x':' '}] `:'- '
    const body=(item.content??[]).map(child=>blockMarkdown(child,depth+1)).join('\n\n')
    return prefix+body.replace(/\n/g,`\n${'  '.repeat(depth+1)}`)
  }).join('\n')
  if(node.type==='table'){
    const rows=content.map(row=>(row.content??[]).map(cell=>inlineMarkdown(cell.content?.[0]?.content??[]).replace(/\|/g,'\\|')))
    if(!rows.length)return ''
    return [`| ${rows[0].join(' | ')} |`,`| ${rows[0].map(()=>'---').join(' | ')} |`,...rows.slice(1).map(row=>`| ${row.join(' | ')} |`)].join('\n')
  }
  return content.map(child=>blockMarkdown(child,depth)).join('\n\n')
}

export const joinMarkdownSnapshot=(title:string,blocks:string[])=>`# ${escapeMarkdown(title)}\n\n${blocks.join('\n\n')}\n`
export const noteToMarkdown=(title:string,document:VersionedDocument)=>joinMarkdownSnapshot(title,document.content.map(node=>blockMarkdown(node)))
