# CoolNote Core Slice Mainline Implementation Plan

> **For agentic workers:** 本计划由当前会话内联执行，不派发子代理。

**Goal:** 清理未完成的 Task 8 验收脚手架，将可用的 Task 1–7 核心闭环及必要生产修复合并到 `main`。

**Architecture:** 保持 React + Tauri IPC + Rust + SQLite 架构不变。仅保留真实运行所需代码，不新增 HTTP 服务，不扩大产品范围。

**Tech Stack:** React 19、TypeScript、Vite、Tauri 2、Rust、SQLite、Tiptap。

## Global Constraints

- 不运行测试、构建或打包命令。
- 不提交环境文件、构建产物、依赖目录或测试截图。
- 不删除功能分支或工作树，直至后续运行验证完成。
- 使用精确文件暂存，不使用 `git add .` 或 `git add -A`。

---

### Task 1: 收口生产修复

**Files:**
- Modify: `src-tauri/src/application/recovery_service.rs`
- Modify: `src-tauri/src/commands/notes.rs`
- Modify: `src-tauri/src/domain/note.rs`
- Modify: `src-tauri/src/infrastructure/recovery_store.rs`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/tests/recovery_store.rs`

- [x] 保留 Note 与 NoteSummary 的 camelCase 序列化契约。
- [x] 保留恢复记录 camelCase 输出和旧 snake_case 文件兼容。
- [x] 恢复去重同时比较标题和正文哈希。
- [x] 移除保存命令中的 E2E 故障注入路径。
- [x] 正式配置显式只加载 `main` capability。

### Task 2: 删除未完成验收脚手架

**Files:**
- Delete: `.env.e2e`
- Delete: `scripts/run-desktop-*.mjs`
- Delete: `src-tauri/src/commands/e2e.rs`
- Delete: `src-tauri/tauri.e2e.conf.json`
- Delete: `src-tauri/tests/performance_targets.rs`
- Delete: `src-tauri/tests/runtime_library_root.rs`
- Delete: `tests/e2e/**`
- Delete: `tests/frontend/visual-regression.test.tsx`
- Delete: `wdio.conf.ts`

- [x] 删除所有未跟踪的 Task 8 E2E、视觉、性能和打包验收文件。
- [x] 确认 package 和 Cargo 清单不再包含其依赖或 feature。

### Task 3: 文档与提交

**Files:**
- Create: `README.md`
- Create: `docs/superpowers/specs/2026-08-12-core-slice-mainline-design.md`
- Create: `docs/superpowers/plans/2026-08-12-core-slice-mainline.md`

- [x] 写明 `npm run tauri dev` 是真实前后端开发入口。
- [x] 分组提交生产修复、清理与文档。
- [x] 将功能分支合并到 `main`。
- [x] 仅通过 Git 状态、diff 和配置引用扫描进行静态核对。
