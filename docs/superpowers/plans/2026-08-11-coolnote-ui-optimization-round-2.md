# CoolNote UI 第二轮优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有静态原型上完成侧栏、笔记栏、大纲、标签、列表密度和中文字体的第二轮视觉与折叠交互优化。

**Architecture:** 保留当前单页 HTML、集中式 CSS 和轻量原生 JavaScript 面板控制器。HTML 只保留笔记栏与大纲各一个控制入口；根节点状态属性驱动 CSS Grid 的零宽收起；本地 WOFF2 字体和 Lucide 精灵确保页面离线运行。

**Tech Stack:** HTML5、CSS Grid、原生 JavaScript、PowerShell 静态校验、本地 Lucide SVG sprite、本地 Noto Sans Simplified Chinese WOFF2。

## Global Constraints

- 最左侧导航栏永久显示，不存在折叠入口或折叠状态。
- 笔记列表只允许由文档顶部工具栏中的按钮折叠，收起后宽度必须为 `0`。
- 大纲只允许由“大纲”左侧 Lucide 图标控制，收起后只留下一个固定展开按钮。
- 禁止使用 Unicode、Emoji、字符箭头、自绘 CSS 图形或非 Lucide 图标充当界面图标。
- 页面运行时不得依赖 CDN、远程字体或其他网络资源。
- `app.js` 只实现 `notes` 和 `outline` 两类面板折叠，不增加业务功能。
- 当前目录不是 Git 仓库；每项任务完成后记录验证结果，不执行无法成立的 commit 步骤。

---

## File Structure

- Modify: `index.html` — 删除重复和无效控制入口，建立笔记栏与大纲的唯一可访问控制按钮。
- Modify: `styles.css` — 注册本地字体，调整网格折叠宽度、列表密度、标签填充和无分隔线布局。
- Modify: `app.js` — 删除侧栏面板配置，只同步笔记栏与大纲状态。
- Modify: `tests/validate-static.ps1` — 固化 DOM、CSS、字体、图标和脚本状态契约。
- Create: `assets/fonts/noto-sans-sc.css` — 本地 `@font-face` 与 Unicode range 声明。
- Create: `assets/fonts/files/*.woff2` — 101 个分段 WOFF2 文件，覆盖完整字体字符范围。
- Create: `assets/fonts/LICENSE` — 随字体包提供的许可证。

### Task 1: 将新需求固化为失败的静态契约

**Files:**
- Modify: `tests/validate-static.ps1`
- Test: `tests/validate-static.ps1`

**Interfaces:**
- Consumes: 当前 `index.html`、`styles.css`、`app.js` 和 `assets` 目录。
- Produces: 对唯一折叠入口、零宽收起、本地字体和无分隔线样式的可执行验证契约。

- [ ] **Step 1: 更新必需文件和必需标记检查**

将字体样式、许可证和 WOFF2 目录加入交付物列表：

```powershell
$fontCssPath = Join-Path $root 'assets\fonts\noto-sans-sc.css'
$fontLicensePath = Join-Path $root 'assets\fonts\LICENSE'
$fontFilesPath = Join-Path $root 'assets\fonts\files'

foreach ($path in @($htmlPath, $cssPath, $logoPath, $lucidePath, $lucideLicensePath, $appPath, $fontCssPath, $fontLicensePath, $fontFilesPath)) {
    if (-not (Test-Path -LiteralPath $path)) {
        throw "Missing deliverable: $path"
    }
}

$fontFiles = @(Get-ChildItem -LiteralPath $fontFilesPath -Filter '*.woff2')
if ($fontFiles.Count -ne 101) {
    throw "Expected 101 local Noto Sans SC WOFF2 segments, found $($fontFiles.Count)."
}

$fontCss = Get-Content -Raw -LiteralPath $fontCssPath
```

从 `$requiredHtml` 删除以下旧标记：

```powershell
'data-sidebar-collapsed'
'data-collapse-target="sidebar"'
```

从 `$requiredCss` 删除侧栏折叠选择器和旧工具栏隐藏规则，并要求新规则：

```powershell
$requiredCss = @(
    'display: grid',
    '--header-height',
    '@media (max-width: 1280px)',
    '@media (max-width: 980px)',
    'overflow-y: auto',
    '--notes-current-width: 0px',
    '[data-notes-collapsed="true"]',
    '[data-outline-collapsed="true"]'
)

$requiredFontCss = @(
    '@font-face',
    "font-family: 'Noto Sans SC Variable'",
    './files/noto-sans-sc-',
    "format('woff2-variations')",
    'unicode-range:'
)
```

在 CSS 标记检查后加入字体 CSS 标记检查：

```powershell
$missingFontCss = $requiredFontCss | Where-Object { $fontCss -notmatch [regex]::Escape($_) }
if ($missingFontCss) {
    throw "Missing font CSS markers: $($missingFontCss -join ', ')"
}
```

- [ ] **Step 2: 添加结构、样式和控制器的负向断言**

在现有标记检查后加入：

```powershell
if ($html -match 'data-sidebar-collapsed|data-collapse-target="sidebar"') {
    throw 'The fixed sidebar still exposes collapse state or controls.'
}

if ($html -notmatch '<link rel="stylesheet" href="assets/fonts/noto-sans-sc\.css">') {
    throw 'The page is missing the local Noto Sans SC stylesheet reference.'
}

$notesControls = [regex]::Matches($html, 'data-collapse-target="notes"')
if ($notesControls.Count -ne 1) {
    throw "Expected exactly one notes collapse control, found $($notesControls.Count)."
}

$outlineControls = [regex]::Matches($html, 'data-collapse-target="outline"')
if ($outlineControls.Count -ne 1) {
    throw "Expected exactly one outline collapse control, found $($outlineControls.Count)."
}

if ($html -notmatch 'class="outline-title-toggle"[\s\S]*?data-collapse-target="outline"') {
    throw 'The outline title icon is not the outline collapse control.'
}

if ($css -match '\.workspace\[data-sidebar-collapsed="true"\]') {
    throw 'Legacy sidebar collapse CSS remains.'
}

if ($css -match '\.document-toolbar\s*\{[^}]*border-bottom\s*:') {
    throw 'The document toolbar still has a bottom divider.'
}

if ($css -match '\.outline\s*\{[^}]*border-left\s*:') {
    throw 'The outline still has a divider from the document.'
}

if ($css -notmatch '\.document-chip\s*\{[^}]*border\s*:\s*0\s*;') {
    throw 'Document chips are not explicitly borderless.'
}

if ($app -match "\bsidebar\s*:") {
    throw 'The controller still manages sidebar state.'
}
```

将外部依赖检查扩展到字体样式：

```powershell
$frontend = $html, $css, $fontCss, $app -join "`n"
if ($frontend -match '@import\b|https?://') {
    throw 'Forbidden external network dependency found.'
}
```

将脚本契约循环替换为：

```powershell
foreach ($marker in @('data-collapse-target', 'aria-expanded', 'data-notes-collapsed', 'data-outline-collapsed')) {
    if ($app -notmatch [regex]::Escape($marker)) {
        throw "The panel controller is missing contract marker: $marker"
    }
}
```

- [ ] **Step 3: 运行静态校验并确认红灯**

Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\tests\validate-static.ps1
```

Expected: FAIL，首个失败应为缺少 `assets\fonts\noto-sans-sc.css`，或仍存在侧栏折叠标记；不得出现 PowerShell 语法错误。

### Task 2: 简化 HTML 控制入口与 JavaScript 状态

**Files:**
- Modify: `index.html`
- Modify: `app.js`
- Test: `tests/validate-static.ps1`

**Interfaces:**
- Consumes: Task 1 定义的 DOM 与控制器契约。
- Produces: `data-notes-collapsed`、`data-outline-collapsed` 两个布尔字符串状态，以及各自唯一的 `[data-collapse-target]` 按钮。

- [ ] **Step 1: 删除最侧边栏折叠结构**

将工作区起始标签改为：

```html
<main class="workspace" data-notes-collapsed="false">
```

从 `.sidebar-header` 中完整删除带有 `data-collapse-target="sidebar"` 的按钮，只保留 `.brand`。

- [ ] **Step 2: 删除笔记标题区的重复折叠按钮**

将 `.notes-header-actions` 保持为只有排序按钮：

```html
<div class="notes-header-actions">
  <button class="icon-button sort-button" type="button" aria-label="排序笔记">
    <svg class="icon"><use href="assets/lucide-icons.svg#arrow-down-narrow-wide"/></svg>
  </button>
</div>
```

文档顶部工具栏中的 `.panel-toggle` 保持为唯一的 `data-collapse-target="notes"` 控件，并继续使用 `panel-left-close` / `panel-left-open`。

- [ ] **Step 3: 将大纲标题图标改为唯一折叠按钮**

用以下结构替换整个 `.outline-header`：

```html
<div class="outline-header">
  <button class="outline-title-toggle" type="button" aria-label="收起大纲" aria-controls="outline-content" aria-expanded="true" data-collapse-target="outline" data-expanded-icon="list-tree" data-collapsed-icon="panel-right-open">
    <svg class="icon"><use href="assets/lucide-icons.svg#list-tree"/></svg>
    <span>大纲</span>
  </button>
</div>
```

收起状态由 CSS 隐藏按钮内的 `span`，但保留同一按钮和 Lucide 图标作为固定展开入口。

- [ ] **Step 4: 将控制器缩减为两个面板**

从 `panels` 对象中删除 `sidebar` 项，保留：

```javascript
const panels = {
  notes: {
    root: workspace,
    attribute: 'data-notes-collapsed',
    expandedLabel: '收起笔记列表',
    collapsedLabel: '展开笔记列表'
  },
  outline: {
    root: readingLayout,
    attribute: 'data-outline-collapsed',
    expandedLabel: '收起大纲',
    collapsedLabel: '展开大纲'
  }
};
```

其余点击代理、`aria-expanded`、`aria-label` 和 Lucide `<use href>` 同步逻辑不变。

- [ ] **Step 5: 运行静态校验确认结构错误已消失**

Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\tests\validate-static.ps1
```

Expected: 完整校验仍因字体交付物缺失而 FAIL。另运行以下定向检查，输出应为空，以确认结构与控制器旧标记已清除：

```powershell
rg -n 'data-sidebar-collapsed|data-collapse-target="sidebar"' index.html app.js
rg -n 'data-collapse-target="notes"' index.html
rg -n '\bsidebar\s*:' app.js
```

第二条命令应只输出文档工具栏中的一个匹配；第一、第三条命令不应输出匹配。

### Task 3: 实现零宽折叠、连续文档区和紧凑列表视觉

**Files:**
- Modify: `styles.css`
- Test: `tests/validate-static.ps1`

**Interfaces:**
- Consumes: Task 2 产出的根节点状态属性和唯一按钮类名。
- Produces: 笔记栏零宽收起、大纲 42px 固定展开入口、无分隔线文档区、无边框浅色标签和紧凑笔记卡片。

- [ ] **Step 1: 删除最侧边栏全部折叠样式**

删除以下规则组：

```css
.workspace[data-sidebar-collapsed="true"] { ... }
.sidebar-header > .panel-collapse-button { ... }
.sidebar:hover .sidebar-header > .panel-collapse-button,
.sidebar-header > .panel-collapse-button:focus-visible { ... }
.workspace[data-sidebar-collapsed="true"] .sidebar { ... }
.workspace[data-sidebar-collapsed="true"] .sidebar-header { ... }
.workspace[data-sidebar-collapsed="true"] .brand,
.workspace[data-sidebar-collapsed="true"] .sidebar-content { ... }
.workspace[data-sidebar-collapsed="true"] .sidebar-header > .panel-collapse-button { ... }
```

同时从 `.workspace` 删除 `--sidebar-current-width`，并直接使用固定侧栏列：

```css
.workspace {
  --notes-current-width: var(--notes-width);
  grid-template-columns: var(--sidebar-width) var(--notes-current-width) minmax(0, 1fr);
}
```

- [ ] **Step 2: 让笔记栏收起后完全消失**

将状态变量改为零宽：

```css
.workspace[data-notes-collapsed="true"] {
  --notes-current-width: 0px;
}
```

删除所有让收起笔记栏保留标题按钮的旧规则，以及隐藏文档工具栏按钮的规则。新增：

```css
.workspace[data-notes-collapsed="true"] .notes-panel {
  overflow: hidden;
  border-right: 0;
  visibility: hidden;
}
```

- [ ] **Step 3: 压缩笔记卡片纵向尺寸**

使用以下目标值替换现有间距：

```css
.note-card {
  padding: 16px 19px 16px 20px;
}

.note-card.selected {
  margin-top: 6px;
  margin-bottom: 7px;
  padding-top: 18px;
  padding-bottom: 18px;
}

.note-card.selected::before {
  top: 17px;
  bottom: 17px;
}

.note-card h2 {
  margin-bottom: 7px;
}

.note-card p {
  line-height: 1.65;
}

.note-meta {
  min-height: 21px;
  margin-top: 9px;
}
```

- [ ] **Step 4: 移除文档区分隔线并减淡标签**

从 `.document-toolbar` 删除 `border-bottom`，从 `.outline` 删除 `border-left`。将标签规则改为：

```css
.document-chip {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 12px;
  border: 0;
  border-radius: 6px 6px 12px 12px;
  background: #f6f9fb;
  box-shadow: none;
}

.document-tag {
  gap: 7px;
  color: #6f9bbd;
  background: #f0f8fe;
}

.add-tag {
  color: #9aa5ae;
  background: #f7f9fb;
}
```

- [ ] **Step 5: 让大纲标题按钮兼任收起与固定展开入口**

删除 `.outline-title` 和 `.outline-header .panel-collapse-button` 的旧交互规则，新增：

```css
.outline-title-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 19px;
  padding: 0;
  border: 0;
  color: #7a8087;
  background: transparent;
  font: inherit;
  font-size: 14px;
  font-weight: 650;
  cursor: pointer;
}

.outline-title-toggle:hover,
.outline-title-toggle:focus-visible {
  color: var(--accent);
}

.outline-title-toggle .icon {
  width: 17px;
  height: 17px;
}

.reading-layout[data-outline-collapsed="true"] .outline-title-toggle {
  width: 34px;
  height: 34px;
  justify-content: center;
  margin: 0;
  border-radius: 8px;
}

.reading-layout[data-outline-collapsed="true"] .outline-title-toggle span,
.reading-layout[data-outline-collapsed="true"] .outline nav {
  display: none;
}
```

保留 `--outline-current-width: 42px`，确保收起后只有固定按钮宽度，正文占据其余空间。

- [ ] **Step 6: 运行校验确认只剩字体资源失败**

在运行校验前，替换当前 `@media (max-width: 1280px)` 中强制隐藏大纲的规则，确保该视口仍可验证大纲折叠：

```css
@media (max-width: 1280px) {
  :root {
    --outline-width: 190px;
  }

  .document-body {
    padding-right: clamp(30px, 4vw, 52px);
    padding-left: clamp(30px, 4vw, 52px);
  }
}
```

删除该媒体查询中原有的单列 `.reading-layout` 和 `.outline { display: none; }`，使展开按钮在 1280px 下仍可操作。

Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\tests\validate-static.ps1
```

Expected: 完整校验仍因缺少本地字体样式、许可证或 WOFF2 分段而 FAIL。使用以下定向检查确认关键 CSS 已存在且旧分隔线规则已删除：

```powershell
rg -n -- '--notes-current-width: 0px|border: 0|outline-title-toggle' styles.css
rg -n 'document-toolbar.*border-bottom|outline.*border-left' styles.css
```

第一条命令应命中新样式；第二条命令不应命中实际规则。

### Task 4: 内置 Noto Sans Simplified Chinese 并完成自动验证

**Files:**
- Modify: `index.html`
- Create: `assets/fonts/noto-sans-sc.css`
- Create: `assets/fonts/files/*.woff2`
- Create: `assets/fonts/LICENSE`
- Modify: `styles.css`
- Test: `tests/validate-static.ps1`

**Interfaces:**
- Consumes: Fontsource 发布的 Noto Sans SC variable WOFF2 包，仅作为构建时下载来源。
- Produces: 页面运行时可直接加载的本地分段字体、Unicode range 样式和 `Noto Sans SC Variable` 字体族。

- [ ] **Step 1: 下载并提取完整的简体中文可变 WOFF2 包**

在项目根目录运行：

```powershell
New-Item -ItemType Directory -Force -Path '.\assets\fonts\files' | Out-Null
$packageArchive = npm pack @fontsource-variable/noto-sans-sc@5.3.0 --silent
tar -xf $packageArchive
Copy-Item -LiteralPath '.\package\index.css' -Destination '.\assets\fonts\noto-sans-sc.css'
Copy-Item -LiteralPath '.\package\LICENSE' -Destination '.\assets\fonts\LICENSE'
Copy-Item -Path '.\package\files\*.woff2' -Destination '.\assets\fonts\files'
$vendoredFonts = @(Get-ChildItem -LiteralPath '.\assets\fonts\files' -Filter '*.woff2')
if ($vendoredFonts.Count -ne 101) { throw "Expected 101 WOFF2 segments, found $($vendoredFonts.Count)." }
Remove-Item -LiteralPath '.\package' -Recurse
Remove-Item -LiteralPath $packageArchive
```

Expected: `assets\fonts\noto-sans-sc.css`、`assets\fonts\LICENSE` 和 101 个非空 WOFF2 文件存在。

- [ ] **Step 2: 注册并启用本地字体**

在 `index.html` 的 `styles.css` 引用之前加入本地字体样式：

```html
<link rel="stylesheet" href="assets/fonts/noto-sans-sc.css">
<link rel="stylesheet" href="styles.css">
```

将 `--font-sans` 改为：

```css
--font-sans: "Noto Sans SC Variable", "Microsoft YaHei UI", "Microsoft YaHei", system-ui, sans-serif;
```

- [ ] **Step 3: 运行完整静态校验确认绿灯**

Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\tests\validate-static.ps1
```

Expected:

```text
Static UI validation passed.
```

### Task 5: 浏览器交互与三档视口视觉验收

**Files:**
- Verify: `index.html`
- Verify: `styles.css`
- Verify: `app.js`
- Verify: `assets/fonts/noto-sans-sc.css`
- Verify: `assets/fonts/files/*.woff2`

**Interfaces:**
- Consumes: Tasks 2–4 完成的静态页面。
- Produces: 三种桌面视口下的展开、单栏收起和双栏收起验收记录。

- [ ] **Step 1: 启动本地静态服务器**

Run:

```powershell
python -m http.server 4173 --bind 127.0.0.1
```

Expected: 页面可从 `http://127.0.0.1:4173/` 打开，控制台无资源加载错误。

- [ ] **Step 2: 验证笔记栏交互**

在浏览器中点击文档工具栏最左侧按钮，确认：

- 笔记栏完全消失，正文区域立即扩展。
- 最侧边栏始终可见且没有折叠按钮。
- 工具栏按钮仍然可见，图标切换为 `panel-left-open`，`aria-expanded="false"`。
- 再次点击可恢复笔记栏，`aria-expanded="true"`。

- [ ] **Step 3: 验证大纲交互**

点击“大纲”左侧图标，确认：

- 大纲标题与目录内容消失，正文扩展。
- 右侧仅保留一个 42px 区域内的固定 Lucide 展开按钮。
- 点击固定按钮后恢复完整大纲。
- 与笔记栏收起状态任意组合时，两者互不覆盖。

- [ ] **Step 4: 检查三档视口和关键视觉**

依次设置 `1920×1080`、`1440×900`、`1280×720`，每档检查默认展开、仅笔记栏收起、仅大纲收起、双栏收起四种状态。确认：

- 文档工具栏下方无横线，大纲与正文之间无竖线。
- 项目和添加标签均为浅色纯填充且没有边框。
- 笔记卡片比上一版紧凑，选中态蓝色竖条和渐变背景保持完整。
- 中文文本使用 `Noto Sans SC Variable`，字体资源来自本地路径。
- 1280px 视口下既有媒体查询不会产生空白占位或不可操作的隐藏按钮。

- [ ] **Step 5: 最终回归校验**

Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\tests\validate-static.ps1
```

Expected:

```text
Static UI validation passed.
```

记录浏览器控制台错误数为 0，并确认未引入业务行为、外部请求或非 Lucide 图标。
