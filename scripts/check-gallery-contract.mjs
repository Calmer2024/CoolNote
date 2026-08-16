import { readFileSync, readdirSync } from 'node:fs'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const app = read('src/app/App.tsx')
const workspace = read('src/features/gallery/GalleryWorkspace.tsx')
const galleryCss = read('src/app/gallery.css')
const appCss = read('src/app/app.css')
const uxCss = read('src/app/ux-fixes.css')
const iconRegistry = read('src/shared/components/iconRegistry.ts')
const overlay = read('src/shared/components/Overlay.tsx')
const commands = read('src/shared/tauri/commands.ts')
const service = read('src-tauri/src/application/gallery_service.rs')
const migration = read('src-tauri/migrations/0011_galleries.sql')
const coverMigration = read('src-tauri/migrations/0012_gallery_covers.sql')
const config = read('src-tauri/tauri.conf.json')
const guidelines = read('docs/design/design-guidelines.md')
const covers = read('src/shared/covers.ts')
const jottingWorkspace = read('src/features/jottings/JottingsWorkspace.tsx')
const coverFiles = readdirSync(new URL('../public/assets/covers/', import.meta.url)).filter(name => /\.png$/i.test(name))

const required = [
  [app, "id:'gallery',label:'画廊'", '侧边栏缺少画廊一级入口'],
  [workspace, 'gallery-masonry', '画廊缺少瀑布流'],
  [workspace, 'gallery-lightbox', '画廊缺少应用内灯箱'],
  [workspace, '复制图片', '灯箱缺少复制图片'],
  [workspace, '另存为', '灯箱缺少另存为'],
  [commands, "'import_gallery_path'", '前端缺少路径导入命令'],
  [commands, "'import_gallery_data'", '前端缺少无路径拖放导入命令'],
  [commands, "'undo_gallery_delete'", '前端缺少删除撤销命令'],
  [service, 'MAX_IMAGE_BYTES', '后端缺少图片大小门禁'],
  [service, 'content_hash', '后端缺少内容哈希去重'],
  [migration, 'CREATE TABLE galleries', '缺少画廊迁移'],
  [migration, 'idx_gallery_items_active_unique', '缺少同画廊图片唯一约束'],
  [coverMigration, 'ADD COLUMN cover', '缺少画廊封面迁移'],
  [app, "id:'gallery',label:'画廊',icon:'image'", '画廊一级入口图标未还原'],
  [workspace, 'name="book-image"', '画廊列表条目必须使用画册图标'],
  [iconRegistry, "'book-image'", '统一图标库缺少画册图标'],
  [workspace, '内置图片', '画廊封面按钮文案未按参考图调整'],
  [workspace, 'BUILT_IN_COVERS.map', '画廊未接入共享内置封面库'],
  [jottingWorkspace, 'BUILT_IN_COVERS.map', '小记未接入共享内置封面库'],
  [covers, 'coolnote-cover-', '共享封面库未引用打包图片'],
  [uxCss, 'grid-template-columns: repeat(4, 84px)', '小记封面库必须以四列展示六排容量'],
  [uxCss, 'grid-template-columns: repeat(4, minmax(0, 1fr))', '画廊封面库必须以四列展示六排容量'],
  [galleryCss, '.gallery-list-actions{position:absolute;right:3px;display:flex;gap:0;opacity:0;border-radius:6px;background:transparent', '画廊条目 Hover 操作不得有灰色外层容器'],
  [galleryCss, '.gallery-list-row:not(.renaming):hover .gallery-list-main small', '画廊条目 Hover 显示操作时必须隐藏数量'],
  [workspace, "renamingId!==gallery.id&&<span className=\"gallery-list-actions\">", '画廊重命名时必须隐藏操作图标'],
  [galleryCss, '.gallery-cover-actions{position:absolute;top:14px;right:14px;display:flex;gap:1px;width:max-content;max-width:calc(100% - 28px);padding:4px;border:0;border-radius:10px', '画廊封面操作卡片必须使用紧凑尺寸'],
  [galleryCss, '.gallery-heading-copy input{', '画廊标题样式不得覆盖隐藏的封面文件输入框'],
  [galleryCss, '/1.4 "Noto Serif SC"', '画廊标题行高必须为英文下伸字形保留足够空间'],
  [galleryCss, '--gallery-content-gutter:', '画廊标题、介绍与图片墙必须共用左侧间距'],
  [galleryCss, 'grid-template-columns:repeat(3,minmax(0,1fr))', '画廊图片墙必须每行最多三张'],
  [galleryCss, 'overflow-x:hidden', '画廊新建条目不得触发横向滚动条'],
  [workspace, 'aria-label="复制图片到剪贴板"', '画廊卡片复制必须写入剪贴板'],
  [workspace, 'ProductProgressToast', '画廊导入进度必须复用共享 Toast'],
  [overlay, 'window.setTimeout(() => closeRef.current(), 3000)', '画廊导入进度缺少定时消失机制'],
  [overlay, '<progress value={toast.current}', '共享 Toast 缺少导入进度条'],
  [appCss, '.progress-toast-content progress { width:100%; height:6px; overflow:hidden; appearance:none; border:0;', '导入进度条不得绘制边框'],
  [overlay, 'await state.onConfirm(currentValue);onClose()', '确认操作成功后共享弹窗必须关闭'],
  [overlay, 'closeRef.current(), timeoutMs', '共享 Toast 计时器不得被父级重渲染重置'],
  [workspace, 'aria-label="全选已加载"', '画廊选择栏缺少纯图标全选操作'],
  [workspace, 'className={`gallery-check${selected.has(item.id)', '每张图片必须提供独立选中态入口'],
  [workspace, 'draggable={false}', '图片本身必须禁用原生拖拽，避免排序时出现异常拖拽预览线'],
  [workspace, "void dragItem(id,null)", '图片墙末尾必须可作为排序落点'],
  [galleryCss, '.gallery-card.selected .gallery-card-actions', '选中图片必须持续显示移动与删除操作'],
  [galleryCss, 'aspect-ratio:auto;object-fit:contain', '图片排列必须完整保留原始比例，不得裁剪'],
  [galleryCss, 'line-height:0', '图片容器必须消除基线缝隙和横线'],
  [guidelines, '必须复用共享的 `ProductToast`', '设计规范缺少共享 Toast 约束'],
  [guidelines, '任何新建态都不得触发横向滚动条', '设计规范缺少新建条目溢出约束'],
  [guidelines, '每行最多 3 张', '设计规范缺少画廊三列上限'],
  [guidelines, '计时器不得因父组件重渲染而重置', '设计规范缺少 Toast 定时关闭约束'],
  [appCss, '.notes-header-actions .icon-button', '笔记列表标题栏操作按钮尺寸与颜色未统一'],
  [app, 'data-view-transition={viewTransitionVersion%2', 'Tab 切换缺少可重播的过渡状态'],
  [uxCss, '.workspace[data-view-transition="even"] > section', 'Tab 切换缺少偶数帧过渡'],
  [uxCss, '.workspace[data-view-transition="odd"] > section', 'Tab 切换缺少奇数帧过渡'],
  [guidelines, 'Tab 切换必须播放统一的过渡动画', '设计规范缺少 Tab 过渡约束'],
  [guidelines, '单行大字号标题输入框', '设计规范缺少英文字形防裁剪约束'],
]

for (const [source, marker, message] of required) {
  if (message && !source.includes(marker)) throw new Error(message)
}
if (!config.includes('"dragDropEnabled": false')) throw new Error('Tauri 窗口不得拦截小记 HTML 拖拽')
if (coverFiles.length !== 24) throw new Error(`应打包完整的 24 张内置封面，实际为 ${coverFiles.length} 张`)
if (!covers.includes('[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24]')) throw new Error('共享封面库必须连续注册封面 1 至 24')
if (!workspace.includes('支持 JPEG、PNG、WebP、GIF，单张最大 100 MB')) throw new Error('画廊导入边界未展示')
console.log('Gallery contract passed: navigation, persistence, import, undo, lightbox and drag boundary.')
