# Task 6 自动保存、flush 与恢复 UI 报告

状态：DONE_WITH_CONCERNS

## RED 证据

- 命令：`npm test -- tests/frontend/save-coordinator.test.ts tests/frontend/save-status.test.tsx tests/frontend/recovery-ui.test.tsx`
  - 结果：退出码 1；保存协调器/状态组件模块尚不存在，恢复 UI 中无法找到“恢复草稿”按钮和“发现恢复草稿冲突”对话框。这是预期的功能缺失失败。
- 命令：`cargo test --manifest-path src-tauri/Cargo.toml --test recovery_command`
  - 结果：退出码 1；`list_recovery_candidates_for_services` 和 `resolve_recovery_for_services` 尚未实现，测试无法导入。这是预期的命令可测边界缺失失败。

## GREEN / 全量验证

- `npm test -- tests/frontend/save-coordinator.test.ts tests/frontend/save-status.test.tsx tests/frontend/recovery-ui.test.tsx`：3 个文件、5 项通过。
- `cargo test --manifest-path src-tauri/Cargo.toml --test recovery_command`：1 项通过。
- `npm test`：9 个文件、22 项通过。
- `npm run build`：通过。
- `cargo fmt --manifest-path src-tauri/Cargo.toml --check`：通过。
- `git diff --check`：通过。

## 提交

- `4169a0852898f95ac5a551e03e2c938abbacb51e` `feat：接入自动保存与草稿恢复交互`
- `d4fecce3589e21f5c374514509c1abadbe0e3ba6` `test：覆盖保存队列与恢复命令`

## 自审

- 保存协调器只允许一个在途请求，保留最新待存快照；在途保存成功后会将相同笔记的待存快照更新到新 revision。
- 每次传输都生成 transaction UUID；失败保留待存快照和重试计数。切换笔记、新建笔记及 Tauri 关闭均会先 flush；不支持文档会阻止离开。
- 恢复草稿先读取当前数据库版本，再以该 revision 交由正常保存协调器延后保存；冲突只显示选择，不会自动覆盖。
- Rust 命令保持重复恢复记录在到达 UI 前清理；UI 按队列逐条处理非重复候选。
- 未新增 SQL、filesystem、Shell 权限、LocalStorage 笔记数据或演示数组。

## 剩余顾虑

- `npm run build` 仍输出既有的 Vite chunk-size 非阻断警告（主 JS 压缩后约 626 kB）；本任务没有扩大拆包范围，因此未处理。

---

## Fix round 1（2026-08-11）

状态：DONE_WITH_CONCERNS

### 根因与 RED 证据

- 恢复草稿分支没有调用 `flushBeforeLeaving`，全局保存协调器的单一 pending 槽可被恢复笔记覆盖。
- 保存协调器把“不是 unsupported_document”误判为恢复安全；RecoveryStore 写入失败实际没有可靠草稿文件。
- `applyRecoveredDraft` 没有递增选择 token，因此旧 `getNote` 请求可以回写恢复后的界面。
- Tauri 关闭监听注册失败被忽略。
- 命令：`npm test -- tests/frontend/save-coordinator.test.ts tests/frontend/save-status.test.tsx tests/frontend/recovery-ui.test.tsx`
  - RED：unsafe `recovery_write_failed` 返回了 `recoverySafeFailure`；未保护失败显示“草稿已保留”；恢复 B 前没有发送 A；旧加载覆盖恢复草稿；关闭仍继续；注册失败没有错误提示。
- 命令：`cargo test --manifest-path src-tauri/Cargo.toml --test save_service`
  - RED：`CommandError::from_save` 尚不存在，无法把恢复写入失败映射为明确的不安全结果。

### 修复与 GREEN 验证

- SaveService 将 `RecoveryStore::put` 失败封装为 `RecoveryWriteFailed`；Tauri 保存错误新增 camelCase `recoverySafe`，只有 SaveService 已明确通过恢复写入之后的失败才标记为 true。
- 前端仅接受显式 `recoverySafe: true`；否则保留待存快照、保留 retry 元数据、阻止切换/关闭，且不显示“草稿已保留”。
- 恢复前先 flush 当前笔记；`applyRecoveredDraft` 会使旧选择请求失效；关闭监听注册失败进入现有错误提示。
- `npm test -- tests/frontend/save-coordinator.test.ts tests/frontend/save-status.test.tsx tests/frontend/recovery-ui.test.tsx tests/frontend/notes-ui.test.tsx`：4 个文件、18 项通过。
- `cargo test --manifest-path src-tauri/Cargo.toml --test save_service --test recovery_command`：4 项通过。
- `npm test`：9 个文件、29 项通过。
- `npm run build`：通过。
- `cargo fmt --manifest-path src-tauri/Cargo.toml --check`：通过。
- `cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings`：通过。
- `git diff --check`：通过。

### 新提交

- `374bc6b18ddbd1b993423a4078c4791c3c305bc2` `fix：收紧保存恢复安全契约`
- `1eab4e655b07b5708ce186e4faa4d52131d9e576` `test：补齐保存恢复安全回归`

### 剩余顾虑

- 仍仅有 Vite 主包 chunk-size 的非阻断警告（约 626 kB）；本修复轮未扩大拆包范围。

---

## Fix round 2（2026-08-11）

状态：DONE_WITH_CONCERNS

### 修复与验证

- `SaveStatus` 对 `state="failed"` 且 `recoverySafeFailure=false` 返回空文案；保留恢复安全失败文案及 `aria-live="polite"` 行为。
- `npm test -- tests/frontend/save-status.test.tsx`：2 项通过、1 项失败。失败来自测试第 16 行仍调用 `screen.getByText('保存失败')` 后再断言 `.not.toBeInTheDocument()`；生产组件已正确渲染空 `.save-status`，该断言会在 matcher 前抛出找不到元素异常。
- `npm test -- tests/frontend/save-coordinator.test.ts tests/frontend/save-status.test.tsx tests/frontend/recovery-ui.test.tsx tests/frontend/notes-ui.test.tsx`：17 项通过、1 项失败；唯一失败同上测试断言问题。
- `git diff --check`：通过。

### 提交

- `f879a64c5f76f4da51334953611872237ae26ae7` `修复未受保护失败状态文案`

### 剩余顾虑

- 测试应将 `screen.getByText('保存失败')` 改为 `screen.queryByText('保存失败')` 才能验证“不存在”；本轮按要求未修改测试文件，故指定测试命令仍报告 1 项断言失败。
