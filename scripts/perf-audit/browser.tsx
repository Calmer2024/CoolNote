// Isolated production-build harness; never initializes a library or touches user data.
import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { NoteEditor } from '../../src/features/editor/NoteEditor'
import { BaselineNotesPanel } from './BaselineNotesPanel'
import { NotesPanel } from '../../src/features/notes/NotesPanel'
import { createSnapshotSerializer } from '../../src/features/editor/editorSnapshot'
import { normalizeDocument } from '../../src/features/editor/document'
import { noteToMarkdown } from '../../src/features/export/export'
import '../../src/app/app.css'
import '../../src/app/prototype-exact.css'
import '../../src/app/motion.css'
import '../../src/app/ux-fixes.css'

const output:any[]=[]
const report=(value:any)=>{ output.push(value); document.querySelector('#results')!.textContent=JSON.stringify(output,null,2) }
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms))
const frame=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))
const stats=(values:number[])=>{const a=[...values].sort((a,b)=>a-b);return {n:a.length,median_ms:a[Math.floor(a.length/2)],p95_ms:a[Math.ceil(a.length*.95)-1],max_ms:a[a.length-1]}}
const root=createRoot(document.querySelector('#root')!)
const noteFor=(count:number)=>({id:'audit',title:'性能审计',document:{schemaVersion:1,type:'doc',content:Array.from({length:count},(_,i)=>({type:'paragraph',attrs:{blockId:`10000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`},content:[{type:'text',text:'这是一段用于性能测试的普通文字，包含中文及 English 123。'.repeat(3)}]}))},revision:1,categoryId:'audit',plainText:'',updatedAt:'2026-10-15',createdAt:'2026-10-15',isFavorite:false,isArchived:false}) as any
function EditorHarness({note}:{note:any}) { const [current,setCurrent]=useState(note); return <div className="reading-layout"><NoteEditor note={current} onChange={change=>setCurrent((old:any)=>({...old,title:change.title,document:change.documentJson}))} onMoodChange={()=>{}} onAddAttachment={async()=>{throw Error('not used')}}/></div> }
async function run(){
 report({environment:{userAgent:navigator.userAgent,hardwareConcurrency:navigator.hardwareConcurrency,production:import.meta.env.PROD}})
 for(const count of [100,1000,5000]){
  const note=noteFor(count); const start=performance.now();
  flushSync(()=>root.render(<EditorHarness key={count} note={note}/>));
  let element:any; for(let i=0;i<100;i++){element=document.querySelector('[contenteditable="true"]');if(element?.editor)break;await sleep(20)}
  await frame(); const mount=performance.now()-start;
  const editor=element.editor; let replacements=0; editor.on('transaction',({transaction}:any)=>{if(transaction.steps.some((s:any)=>s.from===0&&s.to>100))replacements++})
  await sleep(500); const edits:number[]=[];const paints:number[]=[];
  for(let i=0;i<30;i++){const t=performance.now();editor.commands.insertContentAt(2,'字');edits.push(performance.now()-t);await frame();paints.push(performance.now()-t);await sleep(20)}
  const serial:number[]=[];for(let i=0;i<30;i++){const t=performance.now(); const d=normalizeDocument({schemaVersion:1,type:'doc',content:editor.state.doc.toJSON().content});noteToMarkdown(note.title,d);serial.push(performance.now()-t)}
  const serialize=createSnapshotSerializer();serialize(editor.state.doc,note.title);const incremental:number[]=[];
  for(let i=0;i<30;i++){editor.commands.insertContentAt(2,'字');const t=performance.now();serialize(editor.state.doc,note.title);incremental.push(performance.now()-t)}
  await sleep(800);report({incremental_snapshot_after_edit:stats(incremental),metric:'editor',blocks:count,mount_ms:mount,paragraphs:element.querySelectorAll('p').length,edit:stats(edits),edit_two_frames:stats(paints),serialize_markdown:stats(serial),whole_doc_replacements:replacements});
 }
 let inspectProps:any;
 for(const Panel of [BaselineNotesPanel,NotesPanel]) for(const count of [80,1000,5000]){
  const notes=Array.from({length:count},(_,i)=>({id:`note-${i}`,title:`测试笔记 ${i}`,excerpt:'用于测试列表渲染与选择响应。',updatedAt:'2026-10-15T00:00:00Z',isPinned:i===0}));
  const props:any={notes,total:count,selectedNoteId:'note-0',selectedIds:new Set(),collapsed:false,loading:false,canLoadMore:false,loadingMore:false,title:'全部笔记',titleIcon:'file-text',sortDirection:'desc',view:'all',categories:[]};
  inspectProps=props;
  for(const name of ['onDirection','onToggleSelected','onClearSelection','onSelectAll','onSelect','onLoadMore','onAction','onMove','onCreate','onImport','onEmptyTrash','onRefresh'])props[name]=()=>{};
  flushSync(()=>root.render(null));await sleep(250);
  const t=performance.now();flushSync(()=>root.render(<div style={{height:800,width:290,display:'grid'}}><Panel {...props}/></div>));await frame();const mount=performance.now()-t;
  const select:number[]=[];for(let i=0;i<20;i++){await frame();const t=performance.now();flushSync(()=>root.render(<div style={{height:800,width:290,display:'grid'}}><Panel {...props} selectedNoteId={`note-${i}`}/></div>));select.push(performance.now()-t)}
  report({metric:Panel===NotesPanel?'notes-list':'baseline-notes-list',rows:count,mount_ms:mount,rendered_rows:document.querySelectorAll('.note-card-row').length,selection_render:stats(select)});
  if(Panel===NotesPanel&&count>160&&(document.querySelectorAll('.note-card-row').length>80||stats(select).p95_ms>16))throw Error('Virtual list performance budget exceeded');
 }
 flushSync(()=>root.render(new URLSearchParams(location.search).has('inspect')?<div style={{height:800,width:290,display:'grid'}}><NotesPanel {...inspectProps}/></div>:null));report({status:'complete'})
}
run().catch(error=>report({error:String(error),stack:error.stack}))
