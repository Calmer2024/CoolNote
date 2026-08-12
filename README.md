# CoolNote

CoolNote 是一个本地优先的 Tauri 2 桌面笔记应用。当前可用版本由 React + TypeScript 前端、Rust/Tauri IPC 后端和 SQLite 本地数据库组成。

## 当前可用能力

- 创建、分页加载和编辑真实笔记。
- Tiptap 富文本基础节点与稳定块 ID。
- 实时大纲和标题定位。
- 300ms 防抖自动保存与串行保存队列。
- SQLite revision 冲突保护。
- 保存前恢复日志、异常草稿恢复和冲突选择。
- 浅色、深色和跟随系统主题。
- 笔记列表键盘导航和基础无障碍支持。

## 开发运行

安装 Node.js 20+、Rust stable 和 Windows Tauri 开发依赖后执行：

```powershell
npm install
npm run tauri dev
```

`npm run tauri dev` 会启动 Vite 前端资源服务器，并运行真实的 Tauri/Rust/SQLite 后端。这是当前完整前后端开发入口。

单独执行：

```powershell
npm run dev
```

只会启动浏览器前端资源服务器。普通浏览器没有 Tauri IPC，因此不能创建或保存真实笔记。

## 数据位置

应用数据位于操作系统分配的 CoolNote 应用数据目录，默认笔记库包含：

- `coolnote.db`：SQLite 数据库。
- `library.json`：笔记库配置。
- `recovery/`：未确认保存事务的恢复记录。
- `attachments/`：后续附件能力的目录占位。

## 当前范围

当前主线聚焦于可靠的本地编辑闭环。搜索、完整分类与标签、附件、任务与日历、版本历史、备份、导入导出和发布打包仍属于后续里程碑。

桌面 E2E、视觉像素回归和大容量性能门禁已从当前主线移除，待核心功能稳定后作为独立里程碑重新设计。
