import { save } from '@tauri-apps/plugin-dialog'
import { writeFile } from '@tauri-apps/plugin-fs'
import { toCanvas } from 'html-to-image'
import { jsPDF } from 'jspdf'

import type { DocumentNode, VersionedDocument } from '../../shared/tauri/contracts'

const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!))
const escapeMarkdown=(value:string)=>value.replace(/([\\`*_[\]<>])/g,'\\$1')
export const safeFileName=(value:string)=>value.replace(/[\\/:*?"<>|]/g,'-').trim()||'无标题'

const inlineMarkdown=(nodes:DocumentNode[]=[]):string=>nodes.map(node=>{
  if(node.type==='hardBreak')return '  \n'
  if(node.type==='inlineMath')return `$${String(node.attrs?.latex??'')}$`
  if(node.type==='image')return `![${node.attrs?.alt??''}](${node.attrs?.src??''}${node.attrs?.title?` "${node.attrs.title}"`:''})`
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
  if(node.type==='codeBlock')return `<pre data-language="${escapeHtml(String(node.attrs?.language??''))}"><code>${escapeHtml(content.map(child=>child.text??'').join(''))}</code></pre>`
  if(node.type==='mermaid')return `<pre data-language="mermaid"><code>${escapeHtml(String(node.attrs?.source??''))}</code></pre>`
  if(node.type==='blockMath')return `<div class="block-math">$$ ${escapeHtml(String(node.attrs?.latex??''))} $$</div>`
  if(node.type==='horizontalRule')return '<hr>'
  if(node.type==='image')return `<p><img src="${escapeHtml(String(node.attrs?.src??''))}" alt="${escapeHtml(String(node.attrs?.alt??''))}"></p>`
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
