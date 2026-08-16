import { useEffect, useMemo, useRef, useState } from 'react'

import { Icon } from '../../shared/components/Icon'
import { FloatingLayer, type DialogState } from '../../shared/components/Overlay'
import { ContentSkeleton, SidebarSkeleton } from '../../shared/components/Skeleton'
import {
  createTaskItem, createTaskList, createTaskSubtask, deleteTaskItem, deleteTaskList,
  deleteTaskSubtask, getTaskSnapshot, reorderTaskItem, reorderTaskList, setTaskCompleted,
  setTaskSubtaskCompleted, undoTaskDelete, updateTaskItem, updateTaskList, updateTaskSubtask,
} from '../../shared/tauri/commands'
import type { TaskImportance, TaskItemDto, TaskListDto, TaskSnapshotDto, TaskSubtaskDto } from '../../shared/tauri/contracts'

type Scope = 'inbox'|'all'|'today'|'completed'|`list:${string}`
type Props = { collapsed:boolean; openTaskId:string|null; onToggle:()=>void; onToast:(message:string,undo?:()=>void|Promise<void>,tone?:'success'|'error'|'info')=>void; onError:(message:string)=>void; onCountChange:(count:number)=>void; onConfirm:(dialog:DialogState|null)=>void }
type SelectOption = { value:string; label:string; icon?:string; tone?:string }

const empty:TaskSnapshotDto = { lists:[], tasks:[], subtasks:[] }
const importanceOptions:SelectOption[] = [
  { value:'urgent', label:'紧急', icon:'circle', tone:'urgent' },
  { value:'important', label:'重要', icon:'circle', tone:'important' },
  { value:'normal', label:'普通', icon:'circle', tone:'normal' },
  { value:'low', label:'低', icon:'circle', tone:'low' },
]
const listIcons = ['list-checks','briefcase-business','calendar-days','lightbulb','book-open','code-xml','camera','music','palette','graduation-cap']
const today = () => new Date().toLocaleDateString('en-CA')
const day = (value:string|null) => value?.slice(0,10) ?? null
const displayDay = (value:string|null) => value?value.slice(0,10).replace(/-/g,'/'):'—'
const touches = (task:TaskItemDto,value:string) => { const start=day(task.startValue),due=day(task.dueValue); return start&&due?start<=value&&value<=due:start===value||due===value }
const isOverdue = (task:TaskItemDto) => !task.isCompleted&&!!task.dueValue&&(task.duePrecision==='datetime'?new Date(task.dueValue).getTime()<Date.now():task.dueValue<today())

function TaskSelect({ value, options, label, onChange, compact=false, showChevron=true, textIcon=false }:{ value:string; options:SelectOption[]; label:string; onChange:(value:string)=>void; compact?:boolean; showChevron?:boolean; textIcon?:boolean }) {
  const [open,setOpen]=useState(false)
  const anchor=useRef<HTMLButtonElement>(null)
  const current=options.find(option=>option.value===value)??options[0]
  return <>
    <button ref={anchor} type="button" className={`task-select-trigger${compact?' compact':''}${textIcon?' text-icon':''} ${current?.tone??''}`} aria-label={label} aria-expanded={open} onClick={event=>{event.stopPropagation();setOpen(x=>!x)}}>
      {current?.icon&&<Icon name={current.icon}/>}<span>{current?.label}</span>{showChevron&&<Icon name="chevron-down"/>}
    </button>
    <FloatingLayer open={open} anchor={anchor} placement="bottom-start" className="product-menu task-select-menu" onDismiss={()=>setOpen(false)}>
      {options.map(option=><button type="button" key={option.value} className={`${option.value===value?'active ':''}${option.tone??''}`} onClick={()=>{onChange(option.value);setOpen(false)}}>
        {option.icon&&<Icon name={option.icon}/>}<span>{option.label}</span>{option.value===value&&<Icon name="check"/>}
      </button>)}
    </FloatingLayer>
  </>
}

function TaskIconPicker({ anchor, icon, onIcon, onDismiss }:{ anchor:React.RefObject<HTMLElement|null>; icon:string; onIcon:(icon:string)=>void; onDismiss:()=>void }) {
  return <FloatingLayer open anchor={anchor} placement="bottom-start" className="product-layer task-icon-picker" onDismiss={onDismiss}>
    {listIcons.map(value=><button type="button" key={value} className={icon===value?'active':''} aria-label={`使用${value}图标`} onMouseDown={event=>event.preventDefault()} onClick={()=>onIcon(value)}><Icon name={value}/></button>)}
  </FloatingLayer>
}

export function TaskWorkspace(props:Props) {
  const [data,setData]=useState<TaskSnapshotDto>(empty)
  const [loading,setLoading]=useState(true)
  const [scope,setScope]=useState<Scope>('inbox')
  const [view,setView]=useState<'table'|'calendar'>('table')
  const [selected,setSelected]=useState<string|null>(null)
  const [expanded,setExpanded]=useState<Set<string>>(new Set())
  const [completing,setCompleting]=useState<Set<string>>(new Set())
  const [creatingTask,setCreatingTask]=useState(false)
  const [draft,setDraft]=useState('')
  const [subDraft,setSubDraft]=useState<Record<string,string>>({})
  const [listDraft,setListDraft]=useState<{name:string;icon:string}|null>(null)
  const [listPicker,setListPicker]=useState(false)
  const [headingPicker,setHeadingPicker]=useState(false)
  const [listItemPicker,setListItemPicker]=useState<{list:TaskListDto;anchor:HTMLElement}|null>(null)
  const [draggingListId,setDraggingListId]=useState<string|null>(null)
  const [listDrop,setListDrop]=useState<{id:string;edge:'before'|'after'}|null>(null)
  const [status,setStatus]=useState<'default'|'all'|'open'|'completed'>('default')
  const [importance,setImportance]=useState<'all'|TaskImportance>('all')
  const [dateFilter,setDateFilter]=useState<'all'|'overdue'|'today'|'future'|'none'>('all')
  const [sort,setSort]=useState<'custom'|'start'|'due'|'importance'>('custom')
  const [month,setMonth]=useState(()=>{const d=new Date();return new Date(d.getFullYear(),d.getMonth(),1)})
  const [columns,setColumns]=useState({title:240,start:118,due:118,importance:112,list:128})
  const [resizeGuide,setResizeGuide]=useState<number|null>(null)
  const listDraftInput=useRef<HTMLInputElement>(null)
  const listDraftIcon=useRef<HTMLButtonElement>(null)
  const headingIcon=useRef<HTMLButtonElement>(null)
  const newTaskInput=useRef<HTMLInputElement>(null)
  const taskDetailRef=useRef<HTMLElement>(null)

  const refresh=async()=>{try{const next=await getTaskSnapshot();setData(next);props.onCountChange(next.tasks.filter(x=>!x.isCompleted).length)}catch(cause){props.onError(cause instanceof Error?cause.message:'无法加载任务')}finally{setLoading(false)}}
  useEffect(()=>{void refresh()},[])
  useEffect(()=>{if(creatingTask)newTaskInput.current?.focus()},[creatingTask])
  useEffect(()=>{if(!selected)return;const close=(event:PointerEvent)=>{const target=event.target as Element|null;if(!target||taskDetailRef.current?.contains(target))return;if(target.closest('.task-row-wrap')?.getAttribute('data-task-id')===selected)return;setSelected(null)};document.addEventListener('pointerdown',close,true);return()=>document.removeEventListener('pointerdown',close,true)},[selected])
  useEffect(()=>{if(!props.openTaskId)return;const task=data.tasks.find(x=>x.id===props.openTaskId);if(task){setScope(task.isCompleted?'completed':task.taskListId?`list:${task.taskListId}`:'inbox');setSelected(task.id);setExpanded(x=>new Set(x).add(task.id))}else if(data.lists.some(x=>x.id===props.openTaskId))setScope(`list:${props.openTaskId}`)},[props.openTaskId,data.tasks,data.lists])

  const patchTask=(item:TaskItemDto)=>setData(x=>({...x,tasks:x.tasks.map(v=>v.id===item.id?item:v)}))
  const patchList=(item:TaskListDto)=>setData(x=>({...x,lists:x.lists.map(v=>v.id===item.id?item:v)}))
  const patchSub=(item:TaskSubtaskDto)=>setData(x=>({...x,subtasks:x.subtasks.map(v=>v.id===item.id?item:v)}))
  const saveTask=async(item:TaskItemDto,patch:Partial<TaskItemDto>)=>{try{const next={...item,...patch};if(next.startValue&&next.dueValue&&next.startValue>next.dueValue)throw new Error('截止时间不能早于开始时间');patchTask(await updateTaskItem(next));await refresh()}catch(cause){props.onError(cause instanceof Error?cause.message:'任务保存失败');await refresh()}}
  const selectedList=scope.startsWith('list:')?data.lists.find(x=>x.id===scope.slice(5))??null:null
  const rows=useMemo(()=>data.tasks.filter(task=>{if(scope==='inbox'&&task.taskListId)return false;if(scope.startsWith('list:')&&task.taskListId!==scope.slice(5))return false;if(scope==='today'&&!isOverdue(task)&&!touches(task,today()))return false;if(scope==='completed'&&!task.isCompleted)return false;if(scope!=='completed'&&status==='default'&&task.isCompleted&&!completing.has(task.id))return false;if(status==='open'&&task.isCompleted&&!completing.has(task.id))return false;if(status==='completed'&&!task.isCompleted)return false;if(importance!=='all'&&task.importance!==importance)return false;if(dateFilter==='overdue'&&!isOverdue(task))return false;if(dateFilter==='today'&&!touches(task,today()))return false;if(dateFilter==='future'&&(![task.startValue,task.dueValue].some(x=>x&&day(x)!>today())||touches(task,today())))return false;if(dateFilter==='none'&&(task.startValue||task.dueValue))return false;return true}).sort((a,b)=>{if(sort==='custom')return a.sortOrder-b.sortOrder;if(sort==='importance')return['urgent','important','normal','low'].indexOf(a.importance)-['urgent','important','normal','low'].indexOf(b.importance);const av=sort==='start'?a.startValue:a.dueValue,bv=sort==='start'?b.startValue:b.dueValue;return av&&bv?av.localeCompare(bv):av?-1:bv?1:a.sortOrder-b.sortOrder}),[data.tasks,scope,status,importance,dateFilter,sort,completing])
  const counts={inbox:data.tasks.filter(x=>!x.taskListId&&!x.isCompleted).length,all:data.tasks.filter(x=>!x.isCompleted).length,today:data.tasks.filter(x=>!x.isCompleted&&(isOverdue(x)||touches(x,today()))).length,completed:data.tasks.filter(x=>x.isCompleted).length}

  const add=async()=>{const title=draft.trim();setCreatingTask(false);setDraft('');if(!title)return;try{const item=await createTaskItem(title,scope.startsWith('list:')?scope.slice(5):null);setData(x=>({...x,tasks:[...x.tasks,item]}));props.onToast('任务已创建');await refresh()}catch(cause){props.onError(cause instanceof Error?cause.message:'创建任务失败')}}
  const remove=async(item:TaskItemDto)=>{try{const token=await deleteTaskItem(item.id);setSelected(null);await refresh();props.onToast('任务已删除',async()=>{await undoTaskDelete(token);await refresh()})}catch(cause){props.onError(cause instanceof Error?cause.message:'删除任务失败')}}
  const beginList=()=>{setListDraft({name:'',icon:'list-checks'});setListPicker(false);requestAnimationFrame(()=>listDraftInput.current?.focus())}
  const commitList=async()=>{if(!listDraft)return;const pending=listDraft;setListDraft(null);setListPicker(false);if(!pending.name.trim())return;try{let item=await createTaskList(pending.name.trim());if(item.iconName!==pending.icon)item=await updateTaskList(item.id,item.revision,item.name,pending.icon,item.notes);setScope(`list:${item.id}`);await refresh()}catch(cause){props.onError(cause instanceof Error?cause.message:'创建任务清单失败')}}
  const removeList=(list:TaskListDto)=>{const tasks=data.tasks.filter(x=>x.taskListId===list.id),children=data.subtasks.filter(x=>tasks.some(t=>t.id===x.taskId));props.onConfirm({title:`删除“${list.name}”？`,description:`将同时删除 ${tasks.length} 个任务和 ${children.length} 个子任务，可在 8 秒内撤销。`,confirmLabel:'删除清单',danger:true,onConfirm:async()=>{const token=await deleteTaskList(list.id);setScope('inbox');await refresh();props.onToast('任务清单已删除',async()=>{await undoTaskDelete(token);await refresh()})}})}
  const moveList=async(id:string,beforeId:string|null)=>{try{await reorderTaskList(id,beforeId);await refresh()}catch(cause){props.onError(cause instanceof Error?cause.message:'任务清单排序失败')}finally{setDraggingListId(null);setListDrop(null)}}
  const listDragOver=(event:React.DragEvent,overId:string)=>{const id=event.dataTransfer.getData('text/coolnote-task-list')||draggingListId;if(!id||id===overId)return;event.preventDefault();event.dataTransfer.dropEffect='move';const rect=event.currentTarget.getBoundingClientRect();setListDrop({id:overId,edge:event.clientY<rect.top+rect.height/2?'before':'after'})}
  const listDropAt=async(event:React.DragEvent,overId:string)=>{event.preventDefault();const id=event.dataTransfer.getData('text/coolnote-task-list')||draggingListId;if(!id||id===overId)return;const ordered=data.lists.filter(list=>list.id!==id);const target=ordered.findIndex(list=>list.id===overId);const edge=listDrop?.id===overId?listDrop.edge:'before';await moveList(id,edge==='before'?overId:ordered[target+1]?.id??null)}
  const addSub=async(taskId:string)=>{const title=subDraft[taskId]?.trim();if(!title)return;try{await createTaskSubtask(taskId,title);setSubDraft(x=>({...x,[taskId]:''}));await refresh()}catch(cause){props.onError(cause instanceof Error?cause.message:'创建子任务失败')}}
  const addForDay=async(value:string)=>{try{const created=await createTaskItem('新任务',null);const dated=await updateTaskItem({...created,startValue:value,startPrecision:'date'});await refresh();setSelected(dated.id)}catch(cause){props.onError(cause instanceof Error?cause.message:'创建日历任务失败')}}
  const toggleTask=(task:TaskItemDto)=>{setExpanded(value=>{const next=new Set(value);next.has(task.id)?next.delete(task.id):next.add(task.id);return next});setSelected(value=>value===task.id?null:task.id)}
  const toggleCompleted=async(task:TaskItemDto)=>{if(task.isCompleted){patchTask(await setTaskCompleted(task.id,false));await refresh();return}setCompleting(value=>new Set(value).add(task.id));try{patchTask(await setTaskCompleted(task.id,true));window.setTimeout(()=>{setCompleting(value=>{const next=new Set(value);next.delete(task.id);return next});void refresh()},720)}catch(cause){setCompleting(value=>{const next=new Set(value);next.delete(task.id);return next});props.onError(cause instanceof Error?cause.message:'任务完成失败')}}
  const beginColumnResize=(event:React.PointerEvent<HTMLSpanElement>,key:keyof typeof columns)=>{event.preventDefault();event.stopPropagation();const table=event.currentTarget.closest<HTMLElement>('.task-table');const boundary=event.currentTarget.parentElement?.getBoundingClientRect().right??event.clientX;const tableLeft=table?.getBoundingClientRect().left??0;const startX=event.clientX,startWidth=columns[key],startGuide=boundary-tableLeft+(table?.scrollLeft??0);setResizeGuide(startGuide);const move=(pointer:PointerEvent)=>{const delta=pointer.clientX-startX;setColumns(value=>({...value,[key]:Math.max(key==='title'?150:88,startWidth+delta)}));setResizeGuide(startGuide+delta)};const finish=()=>{setResizeGuide(null);window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',finish)};window.addEventListener('pointermove',move);window.addEventListener('pointerup',finish,{once:true})}
  const nav=(id:Scope,label:string,icon:string,count:number)=><button className={`task-nav-row${scope===id?' active':''}`} onClick={()=>{setScope(id);setView('table')}}><Icon name={icon}/><span>{label}</span><small>{count}</small></button>
  const listOptions:SelectOption[]=[{value:'',label:'收集箱',icon:'inbox'},...data.lists.map(list=>({value:list.id,label:list.name,icon:list.iconName}))]

  const taskRow=(task:TaskItemDto)=>{
    const children=data.subtasks.filter(x=>x.taskId===task.id).sort((a,b)=>a.sortOrder-b.sortOrder),open=expanded.has(task.id),showList=['all','today','completed'].includes(scope)
    return <div data-task-id={task.id} className={`task-row-wrap${selected===task.id?' selected':''}${task.isCompleted?' completed':''}${completing.has(task.id)?' completing':''}`} key={task.id} draggable={sort==='custom'&&(scope==='inbox'||scope.startsWith('list:'))} onDragStart={e=>e.dataTransfer.setData('text/coolnote-task',task.id)} onDragOver={e=>e.preventDefault()} onDrop={e=>{const id=e.dataTransfer.getData('text/coolnote-task');if(id&&id!==task.id)void reorderTaskItem(id,task.id).then(refresh)}}>
      <div className="task-table-row" onClick={event=>{if(!(event.target as Element).closest('input,button'))toggleTask(task)}}>
        <button className={`task-check${task.isCompleted?' checked':''}`} aria-label={task.isCompleted?'重新打开任务':'完成任务'} onClick={()=>void toggleCompleted(task)}><span className="task-check-mark"><Icon name="check"/></span></button>
        <div className="task-title-cell"><div><input value={task.title} onFocus={()=>setSelected(task.id)} onChange={e=>patchTask({...task,title:e.target.value})} onBlur={e=>void saveTask(task,{title:e.target.value})}/><button className="subtask-toggle" aria-label={open?'折叠子任务':'展开子任务'} onClick={()=>toggleTask(task)}><Icon name="chevron-right"/></button><span>{children.filter(x=>x.isCompleted).length}/{children.length}</span></div>{task.notes&&<p>{task.notes}</p>}</div>
        <label className={`task-date-cell${task.startValue?'':' empty'}`} onPointerDown={event=>event.preventDefault()} onClick={event=>event.currentTarget.querySelector('input')?.showPicker()}><Icon name="calendar-days"/><span>{displayDay(task.startValue)}</span><input type="date" aria-label="开始时间" value={day(task.startValue)??''} onChange={e=>void saveTask(task,{startValue:e.target.value||null,startPrecision:e.target.value?'date':null})}/></label>
        <label className={`task-date-cell${task.dueValue?'':' empty'}`} onPointerDown={event=>event.preventDefault()} onClick={event=>event.currentTarget.querySelector('input')?.showPicker()}><Icon name="calendar-days"/><span>{displayDay(task.dueValue)}</span><input type="date" aria-label="结束时间" value={day(task.dueValue)??''} onChange={e=>void saveTask(task,{dueValue:e.target.value||null,duePrecision:e.target.value?'date':null})}/></label>
        <TaskSelect compact showChevron={false} label="重要程度" value={task.importance} options={importanceOptions} onChange={value=>void saveTask(task,{importance:value as TaskImportance})}/>
        {showList&&<TaskSelect compact textIcon label="所属清单" value={task.taskListId??''} options={listOptions} onChange={value=>void saveTask(task,{taskListId:value||null})}/>}<button className="task-delete" aria-label="删除任务" onClick={()=>void remove(task)}><Icon name="trash-2"/></button>
      </div>
      {open&&<div className="subtask-list">{children.map(child=><div className="subtask-row" key={child.id}><button className={`task-check${child.isCompleted?' checked':''}`} aria-label="切换子任务完成状态" onClick={()=>void setTaskSubtaskCompleted(child.id,!child.isCompleted).then(patchSub)}><span className="task-check-mark"><Icon name="check"/></span></button><input value={child.title} onChange={e=>patchSub({...child,title:e.target.value})} onBlur={e=>void updateTaskSubtask(child.id,child.revision,e.target.value).then(patchSub).catch(cause=>props.onError(cause instanceof Error?cause.message:'保存子任务失败'))}/><button aria-label="删除子任务" onClick={()=>void deleteTaskSubtask(child.id).then(token=>refresh().then(()=>props.onToast('子任务已删除',async()=>{await undoTaskDelete(token);await refresh()})))}><Icon name="trash-2"/></button></div>)}<form onSubmit={e=>{e.preventDefault();void addSub(task.id)}}><Icon name="plus"/><input placeholder="添加子任务" value={subDraft[task.id]??''} onChange={e=>setSubDraft(x=>({...x,[task.id]:e.target.value}))}/></form></div>}
    </div>
  }

  const calendar=()=>{const start=new Date(month.getFullYear(),month.getMonth(),1);start.setDate(start.getDate()-((start.getDay()+6)%7));const days=Array.from({length:42},(_,i)=>{const d=new Date(start);d.setDate(start.getDate()+i);return d});return <div className="task-calendar"><div className="calendar-toolbar"><button aria-label="上个月" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()-1,1))}><Icon name="chevron-right"/></button><strong>{month.getFullYear()}年 {month.getMonth()+1}月</strong><button aria-label="下个月" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()+1,1))}><Icon name="chevron-right"/></button><button onClick={()=>{const d=new Date();setMonth(new Date(d.getFullYear(),d.getMonth(),1))}}>今天</button></div><div className="calendar-surface"><div className="calendar-weekdays">{'一二三四五六日'.split('').map(x=><span key={x}>周{x}</span>)}</div><div className="calendar-grid">{days.map(value=>{const key=value.toLocaleDateString('en-CA'),items=data.tasks.filter(x=>touches(x,key));return <button key={key} className={`calendar-day${value.getMonth()!==month.getMonth()?' muted':''}${key===today()?' today':''}`} onClick={()=>void addForDay(key)}><time>{value.getDate()}</time>{items.slice(0,3).map(item=><span key={item.id} className={`calendar-task ${item.importance}${item.isCompleted?' done':''}`} onClick={e=>{e.stopPropagation();setSelected(current=>current===item.id?null:item.id)}}>{item.title}</span>)}{items.length>3&&<small>还有 {items.length-3} 项</small>}</button>})}</div></div></div>}
  const current=data.tasks.find(x=>x.id===selected)??null,showList=['all','today','completed'].includes(scope)
  const filterOptions={status:[{value:'default',label:'默认状态',icon:'list-checks'},{value:'all',label:'全部状态',icon:'list'},{value:'open',label:'未完成',icon:'circle'},{value:'completed',label:'已完成',icon:'check'}],importance:[{value:'all',label:'全部重要程度',icon:'circle'},...importanceOptions],date:[{value:'all',label:'全部日期',icon:'calendar-days'},{value:'overdue',label:'逾期',icon:'history'},{value:'today',label:'今天',icon:'calendar-days'},{value:'future',label:'未来',icon:'arrow-up'},{value:'none',label:'无日期',icon:'minus'}],sort:[{value:'custom',label:'自定义排序',icon:'grip-vertical'},{value:'start',label:'开始时间',icon:'calendar-days'},{value:'due',label:'结束时间',icon:'calendar-days'},{value:'importance',label:'重要程度',icon:'circle'}]}
  const taskColumns=`38px minmax(${columns.title}px,1fr) ${columns.start}px ${columns.due}px ${columns.importance}px${showList?` ${columns.list}px`:''} 36px`
  const headerCell=(key:keyof typeof columns,label:string,icon:string)=><span className="task-header-cell"><Icon name={icon}/><span>{label}</span><span className="task-column-resizer" onPointerDown={event=>beginColumnResize(event,key)}/></span>
  const titleHeader=<><span className="task-leading-slot"><Icon name="list-checks"/></span><span className="task-header-cell task-header-title"><span>任务标题</span><span className="task-column-resizer" onPointerDown={event=>beginColumnResize(event,'title')}/></span></>

  if(loading)return <><section className="task-list-panel" data-collapsed={props.collapsed}><header><div className="secondary-panel-heading"><Icon name="list-checks"/><strong>任务</strong></div></header><SidebarSkeleton rows={8}/></section><section className="task-main"><div className="task-toolbar"><button className="icon-button panel-toggle" aria-label="折叠任务清单" onClick={props.onToggle}><Icon name="panel-left-close"/></button></div><ContentSkeleton cards={5}/></section></>
  return <>
    <section className="task-list-panel" data-collapsed={props.collapsed}>
      <header><div className="secondary-panel-heading"><Icon name="list-checks"/><strong>任务</strong><span className="tree-count">{counts.all}</span></div><button aria-label="新建任务清单" onClick={beginList}><Icon name="plus"/></button></header>
      <div className="task-list-scroll"><nav>{nav('inbox','收集箱','inbox',counts.inbox)}{nav('all','全部任务','list-checks',counts.all)}{nav('today','今天','calendar-days',counts.today)}{nav('completed','已完成','check-square',counts.completed)}</nav><div className="task-list-label"><span>任务清单</span><button aria-label="新建任务清单" onClick={beginList}><Icon name="plus"/></button></div>
        <nav className="user-task-lists" onDragLeave={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))setListDrop(null)}}>{data.lists.map(list=><div data-list-id={list.id} className={`task-nav-row${scope===`list:${list.id}`?' active':''}${draggingListId===list.id?' dragging':''}${listDrop?.id===list.id?` drop-${listDrop.edge}`:''}`} key={list.id} draggable onDragStart={event=>{setDraggingListId(list.id);event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/coolnote-task-list',list.id)}} onDragOver={event=>listDragOver(event,list.id)} onDrop={event=>void listDropAt(event,list.id)} onDragEnd={()=>{setDraggingListId(null);setListDrop(null)}}><button className="task-list-row-icon" aria-label={`更换${list.name}图标`} onClick={event=>{event.stopPropagation();setListItemPicker({list,anchor:event.currentTarget})}}><Icon name={list.iconName}/></button><button className="task-list-row-name" onClick={()=>{setScope(`list:${list.id}`);setView('table')}}><span>{list.name}</span></button><small>{data.tasks.filter(x=>x.taskListId===list.id&&!x.isCompleted).length}</small><button aria-label={`删除${list.name}`} onClick={()=>removeList(list)}><Icon name="trash-2"/></button></div>)}{!!data.lists.length&&<div className={`task-list-drop-end${listDrop?.id==='__end__'?' active':''}`} onDragOver={event=>{const id=event.dataTransfer.getData('text/coolnote-task-list')||draggingListId;if(id){event.preventDefault();setListDrop({id:'__end__',edge:'after'})}}} onDrop={event=>{event.preventDefault();const id=event.dataTransfer.getData('text/coolnote-task-list')||draggingListId;if(id)void moveList(id,null)}}/>}{listDraft&&<div className="task-list-draft"><button ref={listDraftIcon} type="button" className="task-list-icon-trigger" aria-label="选择清单图标" onMouseDown={event=>event.preventDefault()} onClick={()=>setListPicker(true)}><Icon name={listDraft.icon}/></button><input ref={listDraftInput} aria-label="清单名称" placeholder="清单名称" value={listDraft.name} onChange={event=>setListDraft({...listDraft,name:event.target.value})} onBlur={event=>{if(!(event.relatedTarget as Element|null)?.closest('.task-icon-picker'))void commitList()}} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();void commitList()}if(event.key==='Escape'){setListDraft(null);setListPicker(false)}}}/></div>}</nav>
      </div>
      {listDraft&&listPicker&&<TaskIconPicker anchor={listDraftIcon} icon={listDraft.icon} onIcon={icon=>{setListDraft({...listDraft,icon});setListPicker(false);requestAnimationFrame(()=>listDraftInput.current?.focus())}} onDismiss={()=>{setListPicker(false);requestAnimationFrame(()=>listDraftInput.current?.focus())}}/>}
      {listItemPicker&&<TaskIconPicker anchor={{current:listItemPicker.anchor}} icon={listItemPicker.list.iconName} onIcon={icon=>{const list=listItemPicker.list;setListItemPicker(null);void updateTaskList(list.id,list.revision,list.name,icon,list.notes).then(patchList)}} onDismiss={()=>setListItemPicker(null)}/>}
    </section>
    <section className="task-main"><header className="task-toolbar"><button className="icon-button" aria-label={props.collapsed?'展开任务清单':'折叠任务清单'} onClick={props.onToggle}><Icon name={props.collapsed?'panel-left-open':'panel-left-close'}/></button><div className="task-tabs"><button className={view==='table'?'active':''} onClick={()=>setView('table')}><Icon name="list-checks"/>任务视图</button><button className={view==='calendar'?'active':''} onClick={()=>setView('calendar')}><Icon name="calendar-days"/>日历视图</button></div></header>
      {view==='table'&&selectedList&&<div className="task-list-heading"><div><button ref={headingIcon} className="task-heading-icon" aria-label="更换清单图标" onClick={()=>setHeadingPicker(true)}><Icon name={selectedList.iconName}/></button><input value={selectedList.name} onChange={e=>patchList({...selectedList,name:e.target.value})} onBlur={e=>void updateTaskList(selectedList.id,selectedList.revision,e.target.value,selectedList.iconName,selectedList.notes).then(patchList).catch(cause=>props.onError(cause instanceof Error?cause.message:'保存清单失败'))}/></div><input className="task-list-note" aria-label="清单备注" placeholder="添加清单备注…" value={selectedList.notes} onChange={e=>patchList({...selectedList,notes:e.target.value})} onBlur={e=>void updateTaskList(selectedList.id,selectedList.revision,selectedList.name,selectedList.iconName,e.target.value).then(patchList)}/>{headingPicker&&<TaskIconPicker anchor={headingIcon} icon={selectedList.iconName} onIcon={icon=>{setHeadingPicker(false);void updateTaskList(selectedList.id,selectedList.revision,selectedList.name,icon,selectedList.notes).then(patchList)}} onDismiss={()=>setHeadingPicker(false)}/>}</div>}
      {view==='calendar'?calendar():<div className="task-table-layout">
        <div className="task-filter-bar"><strong>{scope==='inbox'?'收集箱':scope==='all'?'全部任务':scope==='today'?'今天':scope==='completed'?'已完成':selectedList?.name}</strong><TaskSelect value={status} label="状态筛选" options={filterOptions.status} onChange={value=>setStatus(value as typeof status)}/><TaskSelect value={importance} label="重要程度筛选" options={filterOptions.importance} onChange={value=>setImportance(value as typeof importance)}/><TaskSelect value={dateFilter} label="日期筛选" options={filterOptions.date} onChange={value=>setDateFilter(value as typeof dateFilter)}/><TaskSelect value={sort} label="任务排序" options={filterOptions.sort} onChange={value=>setSort(value as typeof sort)}/></div>
        <div className={`task-table${showList?' with-list':''}`} style={{'--task-columns':taskColumns} as React.CSSProperties}>{resizeGuide!==null&&<span className="task-resize-guide" style={{left:resizeGuide}}/>}
          <div className="task-table-head">{titleHeader}{headerCell('start','开始时间','calendar-days')}{headerCell('due','结束时间','calendar-days')}{headerCell('importance','重要程度','circle')}{showList&&headerCell('list','所属清单','folder')}<span/></div>
          <div className="new-task-area">{creatingTask?<form className="new-task-row" onSubmit={e=>{e.preventDefault();void add()}}><span className="task-leading-slot"><Icon name="plus"/></span><span className="new-task-label"><input ref={newTaskInput} value={draft} aria-label="新任务名称" placeholder="输入任务名称" onChange={e=>setDraft(e.target.value)} onBlur={()=>void add()} onKeyDown={event=>{if(event.key==='Escape'){setDraft('');setCreatingTask(false)}}}/></span></form>:<button className="new-task-trigger" onClick={()=>setCreatingTask(true)}><span className="task-leading-slot"><Icon name="plus"/></span><span className="new-task-label"><span>新建任务</span></span></button>}</div>
          {loading?<div className="task-empty">正在加载任务…</div>:rows.length?rows.map(taskRow):<div className="task-empty"><Icon name="list-checks"/><strong>这里还没有任务</strong><span>点击上方“新建任务”，记录下一步。</span></div>}
        </div>
      </div>}
      {current&&<aside ref={taskDetailRef} className="task-detail"><header><strong>任务详情</strong><button aria-label="关闭详情" onClick={()=>setSelected(null)}><Icon name="x"/></button></header><label>标题<input value={current.title} onChange={e=>patchTask({...current,title:e.target.value})} onBlur={e=>void saveTask(current,{title:e.target.value})}/></label><div className="detail-dates"><label>开始<input type="datetime-local" value={current.startValue?new Date(current.startValue).toLocaleString('sv-SE').slice(0,16).replace(' ','T'):''} onChange={e=>void saveTask(current,{startValue:e.target.value?new Date(e.target.value).toISOString():null,startPrecision:e.target.value?'datetime':null})}/></label><label>结束<input type="datetime-local" value={current.dueValue?new Date(current.dueValue).toLocaleString('sv-SE').slice(0,16).replace(' ','T'):''} onChange={e=>void saveTask(current,{dueValue:e.target.value?new Date(e.target.value).toISOString():null,duePrecision:e.target.value?'datetime':null})}/></label></div><label>备注<textarea value={current.notes} placeholder="写下任务备注…" onChange={e=>patchTask({...current,notes:e.target.value})} onBlur={e=>void saveTask(current,{notes:e.target.value})}/></label><button className="danger task-detail-delete" onClick={()=>void remove(current)}><Icon name="trash-2"/>删除任务</button></aside>}
    </section>
  </>
}
