// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react'
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest'

import { TaskWorkspace } from './TaskWorkspace'
import { reorderTaskList } from '../../shared/tauri/commands'

const snapshot={lists:[{id:'list-1',name:'产品发布',iconName:'list-todo',notes:'完成首版任务模块',sortOrder:0,revision:1,createdAt:'2026-08-15T00:00:00Z',updatedAt:'2026-08-15T00:00:00Z'},{id:'list-2',name:'日常维护',iconName:'briefcase-business',notes:'',sortOrder:1,revision:1,createdAt:'2026-08-15T00:00:00Z',updatedAt:'2026-08-15T00:00:00Z'}],tasks:[{id:'task-1',taskListId:null,title:'整理验收清单',notes:'备注常驻显示',startValue:'2026-08-15',startPrecision:'date' as const,dueValue:'2026-08-16',duePrecision:'date' as const,importance:'important' as const,isCompleted:false,completedAt:null,sortOrder:0,revision:1,createdAt:'2026-08-15T00:00:00Z',updatedAt:'2026-08-15T00:00:00Z'}],subtasks:[{id:'sub-1',taskId:'task-1',title:'验证日历',isCompleted:false,completedAt:null,sortOrder:0,revision:1,createdAt:'2026-08-15T00:00:00Z',updatedAt:'2026-08-15T00:00:00Z'}]}

vi.mock('../../shared/tauri/commands',()=>({
  getTaskSnapshot:vi.fn(async()=>snapshot),createTaskItem:vi.fn(),createTaskList:vi.fn(),createTaskSubtask:vi.fn(),deleteTaskItem:vi.fn(),deleteTaskList:vi.fn(),deleteTaskSubtask:vi.fn(),reorderTaskItem:vi.fn(),reorderTaskList:vi.fn(async()=>undefined),setTaskCompleted:vi.fn(),setTaskSubtaskCompleted:vi.fn(),undoTaskDelete:vi.fn(),updateTaskItem:vi.fn(),updateTaskList:vi.fn(),updateTaskSubtask:vi.fn(),
}))

const renderWorkspace=()=>render(<TaskWorkspace collapsed={false} openTaskId={null} onToggle={vi.fn()} onToast={vi.fn()} onError={vi.fn()} onCountChange={vi.fn()} onConfirm={vi.fn()}/>)

describe('TaskWorkspace',()=>{
  beforeEach(()=>vi.clearAllMocks())
  afterEach(()=>cleanup())
  it('renders system scopes, persistent notes, and light subtasks',async()=>{renderWorkspace();await screen.findByDisplayValue('整理验收清单');expect(screen.getAllByText('收集箱').length).toBeGreaterThan(0);expect(screen.getByText('全部任务')).toBeInTheDocument();expect(screen.getAllByText('今天').length).toBeGreaterThan(0);expect(screen.getAllByText('已完成').length).toBeGreaterThan(0);expect(screen.getByText('备注常驻显示')).toBeInTheDocument();fireEvent.click(screen.getByLabelText('展开子任务'));expect(screen.getByDisplayValue('验证日历')).toBeInTheDocument()})
  it('shows the list column only in global task scopes',async()=>{renderWorkspace();await screen.findByDisplayValue('整理验收清单');expect(screen.queryByText('所属清单')).not.toBeInTheDocument();fireEvent.click(screen.getByText('全部任务'));await waitFor(()=>expect(screen.getByText('所属清单')).toBeInTheDocument())})
  it('switches to the green-token calendar tab',async()=>{renderWorkspace();await screen.findByDisplayValue('整理验收清单');fireEvent.click(screen.getByText('日历视图'));expect(screen.getByText(/\d{4}年 \d{1,2}月/)).toBeInTheDocument()})
  it('closes task details when pointer down happens outside the task and detail panel',async()=>{renderWorkspace();const title=await screen.findByDisplayValue('整理验收清单');fireEvent.focus(title);expect(await screen.findByText('任务详情')).toBeInTheDocument();fireEvent.pointerDown(document.body);await waitFor(()=>expect(screen.queryByText('任务详情')).not.toBeInTheDocument())})
  it('persists task list drag ordering',async()=>{renderWorkspace();await screen.findByText('产品发布');const source=screen.getByText('产品发布').closest('[data-list-id]')!;const target=screen.getByText('日常维护').closest('[data-list-id]')!;const values=new Map<string,string>();const dataTransfer={effectAllowed:'none',dropEffect:'none',setData:(type:string,value:string)=>values.set(type,value),getData:(type:string)=>values.get(type)??''};fireEvent.dragStart(source,{dataTransfer});fireEvent.dragOver(target,{dataTransfer});fireEvent.drop(target,{dataTransfer});await waitFor(()=>expect(reorderTaskList).toHaveBeenCalledWith('list-1',null))})
})
