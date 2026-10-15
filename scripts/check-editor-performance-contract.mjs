import { readFileSync } from 'node:fs'

const editor=readFileSync(new URL('../src/features/editor/NoteEditor.tsx',import.meta.url),'utf8')
const css=readFileSync(new URL('../src/app/ux-fixes.css',import.meta.url),'utf8')
const app=readFileSync(new URL('../src/app/App.tsx',import.meta.url),'utf8')
const attachmentNodes=readFileSync(new URL('../src/features/editor/attachmentNodes.ts',import.meta.url),'utf8')
const attachmentResources=readFileSync(new URL('../src/features/editor/attachmentResources.ts',import.meta.url),'utf8')
const highlightBlock=readFileSync(new URL('../src/features/editor/highlightBlock.ts',import.meta.url),'utf8')
const compact=value=>value.replace(/\s+/g,'')
const editorCompact=compact(editor)
const appCompact=compact(app)

const requirements=[
  ['输入更新使用空闲调度',editor.includes('requestIdleCallback')&&editor.includes('scheduleSerialization(current.state.doc)')],
  ['输入更新未同步调用 getJSON',!/onUpdate:[^\n]*getJSON\(/.test(editor)],
  ['图层测量按动画帧合并',editor.includes('requestAnimationFrame')&&editor.includes('scheduleLayerUpdate(current)')],
  ['大粘贴支持进度',editor.includes('large-paste-progress')&&editor.includes('setPasteProgress')],
  ['大粘贴支持取消与回滚',editor.includes('pasteAbortRef')&&editorCompact.includes('replaceWith(0,view.state.doc.content.size,originalDoc.content,')],
    ['正文使用稳定块级编辑流',css.includes('.note-editor-content { display:block; }')&&!css.includes('.note-editor-content { display:grid;')],
  ['切换笔记前刷新编辑器快照',app.includes('flushPendingChanges()')&&app.indexOf('flushPendingChanges()')<app.indexOf('coordinator.flush()')],
  ['无脏内容时不提交保存',editor.includes('dirtyRef.current')&&editorCompact.includes('if(!dirtyRef.current)return')],
  ['正文与标题变更会标记脏状态',editorCompact.includes('dirtyRef.current=true;scheduleSerialization(current.state.doc)')&&editorCompact.includes('latestTitle.current=title')&&editorCompact.includes('dirtyRef.current=true;scheduleSerialization()')],
  ['不同粘贴批次的图片保持独立行',editor.includes('galleryGroupOverride ?? crypto.randomUUID()')&&editor.includes('imageLayoutRuns(')],
  ['图片和附件具有明确选中态',css.includes('.editor-image.is-selected')&&css.includes('.editor-media.is-selected')],
  ['图片可在资源管理器中定位',attachmentNodes.includes("'folder-open', '在资源管理器中显示'")&&editor.includes('attachmentId: attachments[index].id')],
  ['附件正文只保存轻量引用',editor.includes('attachmentReference(attachments[index].id)')&&attachmentResources.includes("ATTACHMENT_REFERENCE_PREFIX = 'coolnote-attachment:'")],
  ['附件按视口懒加载',attachmentNodes.includes('loadWhenNear(dom')&&attachmentNodes.includes("image.loading = 'lazy'")],
  ['批量附件限制并发',editor.includes('mapWithConcurrency(')&&editor.includes('files,')&&editor.includes('3,')],
  ['高亮块支持 Emoji 选择',editor.includes('HighlightBlock')&&css.includes('.editor-highlight-picker')],
  ['高亮块图标卡片脱离正文裁切边界',highlightBlock.includes('document.body.append(picker)')&&css.includes('.editor-highlight-picker { position:fixed')],
  ['高亮块工具 DOM 不进入正文变更流',highlightBlock.includes('ignoreMutation: mutation')&&highlightBlock.includes('!contentDOM.contains(mutation.target)')],
  ['高亮块不使用观察器反馈循环',!highlightBlock.includes('new MutationObserver')&&!highlightBlock.includes('new ResizeObserver')],
  ['切换笔记不触发列表刷新',/handleSelect=.*flushBeforeLeaving\(\).*notes\.select\(id\)/.test(app)&&!/handleSelect=.*notes\.refresh\(\).*notes\.select\(id\)/.test(app)],
  ['全局搜索不触发笔记列表刷新',app.includes('searchQueue.current.request(searchQuery).then')&&!app.includes('Promise.all([globalSearch(searchQuery),notes.refresh()])')],
  ['保存携带独立 Markdown 快照',editorCompact.includes('markdownSnapshot:latestMarkdown.current??noteToMarkdown')&&appCompact.includes('markdownSnapshot})')],
  ['正文图片点击后进入明确选中态',attachmentNodes.includes('NodeSelection.create')&&attachmentNodes.includes('selectImage()')],
  ['正文图片本体可直接拖动',attachmentNodes.includes('dom.draggable = true')&&attachmentNodes.includes('application/x-coolnote-image-pos')],
  ['正文图片支持退格键和删除键删除',attachmentNodes.includes('addKeyboardShortcuts()')&&attachmentNodes.includes('Backspace: remove, Delete: remove')],
  ['正文图片不显示冗余操作按钮',!editor.includes("className='editor-image-select'")&&!editor.includes("className='editor-image-delete'")&&!editor.includes("className='editor-image-drag'")],
  ['并排图片完整保留原始比例',css.includes('.editor-image[data-layout="gallery"] img { width:100%!important; height:auto!important; max-height:none; aspect-ratio:auto!important; object-fit:contain;')&&!css.includes('aspect-ratio:4/3; object-fit:cover;')],
  ['正文图片选中态具有可见边框',css.includes('.editor-image.is-selected')],
  ['同尺寸并排图片具有完全一致的内容宽度',css.includes('.editor-image[data-layout="gallery"] { display:inline-block; box-sizing:border-box; margin:5px 0; padding:0 5px;')&&css.includes('[data-gallery-size="3"] { width:33.333333%; }')],
]
const failed=requirements.filter(([,passed])=>!passed)
if(failed.length){for(const [name] of failed)console.error(`Editor performance contract failed: ${name}`);process.exit(1)}
console.log(`Editor performance contract passed: ${requirements.length} safeguards.`)
