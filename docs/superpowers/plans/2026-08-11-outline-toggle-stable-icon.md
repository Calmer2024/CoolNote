# 大纲折叠按钮图标与位置稳定 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让大纲折叠前后始终显示同一个 `list-tree` 图标，并保持按钮屏幕坐标不变。

**Architecture:** 保留现有通用面板控制器，通过让大纲按钮的展开、折叠图标数据相同来稳定图标。CSS 折叠态只隐藏文字和目录，不再覆盖大纲容器及按钮的定位属性。

**Tech Stack:** HTML5、CSS、原生 JavaScript、PowerShell 静态校验、应用内浏览器。

## Global Constraints

- 只修改大纲折叠按钮的图标与折叠态定位。
- 图标必须继续使用本地 Lucide `list-tree`。
- 大纲折叠宽度保持 42px。
- 不修改其他面板、正文、字体或业务行为。
- 当前目录不是 Git 仓库，不执行 commit。

---

### Task 1: 添加失败的静态契约

**Files:**
- Modify: `tests/validate-static.ps1`
- Test: `tests/validate-static.ps1`

**Interfaces:**
- Consumes: 大纲按钮 HTML 和折叠态 CSS。
- Produces: 相同图标与稳定定位的自动断言。

- [ ] **Step 1: 添加图标和定位断言**

在现有大纲控制入口断言后加入：

```powershell
if ($html -notmatch 'data-collapse-target="outline"[^>]*data-expanded-icon="list-tree"[^>]*data-collapsed-icon="list-tree"') {
    throw 'The outline toggle does not keep the list-tree icon in both states.'
}

if ($css -match '\[data-outline-collapsed="true"\]\s+\.outline\s*\{[^}]*(align-items|justify-content|padding)\s*:') {
    throw 'Collapsed outline CSS still changes the toggle position.'
}

if ($css -match '\[data-outline-collapsed="true"\]\s+\.outline-header\s*\{[^}]*justify-content\s*:') {
    throw 'Collapsed outline header still changes horizontal alignment.'
}
```

- [ ] **Step 2: 验证红灯**

Run:

```powershell
pwsh -NoProfile -File .\tests\validate-static.ps1
```

Expected: FAIL，提示大纲折叠态没有保持 `list-tree` 图标，或折叠态 CSS 仍改变按钮位置。

### Task 2: 稳定图标与位置

**Files:**
- Modify: `index.html`
- Modify: `styles.css`
- Test: `tests/validate-static.ps1`

**Interfaces:**
- Consumes: Task 1 的静态契约。
- Produces: 折叠前后相同图标和相同按钮坐标。

- [ ] **Step 1: 保持图标不变**

将大纲按钮改为：

```html
data-expanded-icon="list-tree" data-collapsed-icon="list-tree"
```

- [ ] **Step 2: 删除折叠态定位覆盖**

删除 `.reading-layout[data-outline-collapsed="true"] .outline` 中的 `display`、`align-items`、`justify-content` 和折叠态 `padding` 覆盖，让它继续使用展开态的 `padding: 150px 20px 42px 23px`。

删除以下规则：

```css
.reading-layout[data-outline-collapsed="true"] .outline-header {
  justify-content: center;
}
```

将折叠态按钮规则缩减为只保留点击区域与文字隐藏所需属性，不设置 `margin` 或额外对齐：

```css
.reading-layout[data-outline-collapsed="true"] .outline-title-toggle {
  width: 34px;
  height: 34px;
  border-radius: 8px;
}
```

- [ ] **Step 3: 验证绿灯**

Run:

```powershell
pwsh -NoProfile -File .\tests\validate-static.ps1
node --check .\app.js
```

Expected: `Static UI validation passed.`，JavaScript 语法检查退出码为 0。

### Task 3: 浏览器坐标验收

**Files:**
- Verify: `index.html`
- Verify: `styles.css`

**Interfaces:**
- Consumes: Task 2 的页面实现。
- Produces: 折叠前后按钮坐标误差不超过 1px 的实测结果。

- [ ] **Step 1: 刷新本地预览并记录展开态**

在 1440×900 视口刷新页面，读取大纲按钮的 `getBoundingClientRect()`、图标 `href` 和大纲宽度。

Expected: 图标为 `assets/lucide-icons.svg#list-tree`，大纲宽度为 220px。

- [ ] **Step 2: 点击折叠并记录折叠态**

点击大纲图标并在页面完成绘制后再次读取相同数据。

Expected:

- 图标仍为 `assets/lucide-icons.svg#list-tree`。
- 大纲宽度为 42px。
- 按钮 `top` 与 `left` 相对折叠前的差值均不超过 1px。
- “大纲”文字与目录内容隐藏。

- [ ] **Step 3: 展开并完成回归**

再次点击按钮，确认大纲恢复到 220px 且按钮可访问状态恢复。最后运行：

```powershell
pwsh -NoProfile -File .\tests\validate-static.ps1
```

Expected: `Static UI validation passed.`，浏览器控制台 0 个错误。
