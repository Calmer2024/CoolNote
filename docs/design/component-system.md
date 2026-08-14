# CoolNote 组件系统

版本：0.1 · 2026-08-12

## 1. 原则

- 组件表达统一行为，不只是统一外观。
- 业务组件组合基础组件，禁止重复实现菜单、弹窗和焦点逻辑。
- 默认低噪声；Hover、Focus、Selected、Disabled、Loading、Danger 状态明确。
- 桌面优先，支持 100%–300% 缩放、深色模式与减少动画。

## 2. 设计令牌

| 类别 | 令牌                                 | 基准           |
| ---- | ------------------------------------ | -------------- |
| 品牌 | `accent`                             | `#1687E8`      |
| 文字 | `text-primary/secondary/muted`       | 深灰三级       |
| 表面 | `surface/base/raised/hover/selected` | 白与浅灰蓝     |
| 边框 | `border/subtle/strong`               | 1px 中性灰     |
| 圆角 | `radius-6/8/10/14`                   | 控件到面板递增 |
| 间距 | `space-4/8/12/16/24/32`              | 4px 网格       |
| 阴影 | `shadow-popover/dialog`              | 仅浮层使用     |
| 动效 | `motion-fast/base/layout`            | 120/180/220ms  |

## 3. 基础组件

| 组件               | 变体/职责                         | 关键约束                     |
| ------------------ | --------------------------------- | ---------------------------- |
| `Button`           | primary、secondary、ghost、danger | 文字动作；支持 loading       |
| `IconButton`       | ghost、selected、danger           | 必须有 Tooltip/aria-label    |
| `Input`            | default、search、error            | 清除、错误、快捷键提示可组合 |
| `Checkbox`         | unchecked、checked、mixed         | 多选模式使用                 |
| `Tooltip`          | 简短说明、快捷键                  | 延迟出现，不承载操作         |
| `Divider`          | horizontal、vertical              | 只表达结构，不做装饰         |
| `Spinner/Progress` | 不确定、确定进度                  | 上传与后台任务               |

## 4. 浮层组件

| 组件          | 用途           | 行为                           |
| ------------- | -------------- | ------------------------------ |
| `Menu`        | 普通动作列表   | 统一 224px 几何基准、键盘导航、分组、快捷键、危险项 |
| `ContextMenu` | 右键对象操作   | 与 Menu 共享行高/圆角/间距，锚定指针并自动避让边缘 |
| `Popover`     | 小型编辑与选择 | 锚定触发点，点击外部关闭       |
| `Combobox`    | 可搜索选择     | 替代复杂原生 Select            |
| `CommandMenu` | `/`、全局命令  | 搜索、分组、最近使用、空状态   |
| `Dialog`      | 阻断式任务     | 焦点锁定、标题、正文、主次动作 |
| `Toast`       | 非阻断反馈     | 自动关闭；撤销类保留 5–8 秒    |

层级：内容 `0` < 固定栏 `10` < Popover/Menu `30` < Toast `40` < Dialog `50`。

## 5. 编辑器组件

| 组件                | 触发          | 内容                               |
| ------------------- | ------------- | ---------------------------------- |
| `SelectionToolbar`  | 文本选区      | 文本样式、链接、更多               |
| `SlashMenu`         | 空块输入 `/`  | 文本、列表、表格、图片、附件、公式 |
| `BlockHandle`       | Hover 当前块  | 添加、拖拽、块菜单                 |
| `LinkPopover`       | 创建/点击链接 | 地址、打开、复制、移除             |
| `UploadPlaceholder` | 粘贴/拖入文件 | 文件名、进度、取消、重试           |
| `SaveIndicator`     | 保存状态变化  | 保存中、已保存、失败               |

## 6. 笔记管理组件

| 组件              | 组成                                       | 行为                           |
| ----------------- | ------------------------------------------ | ------------------------------ |
| `NoteRow`         | Checkbox、标题、摘要、元信息、HoverActions | 默认精简；Hover/选择时显示操作 |
| `NoteContextMenu` | 置顶、收藏、移动、归档、删除               | 与单篇笔记绑定                 |
| `SelectionBar`    | 数量、全选、收藏、置顶、移动、归档、更多、取消 | 取代列表标题栏；全选作用于当前已加载列表，不进入编辑器 |
| `TreeItem`        | 展开、图标、名称、数量、HoverActions       | 分类树与标签列表复用           |
| `FilterPopover`   | 条件、已选项、清除                         | 显示活跃条件数量               |
| `SortMenu`        | 字段、方向                                 | 菜单单选项，不使用裸 Select    |
| `JottingTree`     | 文件夹、Markdown 文件、原地输入、折叠控制 | 复现文件资源管理树基础行为     |
| `JottingCover`    | 当前封面、内置图库、上传入口               | 内置选择使用 Popover，上传使用系统文件选择器 |
| `JottingMarkdown` | 标题、正文、媒体、表格、高亮块             | 使用 Noto Serif SC，独立于工作笔记主题 |

## 7. API 与状态约束

- 受控状态优先：`open/onOpenChange`、`value/onValueChange`。
- 组件只发出语义事件，例如 `onArchive`，不暴露 DOM 细节。
- 异步动作统一接受 `pending/error`，禁止组件内部静默吞错。
- Menu/Dialog 统一管理焦点恢复、`Esc`、点击外部和滚动锁定。
- 危险动作必须显式标记 `danger`，不可只靠颜色区分。

## 8. 动效规范

- `Menu/Popover`：`opacity 0→1`、`translateY 4px→0`。
- `SelectionBar`：原位淡入并轻微下移，不推动编辑器布局。
- `NoteRow` 操作：Hover 淡入，不改变文字宽度。
- Toast：从右下方进入；撤销后原位置恢复。
- 禁止弹跳、长距离滑动和持续循环动画。

## 9. 实现边界

- 可基于 Radix primitives 或等价无样式基础设施实现，视觉必须由 CoolNote tokens 控制。
- 系统文件选择器可使用原生能力；应用内菜单、选择、确认、输入不得回退到浏览器原生弹窗。
- Lucide 仅作为图标来源，图标尺寸和颜色由组件控制。
- 禁止使用 Unicode 字符或 Emoji 充当图标；缺失图标必须先加入统一图标库。

## 10. 验收

- 基础组件在浅色/深色、键盘、禁用、加载和错误状态下表现一致。
- 所有浮层具有边缘避让、焦点管理与 `Esc` 关闭。
- 业务页面不再出现 `prompt`、`confirm`、裸 `select`。
- 同一动作在 NoteRow、ContextMenu、SelectionBar 中语义和图标一致。
- 动效在减少动画模式下可关闭。
