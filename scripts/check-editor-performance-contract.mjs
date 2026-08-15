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
  ['正文图片点击后进入明确选中态',editor.includes('NodeSelection.create')&&editor.includes('selectImage()')],
  ['正文图片本体可直接拖动',editor.includes('dom.draggable=true')&&editor.includes('application/x-coolnote-image-pos')],
  ['正文图片支持退格键和删除键删除',editor.includes('addKeyboardShortcuts()')&&editor.includes('Backspace:remove,Delete:remove')],
  ['正文图片不显示冗余操作按钮',!editor.includes("className='editor-image-select'")&&!editor.includes("className='editor-image-delete'")&&!editor.includes("className='editor-image-drag'")],
  ['并排图片完整保留原始比例',css.includes('.editor-image[data-layout="gallery"] img { width:100%!important; height:auto!important; max-height:none; aspect-ratio:auto!important; object-fit:contain;')&&!css.includes('aspect-ratio:4/3; object-fit:cover;')],
  ['正文图片选中态具有可见边框',css.includes('.editor-image.is-selected')],
  ['同尺寸并排图片具有完全一致的内容宽度',css.includes('.editor-image[data-layout="gallery"] { width:100%; margin:5px 0; padding:0 5px;')&&!css.includes('.editor-image[data-layout="gallery"][data-gallery-index="0"] { grid-column-start:1; padding-left:0;')&&!css.includes('{ padding-right:0; }')],
]
const failed=requirements.filter(([,passed])=>!passed)
if(failed.length){for(const [name] of failed)console.error(`Editor performance contract failed: ${name}`);process.exit(1)}
console.log(`Editor performance contract passed: ${requirements.length} safeguards.`)
