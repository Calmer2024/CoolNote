// Dedicated localhost origin and synthetic data only. Measures the complete App.
import React from 'react'
import { createRoot } from 'react-dom/client'
import '../../src/app/app.css'
import '../../src/app/prototype-exact.css'
import '../../src/app/motion.css'
import '../../src/app/ux-fixes.css'

const result:any[]=[]
const report=(data:any)=>{result.push(data);document.querySelector('#audit-results')!.textContent=JSON.stringify(result,null,2)}
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms))
let frameGaps:number[]=[]
const frame=()=>new Promise<void>(resolve=>{const start=performance.now();requestAnimationFrame(()=>{frameGaps.push(performance.now()-start);resolve()})})
const visible=(el:Element)=>!!el.getClientRects().length
const ready=(mode:string)=>{
 if(document.querySelector('.workspace')?.getAttribute('data-mode')!==mode)return false
 const selector=({notes:'.note-editor-content',jottings:'.jotting-markdown',tasks:'.task-table',gallery:'.gallery-panel'} as Record<string,string>)[mode]
 return [...document.querySelectorAll(selector)].some(visible)&&![...document.querySelectorAll('.workspace .content-skeleton,.workspace .sidebar-skeleton')].some(visible)
}
const waitReady=async(mode:string)=>{for(let i=0;i<1000;i++){if(ready(mode))return;await frame()}throw Error(`Timeout waiting for ${mode}`)}
const stats=(values:number[])=>{if(!values.length)return{n:0,median_ms:null,p95_ms:null};const sorted=[...values].sort((a,b)=>a-b);return{n:sorted.length,median_ms:sorted[Math.floor(sorted.length/2)],p95_ms:sorted[Math.ceil(sorted.length*.95)-1]}}
async function run(){
 localStorage.removeItem('coolnote-web-store-v1')
 for(const key of ['mode','notes','jotting','taskScope','taskView','gallery'])localStorage.removeItem(`coolnote.workspace.${key}`)
 const web=await import('../../src/shared/tauri/webStore')
 const blocks=Number(new URLSearchParams(location.search).get('blocks')??1000)
 const note=web.webCreate(null)
 web.webSave({noteId:note.id,baseRevision:note.revision,clientTransactionId:crypto.randomUUID(),title:'Tab性能合成笔记',documentJson:{schemaVersion:1,type:'doc',content:Array.from({length:blocks},()=>({type:'paragraph',attrs:{blockId:crypto.randomUUID()},content:[{type:'text',text:'测试笔记切换与编辑器初始化速度。'.repeat(3)}]}))},markdownSnapshot:'# Tab性能合成笔记\n'})
 const jotting=web.webCreateJotting('Tab性能小记.md')
 web.webUpdateJotting(jotting.id,jotting.revision,jotting.name,'<h1>Tab性能小记</h1>'+Array.from({length:blocks},()=>'<p>测试小记切换与编辑器初始化速度。</p>').join(''),null,false)
 for(let i=0;i<30;i++)web.webCreateTaskItem(`测试任务 ${i}`)
 localStorage.setItem('coolnote.workspace.notes',JSON.stringify({view:'all',categoryId:null,selectedNoteId:note.id}))
 const {App}=await import('../../src/app/App')
 createRoot(document.querySelector('#root')!).render(<App/>);
 await waitReady('notes');await sleep(400)
 report({environment:{production:import.meta.env.PROD,userAgent:navigator.userAgent,blocks,tasks:30}})
 const samples:any[]=[];const editorNodes=new Map<string,Element>();editorNodes.set('notes',document.querySelector('.note-editor-content')!)
 for(let cycle=0;cycle<12;cycle++)for(const [tab,mode] of [['jottings','jottings'],['tasks','tasks'],['gallery','gallery'],['all','notes']]){
  frameGaps=[];const from=document.querySelector('.workspace')!.getAttribute('data-mode');document.querySelector('#audit-results')!.textContent=JSON.stringify([...result,{running:{cycle,from,to:mode}}],null,2);const start=performance.now();
  (document.querySelector(`.primary-nav [data-view="${tab}"]`) as HTMLButtonElement).click()
  await waitReady(mode);await frame();const readyMs=performance.now()-start;
  const activeAnimations=document.querySelector('.workspace')!.getAnimations({subtree:true}).filter(animation=>visible((animation.effect as KeyframeEffect).target as Element)&&Number.isFinite(Number(animation.effect!.getTiming().iterations)))
  document.querySelector('#audit-results')!.textContent=JSON.stringify([...result,{running:{cycle,to:mode,readyMs,animations:activeAnimations.map(a=>({name:(a as CSSAnimation).animationName,property:(a as CSSTransition).transitionProperty,state:a.playState,target:((a.effect as KeyframeEffect).target as HTMLElement).className}))}}],null,2);
  await Promise.race([Promise.all(activeAnimations.map(animation=>animation.finished.catch(()=>{}))),sleep(1000)]);await frame()
  const selector=mode==='notes'?'.note-editor-content':mode==='jottings'?'.jotting-markdown':null;
  const current=selector?[...document.querySelectorAll(selector)].find(visible):null
  const reused=current?editorNodes.get(mode)===current:null;if(current)editorNodes.set(mode,current)
  samples.push({cycle,from,to:mode,frame_gap_max_ms:Math.max(...frameGaps),timing_valid:Math.max(...frameGaps)<=100,ready_ms:readyMs,settled_ms:performance.now()-start,animation_details:activeAnimations.map(a=>({name:(a as CSSAnimation).animationName,property:(a as CSSTransition).transitionProperty,target:((a.effect as KeyframeEffect).target as HTMLElement).className})),finite_animations:activeAnimations.length,editor_reused:reused})
  await sleep(30)
 }
 for(const mode of ['notes','jottings','tasks','gallery']){const items=samples.filter(s=>s.to===mode);const valid=items.filter(s=>s.timing_valid);report({mode,timing_invalid_count:items.length-valid.length,ready:stats(valid.map(s=>s.ready_ms)),settled:stats(valid.map(s=>s.settled_ms)),editor_reuse_count:items.filter(s=>s.editor_reused).length,finite_animation_max:Math.max(...items.map(s=>s.finite_animations))})}
 report({samples,status:'complete'})
}
run().catch(error=>report({error:String(error),stack:error.stack}))
