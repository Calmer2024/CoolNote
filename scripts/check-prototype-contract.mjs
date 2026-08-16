import { readFileSync } from 'node:fs'

const contracts={
  'src/app/App.tsx':[
    'className="app-header"','className="workspace"','className="sidebar"','className="primary-nav"',
    'className="section-label row-label"','className="mini-action"','id="addCategory"','id="categoryNav"',
    'className="tree-row category-row-draft"','className="category-name category-name-input"','aria-label="分类名称"',
    'className="prototype-layer icon-picker open"','className="icon-picker-colors"','className="icon-picker-grid"',
  ],
  'src/features/editor/NoteEditor.tsx':[
    'className="document-heading"','className="document-meta"','id="documentMeta"',
    'className="mood-trigger"','className="mood-picker product-layer"',
    'className="editor-surface"','className="selection-toolbar product-layer"','className="slash-menu product-layer"',
  ],
  'src/features/jottings/JottingsWorkspace.tsx':[
    'className="jotting-tree-panel"','id="jottingTreePanel"','aria-label="小记资源树"',
    'className={`jotting-tree','id="jottingTree"','data-kind="folder"','data-kind="file"',
    'className="jotting-document-panel"','id="jottingWorkspace"','className="jotting-document-toolbar"',
    'className="jotting-path"','className="jotting-document-scroll"','className="jotting-paper"',
    'className="jotting-cover"','className="jotting-cover-actions"','className="jotting-cover-picker open"',
    "class:'jotting-markdown'","'aria-label':'小记 Markdown 正文'",'EditorContent editor={editor}',
  ],
}

let failed=false
for(const [path,markers] of Object.entries(contracts)){
  const source=readFileSync(new URL(`../${path}`,import.meta.url),'utf8')
  for(const marker of markers){if(!source.includes(marker)){failed=true;console.error(`Prototype contract missing in ${path}: ${marker}`)}}
}
const appSource=readFileSync(new URL('../src/app/App.tsx',import.meta.url),'utf8')
const jottingSource=readFileSync(new URL('../src/features/jottings/JottingsWorkspace.tsx',import.meta.url),'utf8')
const uxSource=readFileSync(new URL('../src/app/ux-fixes.css',import.meta.url),'utf8')
const appCss=readFileSync(new URL('../src/app/app.css',import.meta.url),'utf8')
const prototypeCss=readFileSync(new URL('../src/app/prototype-exact.css',import.meta.url),'utf8')
const tauriSource=readFileSync(new URL('../src-tauri/tauri.conf.json',import.meta.url),'utf8')
const noteEditorSource=readFileSync(new URL('../src/features/editor/NoteEditor.tsx',import.meta.url),'utf8')
const phycatCodeSource=readFileSync(new URL('../src/features/editor/phycatCode.ts',import.meta.url),'utf8')
const notesPanelSource=readFileSync(new URL('../src/features/notes/NotesPanel.tsx',import.meta.url),'utf8')
const overlaySource=readFileSync(new URL('../src/shared/components/Overlay.tsx',import.meta.url),'utf8')
const exportSource=readFileSync(new URL('../src/features/export/export.ts',import.meta.url),'utf8')
const guidelineSource=readFileSync(new URL('../docs/design/design-guidelines.md',import.meta.url),'utf8')
const skeletonSource=readFileSync(new URL('../src/shared/components/Skeleton.tsx',import.meta.url),'utf8')
const markdownShortcutSource=readFileSync(new URL('../src/features/editor/markdownShortcuts.ts',import.meta.url),'utf8')
const builtinMigrationSource=readFileSync(new URL('../src-tauri/migrations/0014_builtin_product_guide.sql',import.meta.url),'utf8')
const productGuideMigrationSource=readFileSync(new URL('../src-tauri/migrations/0015_product_guide_v2.sql',import.meta.url),'utf8')
const productGuideSource=readFileSync(new URL('../src/shared/product-guide.md',import.meta.url),'utf8')
const workspaceCommandsSource=readFileSync(new URL('../src-tauri/src/commands/workspace.rs',import.meta.url),'utf8')
const categoryIconCount=(appSource.match(/const categoryIcons=\[([^\]]+)\]/)?.[1].match(/'[^']+'/g)??[]).length
const designRules=[
  [noteEditorSource.includes("const moods=['😀'")&&noteEditorSource.includes("return'今天修改'")&&uxSource.includes('grid-template-columns:repeat(6,minmax(0,1fr))')&&uxSource.includes('overflow:hidden'),'心情元信息必须使用相对日期、30 个 Emoji 的 6×5 网格且不得横向溢出'],
  [!appCss.includes('translateX(-50%)')&&noteEditorSource.includes('left:slash.left,top:slash.top')&&noteEditorSource.includes('placement="bottom-start"'),'公式输入浮层必须位于触发点正下方并保持左对齐'],
  [!appSource.includes("id:'pinned'")&&!appSource.includes('置顶')&&!notesPanelSource.includes('置顶'),'笔记与分类不得保留置顶入口或侧边栏视图'],
  [!/<strong>新建(?:笔记|小记|文件夹|分类)<\/strong>/.test(appSource+jottingSource),'新建菜单不得使用粗体标签'],
  [!appSource.includes('创建当前分类的子分类'),'分类菜单不得提供子分类入口'],
  [uxSource.includes('.note-editor-content .ProseMirror-selectednode')&&uxSource.includes('border-color:transparent!important'),'文本块选中态不得出现边框'],
  [uxSource.includes('align-content:start')&&uxSource.includes('grid-auto-rows:43px'),'分类间距必须使用稳定行高'],
  [JSON.parse(tauriSource).app.windows.every(window=>window.dragDropEnabled===false),'Tauri 窗口不得拦截小记 HTML 拖拽'],
  [noteEditorSource.includes('className="heading-tool"')||noteEditorSource.includes('heading-tool${'),'文本选择工具条必须提供标题级别'],
  [!noteEditorSource.includes('editor-block-actions')&&!noteEditorSource.includes('blockControl')&&!noteEditorSource.includes('blockInsertMenu')&&!appCss.includes('.editor-block-actions')&&!uxSource.includes('.editor-block-actions'),'编辑器不得保留行识别按钮设计或相关代码'],
  [appCss.includes('.icon:last-child:not(:first-child)'),'菜单只允许末尾箭头自动靠右，主语义图标必须左对齐'],
  [overlaySource.includes('export function GlobalTooltip()')&&appSource.includes('<GlobalTooltip/>')&&guidelineSource.includes('### 3.1 Tooltip'),'按钮 Tooltip 必须由全局锚点系统实现并写入设计规范'],
  [noteEditorSource.includes('className="slash-menu-items"')&&uxSource.includes('.slash-menu-items')&&uxSource.includes('overflow-y:auto')&&uxSource.includes('@keyframes slash-menu-fade'),'斜杠菜单必须将搜索头与独立滚动列表分离，且进入动画不得产生位置抖动'],
  [noteEditorSource.includes("pinyin:'zhengwen zw'")&&noteEditorSource.includes('item.pinyin'),'斜杠菜单必须支持中文命令的全拼与首字母搜索'],
  [noteEditorSource.includes("name:'imageGalleryLayout'")&&noteEditorSource.includes('offset+=5')&&noteEditorSource.includes('gallerySize:gallery?chunk.length:1')&&noteEditorSource.includes("setAttribute('data-drag-handle','')")&&noteEditorSource.includes('posAtCoords')&&noteEditorSource.includes('animateImageLayout')&&uxSource.includes('[data-gallery-size="5"]'),'笔记图片必须支持拖到相邻图片右侧后自动按最多 5 张等宽成组并播放过渡动画'],
  [noteEditorSource.includes('Backspace:remove,Delete:remove')&&!noteEditorSource.includes('saveDataUrl'),'笔记图片必须使用直接拖动和键盘删除，不得显示冗余操作按钮'],
  [jottingSource.includes('const saveCurrent=async')&&jottingSource.includes('onErrorRef'),'小记切换前必须保存，初始化不得因回调引用变化而重跑'],
  [!jottingSource.includes('未命名小记.md')&&jottingSource.includes("useState('未命名小记')"),'小记名称不得自动附加 .md 后缀'],
  [jottingSource.includes('jotting-date-signature')&&jottingSource.includes('formatJottingDate')&&prototypeCss.includes('font-size: 15px')&&prototypeCss.includes('font-style: normal'),'小记末尾必须以适当增大的正体字显示更新日期落款'],
  [uxSource.includes('.editor-word-count { position:fixed')&&uxSource.includes('right:calc(var(--outline-current-width) + 14px)')&&uxSource.includes('transition:right 180ms ease'),'笔记字数统计必须位于正文滚动条左侧并随大纲宽度移动'],
  [uxSource.includes('.jotting-markdown.ProseMirror-focused')&&uxSource.includes('box-shadow: none')&&prototypeCss.includes('box-shadow: none'),'小记纸张及编辑区聚焦时不得重新出现上下阴影矩形'],
  [noteEditorSource.includes('aria-label="搜索代码语言"')&&noteEditorSource.includes("language||'auto'")&&noteEditorSource.includes('CodeLanguageIcon')&&noteEditorSource.includes('codeSuggestionsOpen')&&phycatCodeSource.includes("name:'search'")&&phycatCodeSource.includes("line.className='phycat-code-line-number'")&&uxSource.includes('.code-language-icon::before')&&uxSource.includes('margin-left:0!important')&&uxSource.includes('overflow:hidden'),'Phycat 代码块必须提供逐行编号、真实 Logo、auto 图标与可搜索语言浮层，且多层 Logo 不得重复负偏移或溢出'],
  [uxSource.includes('overflow-x:hidden')&&uxSource.includes('white-space:pre-wrap')&&uxSource.includes('overflow-wrap:anywhere')&&!uxSource.includes('overflow-x:auto; overflow-y:hidden; border-radius:0 0 5px 5px'),'Phycat 代码块必须禁用横向滚动并对超长逻辑行进行软换行'],
  [phycatCodeSource.includes("lineMeasure.className='phycat-code-line-measure'")&&phycatCodeSource.includes('syncLogicalLineHeights')&&phycatCodeSource.includes('visualLines*lineHeight'),'代码块行号高度必须跟随逻辑行的软换行高度，视觉续行不得生成额外编号'],
  [noteEditorSource.includes('boundary={editorSurfaceRef}')&&noteEditorSource.includes('codeLayerPoint')&&overlaySource.includes('boundary?: RefObject<HTMLElement | null>'),'代码语言选择器必须限制在笔记编辑层边界内'],
  [uxSource.includes('border-color:var(--accent)')&&uxSource.includes('background:var(--accent-soft)')&&uxSource.includes('color:var(--accent)')&&!uxSource.includes('#008145')&&!uxSource.includes('#6cb19125'),'代码语言选择器状态色必须使用主题蓝色令牌'],
  [!phycatCodeSource.includes('new MutationObserver(()=>sync(node))')&&phycatCodeSource.includes("mutation.target===contentDOM&&mutation.attributeName==='class'"),'代码块行号与语言 class 不得通过 DOM 观察器反写编辑器，避免语言切换更新循环'],
  [noteEditorSource.includes("const inCode=$from.parent.type.name==='codeBlock'")&&noteEditorSource.includes('&&!inCode'),'代码块文本选区不得打开一般文本选区工具条'],
  [appCss.includes('.reading-layout > .outline')&&appCss.includes('grid-column: 2'),'大纲必须固定在阅读布局右列，编辑器初始化时不得跳到左侧'],
  [uxSource.includes('hr[data-block-id]')&&uxSource.includes('height:1px!important')&&uxSource.includes('.ProseMirror-selectednode'),'水平分隔线必须保持静态细线样式并提供选中态'],
  [overlaySource.includes("addEventListener('pointerdown',dismiss,true)")&&overlaySource.includes('hide(null)'),'Tooltip 必须在外部按下时立即清理当前目标'],
  [!overlaySource.includes('useLayoutEffect(update, [children, update])')&&overlaySource.includes('current.maxHeight===next.maxHeight?current:next'),'浮层定位必须跳过等值状态写入，避免内容变化引发持续渲染循环'],
  [exportSource.includes("from '@tauri-apps/plugin-dialog'")&&exportSource.includes("from '@tauri-apps/plugin-fs'")&&exportSource.includes('canvasToPdf')&&!exportSource.includes('contentWindow?.print'),'所有导出必须先选择路径，PDF 必须生成文件而非调用打印窗口'],
  [noteEditorSource.includes("key==='i'")&&noteEditorSource.includes("key==='u'")&&noteEditorSource.includes("key==='t'")&&noteEditorSource.includes("key==='f'||key==='h'")&&appSource.includes("event.code==='Slash'"),'编辑器与大纲快捷键必须保持接通'],
  [notesPanelSource.indexOf('className="icon-button note-create-menu-trigger"')<notesPanelSource.indexOf('className="icon-button sort-button"')&&notesPanelSource.includes('className="product-menu note-create-dropdown"')&&notesPanelSource.includes('新建笔记</span>')&&notesPanelSource.includes('导入笔记</span>'),'新建纯图标按钮必须位于排序左侧并打开标准双操作菜单'],
  [!appSource.includes('compact-document-menu')&&guidelineSource.includes('### 3.2 下拉菜单与上下文菜单')&&uxSource.includes('width: 224px')&&uxSource.includes('min-height: 35px'),'所有动作菜单必须遵循笔记条目菜单统一几何规范'],
  [categoryIconCount===30&&prototypeCss.includes('grid-template-columns: repeat(5, 38px)'),'分类图标库必须提供 30 个已注册语义图标，按五列展示完整六排'],
  [appCss.includes('margin-block: 24px')&&appCss.includes('background: #e3e7eb')&&guidelineSource.includes('### 4.2 滚动条'),'滚动条必须使用缩短轨道与淡色规范'],
  [notesPanelSource.includes('className="select-all-action"')&&appSource.includes('onSelectAll={notes.selectAll}'),'笔记多选栏必须接通全选与取消全选操作'],
  [prototypeCss.includes('.jotting-cover:hover .jotting-cover-actions')&&prototypeCss.includes('opacity: 0'),'小记封面操作必须与画廊一致，仅在 Hover 或聚焦时显示'],
  [jottingSource.includes('handleDrop:')&&jottingSource.includes("file.type.startsWith('image/')")&&jottingSource.includes('jotting-selection-toolbar'),'小记必须支持图片拖拽/粘贴并提供选中文本样式菜单'],
  [noteEditorSource.includes('editor-resource-preview')&&noteEditorSource.includes("mediaType:'text/uri-list'")&&noteEditorSource.includes('在资源管理器中显示')&&workspaceCommandsSource.includes('explorer.exe'),'附件必须支持网页/HTML 内嵌预览、外部跳转与资源管理器定位'],
  [builtinMigrationSource.includes('欢迎使用 CoolNote')&&builtinMigrationSource.includes('我的文件')&&productGuideMigrationSource.includes('coolnote_product_guide_target')&&productGuideMigrationSource.includes("name='我的文件'")&&productGuideSource.includes('## 快捷键速查')&&productGuideSource.includes('## 任务')&&productGuideSource.includes('## 画廊')&&notesPanelSource.includes('built-in-note'),'既有“我的文件”分类必须承载不可删除且包含完整功能与快捷键说明的内置产品介绍笔记'],
  [markdownShortcutSource.includes("kind:'bold'")&&markdownShortcutSource.includes('blockMath')&&markdownShortcutSource.includes('inlineMath'),'Markdown 快捷样式必须覆盖粗体、行内公式和块公式的粘贴及输入法提交场景'],
  [skeletonSource.includes('skeleton-sidebar')&&skeletonSource.includes('skeleton-content')&&uxSource.includes('@keyframes coolnote-shimmer')&&uxSource.includes('prefers-reduced-motion:reduce'),'侧边栏与内容区加载态必须使用统一 Shimmer 骨架并尊重减少动态效果设置'],
]
for(const [passed,message] of designRules){if(!passed){failed=true;console.error(`Design contract failed: ${message}`)}}
if(failed)process.exit(1)
console.log(`Prototype contract passed: ${Object.values(contracts).flat().length} required DOM markers and ${designRules.length} design rules.`)
