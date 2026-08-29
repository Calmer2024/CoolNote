import { Node as TiptapNode,mergeAttributes } from '@tiptap/core'

export const MermaidNode=TiptapNode.create({
  name:'mermaid',group:'block',atom:true,draggable:true,
  addAttributes(){return{
    source:{default:'graph TD\n  A[开始] --> B[完成]',parseHTML:element=>element.getAttribute('data-source')??'',renderHTML:attrs=>({'data-source':attrs.source})},
    width:{default:100,parseHTML:element=>Number(element.getAttribute('data-width')??100),renderHTML:attrs=>({'data-width':attrs.width})},
  }},
  parseHTML(){return[{tag:'div[data-type="mermaid"]'}]},
  renderHTML({HTMLAttributes}){return['div',mergeAttributes(HTMLAttributes,{'data-type':'mermaid',class:'mermaid-diagram'})]},
  addNodeView(){return({node,getPos,editor})=>{
    const dom=document.createElement('div');dom.className='mermaid-diagram';dom.setAttribute('contenteditable','false')
    const stage=document.createElement('div');stage.className='mermaid-stage'
    const resize=document.createElement('span');resize.className='mermaid-resize';resize.setAttribute('data-tooltip','拖动缩放文本绘图')
    const toolbar=document.createElement('div');toolbar.className='mermaid-toolbar'
    const codeButton=document.createElement('button');codeButton.type='button';codeButton.textContent='代码';codeButton.setAttribute('data-tooltip','仅显示代码')
    const chartButton=document.createElement('button');chartButton.type='button';chartButton.textContent='图表';chartButton.setAttribute('data-tooltip','仅显示图表')
    const source=document.createElement('textarea');source.className='mermaid-source';source.hidden=true;source.rows=8;source.spellcheck=false;source.setAttribute('aria-label','文本绘图代码');source.setAttribute('data-editor-shortcuts','ignore')
    toolbar.append(codeButton,chartButton);dom.append(toolbar,stage,source,resize)
    let current=node,renderToken=0,renderTimer:number|null=null,viewMode:'both'|'code'|'chart'='both'
    const applyView=()=>{stage.hidden=viewMode==='code';source.hidden=viewMode==='chart';codeButton.classList.toggle('active',viewMode==='code');chartButton.classList.toggle('active',viewMode==='chart');if(document.activeElement!==source&&source.value!==String(current.attrs.source??''))source.value=String(current.attrs.source??'')}
    codeButton.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();viewMode=viewMode==='code'?'both':'code';applyView()})
    chartButton.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();viewMode=viewMode==='chart'?'both':'chart';applyView()})
    const render=async()=>{const token=++renderToken;dom.style.width=`${Math.max(35,Math.min(100,Number(current.attrs.width)||100))}%`;if(document.activeElement!==source&&source.value!==String(current.attrs.source??''))source.value=String(current.attrs.source??'');try{const module=await import('mermaid');module.default.initialize({startOnLoad:false,securityLevel:'strict',theme:document.documentElement.dataset.theme==='dark'?'dark':'neutral'});const result=await module.default.render(`coolnote-mermaid-${crypto.randomUUID()}`,current.attrs.source);if(token!==renderToken)return;stage.innerHTML=result.svg;dom.classList.remove('is-error')}catch{if(token!==renderToken)return;stage.textContent='无法渲染图表，请检查文本绘图语法';dom.classList.add('is-error')}applyView()}
    const scheduleRender=()=>{if(renderTimer!==null)window.clearTimeout(renderTimer);renderTimer=window.setTimeout(()=>{renderTimer=null;void render()},220)}
    source.value=String(current.attrs.source??'')
    source.addEventListener('input',()=>{const pos=typeof getPos==='function'?getPos():null;if(typeof pos!=='number')return;editor.view.dispatch(editor.state.tr.setNodeMarkup(pos,undefined,{...current.attrs,source:source.value}));scheduleRender()})
    source.addEventListener('blur',()=>{if(renderTimer!==null){window.clearTimeout(renderTimer);renderTimer=null;void render()}})
    resize.addEventListener('pointerdown',event=>{event.preventDefault();event.stopPropagation();const parentWidth=dom.parentElement?.getBoundingClientRect().width??dom.getBoundingClientRect().width;const startX=event.clientX,startWidth=Math.max(35,Math.min(100,Number(current.attrs.width)||100));let next=startWidth;const move=(pointer:PointerEvent)=>{next=Math.max(35,Math.min(100,startWidth+(pointer.clientX-startX)/Math.max(1,parentWidth)*100));dom.style.width=`${next}%`};const finish=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',finish);const pos=typeof getPos==='function'?getPos():null;if(typeof pos==='number')editor.view.dispatch(editor.state.tr.setNodeMarkup(pos,undefined,{...current.attrs,width:Math.round(next)}))};window.addEventListener('pointermove',move);window.addEventListener('pointerup',finish,{once:true})})
    void render()
    return{dom,update:next=>{if(next.type.name!=='mermaid')return false;const sourceChanged=next.attrs.source!==current.attrs.source;current=next;dom.style.width=`${Math.max(35,Math.min(100,Number(current.attrs.width)||100))}%`;applyView();if(sourceChanged)scheduleRender();return true},stopEvent:event=>source.contains(event.target as globalThis.Node)||toolbar.contains(event.target as globalThis.Node)||resize.contains(event.target as globalThis.Node),ignoreMutation:()=>true,destroy:()=>{renderToken+=1;if(renderTimer!==null)window.clearTimeout(renderTimer)}}
  }}
})
