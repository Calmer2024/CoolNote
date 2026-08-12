# CoolNote 核心闭环主线收口设计

## 目标

将已经完成的生产编辑闭环收口到 `main`，确保后续以 Tauri 开发模式继续开发：Vite 提供 React 前端资源，Rust/Tauri IPC 提供 SQLite、保存和恢复能力。

## 保留范围

- Task 1–7 已提交的 Tauri、React、SQLite、Tiptap、自动保存、恢复、主题、键盘导航与无障碍能力。
- Task 8 调试中发现的生产缺陷修复：Note DTO camelCase 契约、恢复记录 camelCase 与旧 snake_case 兼容、标题变化不被错误判为重复恢复记录。
- 正式 Tauri 配置只加载 `main` capability。
- 与上述恢复缺陷直接对应的小型 Rust 回归测试。

## 删除范围

- WDIO、Tauri E2E 插件、E2E capability、故障注入命令和临时库覆盖。
- 桌面多进程编排脚本、视觉截图基线、像素比较和视觉回归测试。
- 10,000 笔记与 5,000 块性能验收测试。
- Task 8 引入但尚未形成稳定交付的打包和发布验收内容。

## 运行边界

- 本阶段的可用开发入口是 `npm run tauri dev`。
- 单独运行 `npm run dev` 只能启动前端资源服务器，不能提供真实 SQLite/Tauri IPC 后端。
- 本次收口不执行测试、构建或打包；运行验证在后续独立步骤进行。

## Git 收口

- 先在 `feature/production-editor-slice` 提交生产修复与清理记录。
- 再将该分支本地合并到 `main`。
- 在未执行验证前，不删除功能分支和隔离工作树。
