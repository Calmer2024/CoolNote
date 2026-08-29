import { save } from '@tauri-apps/plugin-dialog'
import { writeFile } from '@tauri-apps/plugin-fs'
import { toCanvas } from 'html-to-image'
import { jsPDF } from 'jspdf'

import type { DocumentNode, VersionedDocument } from '../../shared/tauri/contracts'
import { writeJottingGroupImage } from '../../shared/tauri/commands'
import type { JottingGroupTemplate, ShareAuthor } from '../jottings/shareTemplate'

const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!))
const escapeMarkdown=(value:string)=>value.replace(/([\\`*_[\]<>])/g,'\\$1')
export const safeFileName=(value:string)=>value.replace(/[\\/:*?"<>|]/g,'-').trim()||'无标题'

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

const blockMarkdown=(node:DocumentNode,depth=0):string=>{
  const content=node.content??[]
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

export const noteToMarkdown=(title:string,document:VersionedDocument)=>`# ${escapeMarkdown(title)}\n\n${document.content.map(node=>blockMarkdown(node)).join('\n\n')}\n`

const inlineHtml=(nodes:DocumentNode[]=[]):string=>nodes.map(node=>{
  if(node.type==='hardBreak')return '<br>'
  if(node.type==='inlineMath')return `<span class="math">$${escapeHtml(String(node.attrs?.latex??''))}$</span>`
  if(node.type==='image')return `<img src="${escapeHtml(String(node.attrs?.src??''))}" alt="${escapeHtml(String(node.attrs?.alt??''))}">`
  let value=escapeHtml(node.text??'')
  for(const mark of node.marks??[]){
    if(mark.type==='code')value=`<code>${value}</code>`
    if(mark.type==='bold')value=`<strong>${value}</strong>`
    if(mark.type==='italic')value=`<em>${value}</em>`
    if(mark.type==='strike')value=`<s>${value}</s>`
    if(mark.type==='highlight')value=`<mark>${value}</mark>`
    if(mark.type==='link')value=`<a href="${escapeHtml(String(mark.attrs?.href??''))}">${value}</a>`
  }
  return value
}).join('')

const blockHtml=(node:DocumentNode):string=>{
  const content=node.content??[]
  if(node.type==='paragraph')return `<p>${inlineHtml(content)||'<br>'}</p>`
  if(node.type==='heading')return `<h${node.attrs?.level??1}>${inlineHtml(content)}</h${node.attrs?.level??1}>`
  if(node.type==='blockquote')return `<blockquote>${content.map(blockHtml).join('')}</blockquote>`
  if(node.type==='highlightBlock')return `<aside class="highlight-block" data-emoji="${escapeHtml(String(node.attrs?.emoji??'💡'))}"><span class="highlight-emoji">${escapeHtml(String(node.attrs?.emoji??'💡'))}</span><div>${content.map(blockHtml).join('')}</div></aside>`
  if(node.type==='codeBlock')return `<pre data-language="${escapeHtml(String(node.attrs?.language??''))}"><code>${escapeHtml(content.map(child=>child.text??'').join(''))}</code></pre>`
  if(node.type==='mermaid')return `<pre data-language="mermaid"><code>${escapeHtml(String(node.attrs?.source??''))}</code></pre>`
  if(node.type==='blockMath')return `<div class="block-math">$$ ${escapeHtml(String(node.attrs?.latex??''))} $$</div>`
  if(node.type==='horizontalRule')return '<hr>'
  if(node.type==='image')return `<p><img src="${escapeHtml(String(node.attrs?.src??''))}" alt="${escapeHtml(String(node.attrs?.alt??''))}"></p>`
  if(node.type==='media'){const type=String(node.attrs?.mediaType??'');const src=escapeHtml(String(node.attrs?.src??''));const name=escapeHtml(String(node.attrs?.fileName??'附件'));if(type.startsWith('audio/'))return `<audio controls src="${src}"></audio>`;if(type.startsWith('video/'))return `<video controls src="${src}"></video>`;return `<p><a href="${src}">${name}</a></p>`}
  if(node.type==='bulletList'||node.type==='orderedList'||node.type==='taskList'){
    const tag=node.type==='orderedList'?'ol':'ul'
    return `<${tag}>${content.map(item=>`<li>${node.type==='taskList'?`<span class="checkbox">${item.attrs?.checked?'☑':'☐'}</span> `:''}${(item.content??[]).map(blockHtml).join('')}</li>`).join('')}</${tag}>`
  }
  if(node.type==='table')return `<table>${content.map(row=>`<tr>${(row.content??[]).map(cell=>`<${cell.type==='tableHeader'?'th':'td'}>${(cell.content??[]).map(blockHtml).join('')}</${cell.type==='tableHeader'?'th':'td'}>`).join('')}</tr>`).join('')}</table>`
  return content.map(blockHtml).join('')
}

export const noteToHtml=(title:string,document:VersionedDocument)=>`<h1>${escapeHtml(title)}</h1>${document.content.map(blockHtml).join('')}`

type ExportKind='markdown'|'png'|'pdf'
const filters:Record<ExportKind,{name:string;extensions:string[]}>= {
  markdown:{name:'Markdown',extensions:['md']},png:{name:'PNG 图片',extensions:['png']},pdf:{name:'PDF 文档',extensions:['pdf']},
}
const isTauri=()=>typeof window!=='undefined'&&'__TAURI_INTERNALS__' in window
const browserDownload=(name:string,bytes:Uint8Array,type:string)=>{const url=URL.createObjectURL(new Blob([bytes],{type}));const anchor=document.createElement('a');anchor.href=url;anchor.download=name;anchor.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000)}
async function choosePath(defaultName:string,kind:ExportKind){if(!isTauri())return defaultName;return await save({defaultPath:defaultName,filters:[filters[kind]]})}
async function persist(path:string,defaultName:string,bytes:Uint8Array,type:string){if(isTauri())await writeFile(path,bytes);else browserDownload(defaultName,bytes,type)}

export async function downloadText(name:string,content:string,_type='text/plain;charset=utf-8'){
  const path=await choosePath(name,'markdown');if(!path)return false;await persist(path,name,new TextEncoder().encode(content),'text/markdown;charset=utf-8');return true
}

const waitForImages=async(root:HTMLElement)=>{await Promise.all(Array.from(root.querySelectorAll('img')).map(image=>image.complete?Promise.resolve():new Promise<void>(resolve=>{image.addEventListener('load',()=>resolve(),{once:true});image.addEventListener('error',()=>resolve(),{once:true})})))}
const createExportClone=async(element:HTMLElement,width=1000)=>{const stage=document.createElement('div');stage.className='coolnote-export-stage';stage.style.cssText=`position:fixed;left:-100000px;top:0;width:${width}px;overflow:visible;background:#fff;z-index:-1;`;const clone=element.cloneNode(true) as HTMLElement;clone.classList.add('is-exporting');clone.removeAttribute('contenteditable');clone.querySelectorAll('[contenteditable]').forEach(node=>node.removeAttribute('contenteditable'));clone.querySelectorAll('.jotting-cover-actions,.ProseMirror-gapcursor,.ProseMirror-separator').forEach(node=>node.remove());clone.style.cssText+=`;box-sizing:border-box;width:${width}px;max-width:none;height:auto;min-height:0;margin:0;overflow:visible;transform:none;`;stage.append(clone);document.body.append(stage);await document.fonts.ready;await waitForImages(clone);return{stage,clone}}
const renderCanvas=async(element:HTMLElement,width=1000)=>{const {stage,clone}=await createExportClone(element,width);try{const height=Math.ceil(clone.getBoundingClientRect().height);return await toCanvas(clone,{cacheBust:false,skipFonts:true,pixelRatio:1,backgroundColor:'#fff',width,height,canvasWidth:Math.round(width*1.5),canvasHeight:Math.round(height*1.5),style:{overflow:'visible',maxWidth:'none'}})}finally{stage.remove()}}
const canvasBlob=async(canvas:HTMLCanvasElement,type:string,quality?:number)=>new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('无法生成导出文件')),type,quality))
const blobBytes=async(blob:Blob)=>new Uint8Array(await blob.arrayBuffer())

export async function exportElementAsLongImage(element:HTMLElement,fileName:string){
  const path=await choosePath(fileName,'png');if(!path)return false;const canvas=await renderCanvas(element,1000);const bytes=await blobBytes(await canvasBlob(canvas,'image/png'));await persist(path,fileName,bytes,'image/png');return true
}

const GROUP_PAGE_WIDTH=900
const GROUP_PAGE_HEIGHT=1200
const GROUP_HEADER_HEIGHT=506.25+26
const GROUP_FOOTER_HEIGHT=72
const GROUP_CONTENT_HEIGHT=GROUP_PAGE_HEIGHT-GROUP_HEADER_HEIGHT-GROUP_FOOTER_HEIGHT
const GROUP_CONTENT_PADDING_X=92
const GROUP_CONTENT_PADDING_TOP=42
const GROUP_CONTENT_PADDING_BOTTOM=28
const GROUP_EXPORT_STYLE=`
  .coolnote-group-export-body h1{font-size:52px;line-height:1.3;margin:0 0 34px;}
  .coolnote-group-export-body h2{font-size:30px;line-height:1.45;margin:58px 0 24px;}
  .coolnote-group-export-body h3{font-size:25px;line-height:1.5;margin:46px 0 20px;}
  .coolnote-group-export-body p{margin:0 0 28px;}
  .coolnote-group-export-body hr{width:100%;height:1px;margin:46px 0;background:#d9d1c6;}
`
const SHARE_BLUE='#1687e8'
const SHARE_PAGE_PADDING_X=64
const SHARE_BODY_HEIGHT=984
const SHARE_EXPORT_STYLE=`
  .coolnote-share-export-page *{box-sizing:border-box;}
  .coolnote-share-export-body{width:100%!important;max-width:none!important;margin-right:0!important;margin-left:0!important;padding:0!important;color:#171a1f;font-family:"Noto Sans SC Local","Noto Sans SC",system-ui,sans-serif;font-size:24px;font-weight:400;line-height:1.82;overflow-wrap:anywhere;word-break:break-word;}
  .coolnote-share-export-body h1,.coolnote-share-export-body h2,.coolnote-share-export-body h3,.coolnote-share-export-body h4,.coolnote-share-export-body h5{color:#11151a;font-family:inherit;break-after:avoid;}
  .coolnote-share-export-body h1{position:relative;margin:0 0 38px;padding:38px 0 0;font-size:45px;font-weight:760;line-height:1.28;letter-spacing:-1.2px;}
  .coolnote-share-export-body h1::before{position:absolute;top:0;left:0;padding:3px 10px;color:#fff;background:${SHARE_BLUE};font:700 13px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.12em;content:'SHARE / 01';}
  .coolnote-share-export-body h1::after{display:block;width:58px;height:5px;margin-top:18px;background:${SHARE_BLUE};content:'';}
  .coolnote-share-export-body h2{margin:40px 0 18px;font-size:33px;font-weight:720;line-height:1.42;}
  .coolnote-share-export-body h3{margin:34px 0 16px;font-size:29px;font-weight:700;line-height:1.48;}
  .coolnote-share-export-body h4,.coolnote-share-export-body h5{margin:28px 0 14px;font-size:26px;font-weight:680;line-height:1.5;}
  .coolnote-share-export-body p{margin:0 0 26px;}
  .coolnote-share-export-body strong,.coolnote-share-export-body b{font-weight:760;}
  .coolnote-share-export-body u{text-decoration-thickness:2px;text-underline-offset:5px;}
  .coolnote-share-export-body a{color:${SHARE_BLUE};text-decoration-color:color-mix(in srgb,${SHARE_BLUE} 58%,transparent);text-underline-offset:4px;}
  .coolnote-share-export-body mark{padding:0 3px;color:inherit;background:#dceeff;box-decoration-break:clone;}
  .coolnote-share-export-body img{display:block;width:100%;max-width:100%;height:auto;margin:30px auto 34px;border-radius:16px;object-fit:contain;}
  .coolnote-share-export-body blockquote{margin:28px 0;padding:2px 0 2px 22px;border-left:5px solid ${SHARE_BLUE};color:#4f5965;}
  .coolnote-share-export-body blockquote p:last-child{margin-bottom:0;}
  .coolnote-share-export-body ul,.coolnote-share-export-body ol{margin:18px 0 28px;padding-left:38px;}
  .coolnote-share-export-body li{margin:8px 0;}
  .coolnote-share-export-body ul[data-type="taskList"]{padding-left:0;list-style:none;}
  .coolnote-share-export-body ul[data-type="taskList"] li{display:flex;gap:12px;align-items:flex-start;}
  .coolnote-share-export-body pre{margin:28px 0;padding:22px 24px;overflow:hidden;border-radius:0;color:#eaf2f8;background:#20262d;font:18px/1.65 ui-monospace,SFMono-Regular,Consolas,monospace;white-space:pre-wrap;}
  .coolnote-share-export-body code:not(pre code){padding:2px 5px;color:#0a66ad;background:#eaf5fe;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:.88em;}
  .coolnote-share-export-body table{width:100%;margin:28px 0;border-collapse:collapse;font-size:19px;line-height:1.55;}
  .coolnote-share-export-body th,.coolnote-share-export-body td{padding:10px 12px;border:1px solid #ccd5df;text-align:left;vertical-align:top;}
  .coolnote-share-export-body th{color:#0b5f9f;background:#edf7ff;font-weight:700;}
  .coolnote-share-export-body hr{width:100%;height:2px;margin:36px 0;border:0;background:#d7e0e8;}
  .coolnote-share-export-body .editor-highlight-block,.coolnote-share-export-body .highlight-block{display:grid;grid-template-columns:auto minmax(0,1fr);gap:12px;margin:28px 0;padding:18px 0;border:0;border-top:2px solid #bddcf4;border-bottom:2px solid #bddcf4;border-radius:0;background:transparent;}
  .coolnote-share-export-body .editor-highlight-emoji,.coolnote-share-export-body .highlight-emoji{font-size:26px;}
`

export type JottingGroupExportOptions={template?:JottingGroupTemplate;author?:ShareAuthor;onProgress?:(current:number,total:number)=>void;onPage?:(dataUrl:string,index:number,total:number)=>void;write?:boolean}

export const DEFAULT_SHARE_AVATAR_SRC='./assets/share-default-avatar.png'

export const paginateJottingBlocks=(blocks:Array<{height:number}>,availableHeight=GROUP_CONTENT_HEIGHT)=>{
  const pages:Array<number[]>=[[]]
  let used=0
  blocks.forEach((block,index)=>{
    const height=Math.max(1,block.height)
    if(pages[pages.length-1].length&&used+height>availableHeight){pages.push([]);used=0}
    pages[pages.length-1].push(index);used+=height
  })
  return pages
}

export const groupDirectoryName=(title:string)=>`${safeFileName(title)}-${new Date().toISOString().replace(/[:.]/g,'-')}`
const cloneGroupNode=(node:Node)=>node.cloneNode(true) as HTMLElement
const hasVisibleBlockContent=(node:Element)=>!!node.textContent?.trim()||!!node.querySelector('img,video,audio,table,hr,pre,blockquote,[data-type="taskList"]')

export const jottingBlockFlowHeights=(blocks:Array<{top:number;bottom:number;marginBottom:number}>,contentTop:number)=>blocks.map((block,index)=>({
  height:Math.max(1,Math.ceil((blocks[index+1]?.top??block.bottom+block.marginBottom)-(index===0?contentTop:block.top))),
}))

const measureJottingBlocks=(body:HTMLElement,blocks:Element[])=>{
  const copies=blocks.map(cloneGroupNode)
  body.replaceChildren(...copies)
  const bodyTop=body.getBoundingClientRect().top+body.clientTop+GROUP_CONTENT_PADDING_TOP
  const flow=copies.map(copy=>{
    const rect=copy.getBoundingClientRect()
    return {top:rect.top,bottom:rect.bottom,marginBottom:Number.parseFloat(getComputedStyle(copy).marginBottom||'0')}
  })
  return jottingBlockFlowHeights(flow,bodyTop)
}

const groupPageShell=()=>{const page=document.createElement('article');page.className='coolnote-group-export-page';page.style.cssText=`box-sizing:border-box;width:${GROUP_PAGE_WIDTH}px;height:${GROUP_PAGE_HEIGHT}px;background:#fff;color:#3c3b38;padding:0;display:flex;flex-direction:column;font-family:"Noto Serif SC Local","Noto Serif SC",serif;overflow:hidden;border-radius:0;`;return page}

const buildEmotionPages=(stage:HTMLElement,clone:HTMLElement)=>{
  const cover=clone.querySelector('.jotting-cover')
  const editor=clone.querySelector('.jotting-markdown')
  if(!cover||!editor)throw new Error('无法读取小记封面或正文')
  const blocks=Array.from(editor.children)
  while(blocks.length&&!hasVisibleBlockContent(blocks[blocks.length-1]))blocks.pop()
  const measureStyle=document.createElement('style');measureStyle.textContent=GROUP_EXPORT_STYLE;stage.append(measureStyle)
  const measureBody=document.createElement('div');measureBody.className='jotting-markdown coolnote-group-export-body';measureBody.style.cssText=`box-sizing:border-box;width:${GROUP_PAGE_WIDTH}px;padding:${GROUP_CONTENT_PADDING_TOP}px ${GROUP_CONTENT_PADDING_X}px ${GROUP_CONTENT_PADDING_BOTTOM}px;color:#3c3b38;font-family:"Noto Serif SC Local","Noto Serif SC",serif;font-size:21px;font-weight:420;line-height:2.05;visibility:hidden;position:absolute;left:-100000px;top:0;`
  stage.append(measureBody)
  const measurements=measureJottingBlocks(measureBody,blocks)
  measureBody.remove();measureStyle.remove()
  const pagination=paginateJottingBlocks(measurements,GROUP_CONTENT_HEIGHT-GROUP_CONTENT_PADDING_TOP-GROUP_CONTENT_PADDING_BOTTOM)
  return pagination.map((indices,pageIndex)=>{
    const page=groupPageShell()
    const pageCover=cloneGroupNode(cover);pageCover.classList.add('is-exporting-group-cover');pageCover.style.cssText='box-sizing:border-box;width:100%;height:506.25px;min-height:506.25px;overflow:hidden;margin:0 0 26px;border-radius:0;flex:none;'
    const coverImage=pageCover.querySelector('img') as HTMLElement|null;if(coverImage)coverImage.style.cssText='display:block;width:100%;height:100%;object-fit:cover;border-radius:0;'
    page.append(pageCover)
    const body=document.createElement('div');body.className='jotting-markdown coolnote-group-export-body';body.style.cssText=`box-sizing:border-box;width:100%;height:${GROUP_CONTENT_HEIGHT}px;overflow:hidden;padding:42px ${GROUP_CONTENT_PADDING_X}px 0;color:#3c3b38;font-family:"Noto Serif SC Local","Noto Serif SC",serif;font-size:21px;font-weight:420;line-height:2.05;`
    const exportStyle=document.createElement('style');exportStyle.textContent=GROUP_EXPORT_STYLE;page.append(exportStyle)
    for(const index of indices)body.append(cloneGroupNode(blocks[index]));page.append(body)
    const footer=document.createElement('footer');footer.style.cssText=`box-sizing:border-box;width:auto;height:52px;margin:0 ${GROUP_CONTENT_PADDING_X}px;padding:0 0 10px;border-top:1px solid #d9dde2;display:flex;align-items:flex-end;font-family:"Noto Serif SC Local","Noto Serif SC",serif;font-size:15px;color:#8a929d;`
    const watermark=document.createElement('span');watermark.textContent='@Calmer';const pageNumber=document.createElement('span');pageNumber.textContent=`${pageIndex+1}`;pageNumber.style.marginLeft='auto';footer.append(watermark,pageNumber);page.append(footer);stage.append(page);return page
  })
}

const textPoints=(root:Node)=>{const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);const points:Text[]=[];let node:Node|null;while((node=walker.nextNode()))points.push(node as Text);return points}
const rangeAt=(root:HTMLElement,offset:number,start:boolean)=>{const points=textPoints(root);let remaining=offset;for(const point of points){if(remaining<=point.data.length)return{node:point,offset:remaining};remaining-=point.data.length}return points.length?{node:points[points.length-1],offset:points[points.length-1].data.length}:{node:root,offset:start?0:root.childNodes.length}}
const rangedClone=(source:HTMLElement,start:number,end:number)=>{const shell=source.cloneNode(false) as HTMLElement;const range=document.createRange();range.selectNodeContents(source);const from=rangeAt(source,start,true),to=rangeAt(source,end,false);range.setStart(from.node,from.offset);range.setEnd(to.node,to.offset);shell.append(range.cloneContents());return shell}
const splitBlockToFit=(source:HTMLElement,body:HTMLElement)=>{
  const length=textPoints(source).reduce((sum,node)=>sum+node.data.length,0);if(length<2)return null
  let low=1,high=length-1,best=0
  while(low<=high){const middle=Math.floor((low+high)/2);const candidate=rangedClone(source,0,middle);body.append(candidate);const fits=body.scrollHeight<=body.clientHeight+1;candidate.remove();if(fits){best=middle;low=middle+1}else high=middle-1}
  if(!best)return null
  const before=rangedClone(source,0,best),after=rangedClone(source,best,length)
  if(!before.textContent?.trim()||!after.textContent?.trim())return null
  return{before,after}
}

const isAtomicShareBlock=(block:HTMLElement)=>!!block.querySelector('img,video,audio,table,pre,.mermaid-diagram')||['IMG','VIDEO','AUDIO','TABLE','PRE'].includes(block.tagName)
const isHeading=(block:Element)=>/^H[1-5]$/.test(block.tagName)

const createSharePage=(stage:HTMLElement,author:ShareAuthor)=>{
  const page=document.createElement('article');page.className='coolnote-group-export-page coolnote-share-export-page';page.style.cssText=`box-sizing:border-box;width:${GROUP_PAGE_WIDTH}px;height:${GROUP_PAGE_HEIGHT}px;padding:46px ${SHARE_PAGE_PADDING_X}px 52px;background:#fff;color:#171a1f;overflow:hidden;border-radius:0;`
  const style=document.createElement('style');style.textContent=SHARE_EXPORT_STYLE;page.append(style)
  const header=document.createElement('header');header.className='coolnote-share-export-header';header.style.cssText='height:94px;display:flex;align-items:center;gap:18px;'
  const avatar=document.createElement('img');avatar.src=author.avatarDataUrl||DEFAULT_SHARE_AVATAR_SRC;avatar.alt='';avatar.style.cssText='display:block;width:70px;height:70px;flex:0 0 70px;border-radius:50%;object-fit:cover;background:#eaf5fe;'
  const identity=document.createElement('div');identity.style.cssText='min-width:0;align-self:center;font-family:"Noto Sans SC Local","Noto Sans SC",system-ui,sans-serif;'
  const name=document.createElement('strong');name.textContent=author.name||'CoolNote 创作者';name.style.cssText=`display:block;overflow:hidden;color:${SHARE_BLUE};font-size:24px;font-weight:740;line-height:1.35;text-overflow:ellipsis;white-space:nowrap;`
  identity.append(name);if(author.bio.trim()){const bio=document.createElement('span');bio.textContent=author.bio;bio.style.cssText='display:block;max-width:540px;margin-top:5px;overflow:hidden;color:#7a838d;font-size:17px;font-weight:400;line-height:1.35;text-overflow:ellipsis;white-space:nowrap;';identity.append(bio)}
  const number=document.createElement('span');number.className='coolnote-share-page-number';number.style.cssText='margin-left:auto;align-self:center;color:#7f8790;font:600 18px/1.4 ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.12em;font-variant-numeric:tabular-nums;white-space:nowrap;'
  header.append(avatar,identity,number);page.append(header)
  const body=document.createElement('div');body.className='coolnote-share-export-body';body.style.cssText=`box-sizing:border-box;width:100%;max-width:none;height:${SHARE_BODY_HEIGHT}px;margin:24px 0 0;padding:0;overflow:hidden;`;page.append(body);stage.append(page)
  return{page,body,number}
}

const buildSharePages=async(stage:HTMLElement,clone:HTMLElement,author:ShareAuthor)=>{
  const editor=clone.querySelector('.jotting-markdown');if(!editor)throw new Error('无法读取小记正文')
  const queue=Array.from(editor.children).filter(hasVisibleBlockContent).map(cloneGroupNode)
  const pages:Array<ReturnType<typeof createSharePage>>=[]
  const nextPage=()=>{const created=createSharePage(stage,author);pages.push(created);return created}
  let current=nextPage();let firstTitle=true
  while(queue.length){const block=queue.shift()!;if(firstTitle&&block.tagName==='H1'){block.classList.add('coolnote-share-title');firstTitle=false}
    if(block.querySelector('img'))await waitForImages(block)
    if(isHeading(block)&&current.body.children.length&&queue.length){const following=cloneGroupNode(queue[0]);current.body.append(block,following);const fit=current.body.scrollHeight<=current.body.clientHeight+1;following.remove();block.remove();if(!fit)current=nextPage()}
    current.body.append(block)
    if(current.body.scrollHeight<=current.body.clientHeight+1)continue
    block.remove()
    if(current.body.children.length){if(!isAtomicShareBlock(block)){const split=splitBlockToFit(block,current.body);if(split){current.body.append(split.before);current=nextPage();queue.unshift(split.after);continue}}current=nextPage();queue.unshift(block);continue}
    current.body.append(block)
    if(isAtomicShareBlock(block)){const image=block.matches('img')?block as HTMLImageElement:block.querySelector<HTMLImageElement>('img');if(image){image.style.maxHeight=`${Math.max(120,current.body.clientHeight-68)}px`;image.style.width='auto'}const table=block.matches('table')?block as HTMLElement:block.querySelector<HTMLElement>('table');if(table&&current.body.scrollHeight>current.body.clientHeight)table.style.fontSize='14px'}
  }
  const total=pages.length;pages.forEach((item,index)=>item.number.textContent=formatGroupPageNumber(index,total));return pages.map(item=>item.page)
}

export const formatGroupPageNumber=(index:number,total:number)=>`${String(index+1).padStart(2,'0')} / ${String(total).padStart(2,'0')}`

export async function exportJottingImageGroup(element:HTMLElement,title:string,options:JottingGroupExportOptions={}){
  const {template='emotion',author={name:'CoolNote 创作者',bio:'',avatarDataUrl:null},onProgress,onPage,write=true}=options
  const {stage,clone}=await createExportClone(element,GROUP_PAGE_WIDTH)
  try{
    const pages=template==='share'?await buildSharePages(stage,clone,author):buildEmotionPages(stage,clone)
    const folderName=groupDirectoryName(title)
    onProgress?.(0,pages.length)
    for(let pageIndex=0;pageIndex<pages.length;pageIndex++){
      const page=pages[pageIndex]
      await document.fonts.ready
      await waitForImages(page)
      const canvas=await toCanvas(page,{cacheBust:false,skipFonts:true,pixelRatio:1,backgroundColor:'#fff',width:GROUP_PAGE_WIDTH,height:GROUP_PAGE_HEIGHT,canvasWidth:GROUP_PAGE_WIDTH*2,canvasHeight:GROUP_PAGE_HEIGHT*2,style:{overflow:'hidden'}})
      onPage?.(canvas.toDataURL('image/png'),pageIndex,pages.length)
      if(write){const bytes=await blobBytes(await canvasBlob(canvas,'image/png'));await writeJottingGroupImage(folderName,`${safeFileName(title)}-${String(pageIndex+1).padStart(2,'0')}.png`,bytes)}
      onProgress?.(pageIndex+1,pages.length)
      page.remove()
    }
    return {folder:`C:\\Users\\28109\\Downloads\\CoolNote\\${folderName}`,count:pages.length}
  }finally{stage.remove()}
}

const jottingPreviewCache=new Map<string,string[]>()
export async function renderJottingImageGroupPreview(element:HTMLElement,options:Omit<JottingGroupExportOptions,'write'>={}){
  const key=element.innerHTML+'|'+(element.querySelector<HTMLImageElement>('.jotting-cover img')?.src??'')+'|'+JSON.stringify({template:options.template,author:options.author})
  const cached=jottingPreviewCache.get(key)
  if(cached){cached.forEach((page,index)=>options.onPage?.(page,index,cached.length));return {count:cached.length,cached:true}}
  const pages:string[]=[]
  const result=await exportJottingImageGroup(element,'预览',{...options,onPage:(dataUrl,index,total)=>{pages[index]=dataUrl;options.onPage?.(dataUrl,index,total)},write:false})
  jottingPreviewCache.set(key,pages)
  return {...result,cached:false}
}

const canvasToPdf=(canvas:HTMLCanvasElement)=>{const pdf=new jsPDF({orientation:'portrait',unit:'mm',format:'a4',compress:true});const pageWidth=210,pageHeight=297,margin=12,contentWidth=pageWidth-margin*2,contentHeight=pageHeight-margin*2;const sliceHeight=Math.max(1,Math.floor(canvas.width*contentHeight/contentWidth));let offset=0,page=0;while(offset<canvas.height){const height=Math.min(sliceHeight,canvas.height-offset);const slice=document.createElement('canvas');slice.width=canvas.width;slice.height=height;const context=slice.getContext('2d');if(!context)throw new Error('无法创建 PDF 画布');context.fillStyle='#fff';context.fillRect(0,0,slice.width,slice.height);context.drawImage(canvas,0,offset,canvas.width,height,0,0,canvas.width,height);if(page>0)pdf.addPage();const renderedHeight=height/canvas.width*contentWidth;pdf.addImage(slice.toDataURL('image/jpeg',.92),'JPEG',margin,margin,contentWidth,renderedHeight,undefined,'FAST');offset+=height;page++}return new Uint8Array(pdf.output('arraybuffer'))}

export async function exportElementAsPdf(element:HTMLElement,fileName:string){const path=await choosePath(fileName,'pdf');if(!path)return false;const canvas=await renderCanvas(element,794);await persist(path,fileName,canvasToPdf(canvas),'application/pdf');return true}
export async function exportHtmlAsPdf(title:string,body:string,fileName:string){const element=document.createElement('article');element.className='coolnote-export-document';element.setAttribute('aria-label',title);element.innerHTML=body;document.body.append(element);try{return await exportElementAsPdf(element,fileName)}finally{element.remove()}}

export function htmlToMarkdown(html:string){
  const root=new DOMParser().parseFromString(html,'text/html').body
  const walk=(node:Node):string=>{
    if(node.nodeType===Node.TEXT_NODE)return escapeMarkdown(node.textContent??'')
    if(!(node instanceof HTMLElement))return ''
    const inner=Array.from(node.childNodes).map(walk).join('')
    const tag=node.tagName.toLowerCase()
    if(tag==='h1'||tag==='h2'||tag==='h3'||tag==='h4'||tag==='h5')return `${'#'.repeat(Number(tag[1]))} ${inner.trim()}\n\n`
    if(tag==='p')return `${inner.trim()}\n\n`
    if(tag==='br')return '  \n'
    if(tag==='strong'||tag==='b')return `**${inner}**`
    if(tag==='em'||tag==='i')return `*${inner}*`
    if(tag==='s'||tag==='del')return `~~${inner}~~`
    if(tag==='code'&&node.parentElement?.tagName.toLowerCase()!=='pre')return `\`${inner}\``
    if(tag==='pre')return `\`\`\`${node.dataset.language??''}\n${node.textContent??''}\n\`\`\`\n\n`
    if(tag==='a')return `[${inner}](${node.getAttribute('href')??''})`
    if(tag==='img')return `![${node.getAttribute('alt')??''}](${node.getAttribute('src')??''})`
    if(tag==='blockquote')return inner.trim().split('\n').map(line=>`> ${line}`).join('\n')+'\n\n'
    if(tag==='li')return `- ${inner.trim()}\n`
    if(tag==='ul'||tag==='ol')return `${inner}\n`
    if(tag==='hr')return '---\n\n'
    return inner
  }
  return Array.from(root.childNodes).map(walk).join('').replace(/\n{3,}/g,'\n\n').trim()+'\n'
}
