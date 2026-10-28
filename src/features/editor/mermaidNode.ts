import { Node as TiptapNode,mergeAttributes } from '@tiptap/core'

// Mermaid uses global configuration, so initialize and render as one queued job.
let renderQueue:Promise<unknown>=Promise.resolve()
function renderDiagram(source:string,theme:'dark'|'neutral',fontFamily:string){
  const result=renderQueue.then(async()=>{
    const module=await import('mermaid')
    const container=document.createElement('div')
    container.setAttribute('aria-hidden','true')
    container.style.cssText='position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none;'
    document.body.append(container)
    try{
      // Mermaid measures labels during rendering, so load the same font used by
      // the body before it computes node sizes (including Chinese fallback).
      await document.fonts?.load(`16px ${fontFamily}`,'中文 ABC').catch(()=>undefined)
      container.style.fontFamily=fontFamily
      module.default.initialize({startOnLoad:false,securityLevel:'strict',suppressErrorRendering:true,theme,fontFamily,themeVariables:{fontFamily,background:'transparent'}})
      return await module.default.render(`coolnote-mermaid-${crypto.randomUUID()}`,source,container)
    }finally{container.remove()}
  })
  renderQueue=result.catch(()=>undefined)
  return result
}

export const MermaidNode=TiptapNode.create({
  name:'mermaid',group:'block',atom:true,draggable:true,
  addAttributes(){return{
    source:{default:'graph TD\n  A[开始] --> B[完成]',parseHTML:element=>element.getAttribute('data-source')??'',renderHTML:attrs=>({'data-source':attrs.source})},
    width:{default:100,parseHTML:element=>Number(element.getAttribute('data-width')??100),renderHTML:attrs=>({'data-width':attrs.width})},
    focusSource:{default:false,rendered:false},
  }},
  parseHTML(){return[{tag:'div[data-type="mermaid"]'}]},
  renderHTML({HTMLAttributes}){return['div',mergeAttributes(HTMLAttributes,{'data-type':'mermaid',class:'mermaid-diagram'})]},
  addNodeView(){return({node,getPos,editor,view})=>{
    const dom=document.createElement('div');dom.className='mermaid-diagram';dom.setAttribute('contenteditable','false')
    const stage=document.createElement('div');stage.className='mermaid-stage'
    const resize=document.createElement('span');resize.className='mermaid-resize';resize.setAttribute('data-tooltip','拖动缩放文本绘图')
    const toolbar=document.createElement('div');toolbar.className='mermaid-toolbar'
    const codeButton=document.createElement('button');codeButton.type='button';codeButton.textContent='代码';codeButton.setAttribute('data-tooltip','仅显示代码')
    const chartButton=document.createElement('button');chartButton.type='button';chartButton.textContent='图表';chartButton.setAttribute('data-tooltip','仅显示图表')
    const source=document.createElement('textarea');source.className='mermaid-source';source.hidden=true;source.rows=8;source.spellcheck=false;source.setAttribute('aria-label','文本绘图代码');source.setAttribute('data-editor-shortcuts','ignore')
    // stopEvent only isolates ProseMirror handlers; it does not cancel native
    // textarea drops or dragging inherited from the draggable diagram wrapper.
    for(const type of ['dragstart','dragover','drop'])source.addEventListener(type,event=>{event.preventDefault();event.stopPropagation()})
    dom.addEventListener('dragstart',event=>{if(document.activeElement===source){event.preventDefault();event.stopPropagation()}})
    toolbar.append(codeButton,chartButton);dom.append(toolbar,stage,source,resize)
    let disposed=false
    let current=node,renderToken=0,renderTimer:number|null=null,viewMode:'both'|'code'|'chart'='both'
    const applyView=()=>{stage.hidden=viewMode==='code';source.hidden=viewMode==='chart';codeButton.classList.toggle('active',viewMode==='code');chartButton.classList.toggle('active',viewMode==='chart');if(document.activeElement!==source&&source.value!==String(current.attrs.source??''))source.value=String(current.attrs.source??'')}
    codeButton.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();viewMode=viewMode==='code'?'both':'code';applyView()})
    chartButton.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();viewMode=viewMode==='chart'?'both':'chart';applyView()})
    const readAppearance=()=>({theme:document.documentElement.dataset.theme==='dark'?'dark' as const:'neutral' as const,fontFamily:getComputedStyle(view.dom).fontFamily||getComputedStyle(document.body).fontFamily||'sans-serif'})
    let appearance=readAppearance()
    const render=async()=>{const token=++renderToken;const text=String(current.attrs.source??'');dom.style.width=`${Math.max(35,Math.min(100,Number(current.attrs.width)||100))}%`;if(document.activeElement!==source&&source.value!==text)source.value=text;try{const result=await renderDiagram(text,appearance.theme,appearance.fontFamily);if(token!==renderToken)return;stage.innerHTML=result.svg;const svg=stage.querySelector('svg');if(svg)svg.style.backgroundColor='transparent';dom.classList.remove('is-error')}catch{if(token!==renderToken)return;stage.textContent='无法渲染图表，请检查文本绘图语法';dom.classList.add('is-error')}applyView()}
    const scheduleRender=()=>{renderToken+=1;if(renderTimer!==null)window.clearTimeout(renderTimer);renderTimer=window.setTimeout(()=>{renderTimer=null;void render()},220)}
    const appearanceChanged=()=>{
      const next=readAppearance()
      if(next.theme===appearance.theme&&next.fontFamily===appearance.fontFamily)return
      appearance=next;scheduleRender()
    }
    // Observe only ancestor attributes; diagram DOM updates must not enqueue
    // themselves. This also covers CSS variables set by the settings panel.
    const appearanceObserver=new MutationObserver(appearanceChanged)
    for(let ancestor:HTMLElement|null=view.dom;ancestor;ancestor=ancestor.parentElement)appearanceObserver.observe(ancestor,{attributes:true,attributeFilter:['class','style','data-theme']})
    const fontsChanged=()=>{if(!disposed)scheduleRender()}
    document.fonts?.addEventListener('loadingdone',fontsChanged)
    source.value=String(current.attrs.source??'')
    source.addEventListener('input',()=>{const pos=typeof getPos==='function'?getPos():null;if(typeof pos!=='number')return;editor.view.dispatch(editor.state.tr.setNodeMarkup(pos,undefined,{...current.attrs,source:source.value}));scheduleRender()})
    source.addEventListener('blur',()=>{if(renderTimer!==null){window.clearTimeout(renderTimer);renderTimer=null;void render()}})
    resize.addEventListener('pointerdown',event=>{event.preventDefault();event.stopPropagation();const parentWidth=dom.parentElement?.getBoundingClientRect().width??dom.getBoundingClientRect().width;const startX=event.clientX,startWidth=Math.max(35,Math.min(100,Number(current.attrs.width)||100));let next=startWidth;const move=(pointer:PointerEvent)=>{next=Math.max(35,Math.min(100,startWidth+(pointer.clientX-startX)/Math.max(1,parentWidth)*100));dom.style.width=`${next}%`};const finish=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',finish);const pos=typeof getPos==='function'?getPos():null;if(typeof pos==='number')editor.view.dispatch(editor.state.tr.setNodeMarkup(pos,undefined,{...current.attrs,width:Math.round(next)}))};window.addEventListener('pointermove',move);window.addEventListener('pointerup',finish,{once:true})})
    applyView();void render()
    if(current.attrs.focusSource)window.requestAnimationFrame(()=>{source.focus();const pos=typeof getPos==='function'?getPos():null;if(typeof pos==='number')editor.view.dispatch(editor.state.tr.setNodeMarkup(pos,undefined,{...current.attrs,focusSource:false}))})
    return{dom,update:next=>{if(next.type.name!=='mermaid')return false;const sourceChanged=next.attrs.source!==current.attrs.source;current=next;dom.style.width=`${Math.max(35,Math.min(100,Number(current.attrs.width)||100))}%`;applyView();if(sourceChanged)scheduleRender();return true},stopEvent:event=>source.contains(event.target as globalThis.Node)||toolbar.contains(event.target as globalThis.Node)||resize.contains(event.target as globalThis.Node),ignoreMutation:()=>true,destroy:()=>{disposed=true;appearanceObserver.disconnect();document.fonts?.removeEventListener('loadingdone',fontsChanged);renderToken+=1;if(renderTimer!==null)window.clearTimeout(renderTimer)}}
  }}
})
