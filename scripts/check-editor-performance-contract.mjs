import { readFileSync } from 'node:fs'

const editor=readFileSync(new URL('../src/features/editor/NoteEditor.tsx',import.meta.url),'utf8')
const css=readFileSync(new URL('../src/app/ux-fixes.css',import.meta.url),'utf8')
const app=readFileSync(new URL('../src/app/App.tsx',import.meta.url),'utf8')

const requirements=[
  ['输入更新使用空闲调度',editor.includes('requestIdleCallback')&&editor.includes('scheduleSerialization(current.state.doc)')],
  ['输入更新未同步调用 getJSON',!/onUpdate:[^\n]*getJSON\(/.test(editor)],
  ['图层测量按动画帧合并',editor.includes('requestAnimationFrame')&&editor.includes('scheduleLayerUpdate(current)')],
  ['大粘贴支持进度',editor.includes('large-paste-progress')&&editor.includes('setPasteProgress')],
  ['大粘贴支持取消与回滚',editor.includes('pasteAbortRef')&&editor.includes('replaceWith(0,view.state.doc.content.size,originalDoc.content)')],
  ['离屏内容块跳过布局绘制',css.includes('content-visibility:auto')&&css.includes('contain-intrinsic-block-size')],
  ['切换笔记前刷新编辑器快照',app.includes('flushPendingChanges()')&&app.indexOf('flushPendingChanges()')<app.indexOf('coordinator.flush()')],
  ['无脏内容时不提交保存',editor.includes('dirtyRef.current')&&editor.includes('if(!dirtyRef.current)return')],
  ['正文与标题变更会标记脏状态',editor.includes('dirtyRef.current=true;scheduleSerialization(current.state.doc)')&&editor.includes('latestTitle.current=event.target.value;dirtyRef.current=true')],
  ['切换笔记时延迟重排',/handleSelect=.*flushBeforeLeaving\(\).*notes\.refresh\(\).*notes\.select\(id\)/.test(app)],
  ['全局搜索时重新应用列表排序',app.includes('Promise.all([globalSearch(searchQuery),notes.refresh()])')],
  ['保存携带独立 Markdown 快照',editor.includes('markdownSnapshot:noteToMarkdown')&&app.includes('markdownSnapshot})')],
]
const failed=requirements.filter(([,passed])=>!passed)
if(failed.length){for(const [name] of failed)console.error(`Editor performance contract failed: ${name}`);process.exit(1)}
console.log(`Editor performance contract passed: ${requirements.length} safeguards.`)
