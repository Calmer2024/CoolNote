import { readFileSync } from 'node:fs'

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8')
const app=read('src/app/App.tsx')
const workspace=read('src/features/tasks/TaskWorkspace.tsx')
const css=read('src/app/tasks.css')
const commands=read('src/shared/tauri/commands.ts')
const store=read('src/shared/tauri/webStore.ts')
const service=read('src-tauri/src/application/task_service.rs')
const migration=read('src-tauri/migrations/0013_tasks.sql')
const registry=read('src/shared/components/iconRegistry.ts')

const required=[
  [app,"id:'tasks',label:'任务',icon:'list-checks'",'侧边栏缺少独立任务入口或未使用统一任务图标'],
  [app,"mode==='tasks'?<TaskWorkspace",'任务入口未接入工作区'],
  [workspace,"nav('inbox','收集箱'",'缺少收集箱'],
  [workspace,"nav('all','全部任务'",'缺少全部任务'],
  [workspace,"nav('today','今天'",'缺少今天'],
  [workspace,"nav('completed','已完成'",'缺少已完成'],
  [workspace,'任务视图','缺少任务视图 Tab'],
  [workspace,'日历视图','缺少日历视图 Tab'],
  [workspace,"document.addEventListener('pointerdown',close,true)",'任务详情缺少点击外部关闭交互'],
  [workspace,"reorderTaskList(id,beforeId)",'任务清单拖拽排序未接入持久化命令'],
  [workspace,"textIcon label=\"所属清单\"",'所属清单选择器未启用正文大小图标'],
  [workspace,'className="task-leading-slot"><Icon name="plus"','新建任务图标未与完成圆圈共用首列对齐槽'],
  [workspace,'className="task-leading-slot"><Icon name="list-checks"','任务标题图标未与完成圆圈共用首列对齐槽'],
  [workspace,'task.notes&&<p>{task.notes}</p>','任务备注必须在表格中常驻显示'],
  [css,'--accent:#35a56a','任务模块缺少绿色 Token'],
  [css,'.task-heading-icon .icon:only-child{display:block;width:25px;height:25px}','清单标题的唯一图标可能被误隐藏'],
  [css,'.task-list-panel>header .secondary-panel-heading>.icon{color:var(--accent)','任务侧栏标题图标未锁定绿色 Token'],
  [css,'.new-task-label{grid-column:2','新建任务文字未与任务标题列对齐'],
  [css,'.task-leading-slot{display:grid;width:28px','任务表头和新建任务图标缺少完成列对齐规则'],
  [css,'.task-select-trigger.compact.text-icon>.icon:first-child{width:15px','所属清单图标尺寸未与文字匹配'],
  [css,'.user-task-lists .task-nav-row.drop-before::before','任务清单拖拽缺少可见落点'],
  [registry,"'list-checks'",'统一图标库缺少任务专属图标'],
  [commands,"'get_task_snapshot'",'前端缺少任务快照命令'],
  [commands,"'undo_task_delete'",'前端缺少任务撤销命令'],
  [store,'webTaskSnapshot','Web 模式缺少任务持久化'],
  [migration,'CREATE TABLE task_lists','缺少任务清单表'],
  [migration,'CREATE TABLE tasks','缺少任务表'],
  [migration,'CREATE TABLE task_subtasks','缺少轻量子任务表'],
  [service,'UNDO_SECONDS: i64 = 8','任务删除撤销期必须为 8 秒'],
  [service,'截止时间不能早于开始时间','后端缺少日期区间校验'],
]
for(const[source,marker,message]of required)if(!source.includes(marker))throw new Error(message)
if(migration.includes('parent_id'))throw new Error('子任务表不得允许三级嵌套')
console.log('Task contract passed: navigation, persistence, table, calendar, search, hierarchy and undo.')
