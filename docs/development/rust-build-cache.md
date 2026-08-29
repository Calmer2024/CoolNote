# Rust 构建缓存治理

Rust/Tauri 的构建状态统一放在 `src-tauri/.target/<purpose>`，按用途隔离：

- `perf`：release 性能 gate，共享同一份性能缓存，避免污染日常 debug。
- `test`：测试构建，关闭增量缓存。
- `lint`：clippy/all-targets 构建。
- `release`：发布构建。

使用 `npm` 脚本而不是直接调用 Cargo：

```text
npm run perf:gate
npm run perf:editor
npm run perf:attachments:backend
npm run rust:test
npm run rust:clippy
npm run rust:clean
```

`src-tauri/.target` 已被忽略，不应提交到 Git。定期（例如每周或磁盘占用超过 10 GiB）执行 `npm run rust:clean`。性能 gate 使用 release profile，关闭 debug symbols 和增量编译；开发 profile 仅保留等级 1 调试信息，避免默认生成完整 debuginfo。

发布 CI 将 `CARGO_TARGET_DIR` 指向独立的 release 目录，避免与其他 job 或本机缓存混用。若需要一次性、完全干净的验证，先运行 `npm run rust:clean`。
