# CoolNote 性能调查报告

后续修复及复测结果见 [性能修复记录](AFTER.md)。下文保留修复前的调查结论。

调查日期：2026-10-15。对象：当前工作区，版本号 1.0.20，包含尚未提交的页面记忆、表格和置顶改动。此次只增加审计工具与报告，没有修改产品实现，也没有操作真实笔记库。

结论：普通笔记的数据读取和直接插字较快；已经复现的主要瓶颈是大文档恢复文件写入、分类列表查询和累计加载后的列表渲染。全局搜索存在明显的查询选择性问题。现有性能门禁不能代表桌面整体体验，其中一个门禁当前甚至无法运行到测量阶段。

## 测量口径

- Windows，Intel Core Ultra 9 275HX，24 个逻辑处理器，31.4 GiB 物理内存。这是高性能机器，不能外推到低配设备。
- 后端为 Rust release 构建、真实 SQLite 和临时磁盘文件。每项 SQL、普通读写与恢复文件对照采样 30 次；长文档完整保存/读取为两次独立运行，不能称为 P95。
- 大库使用 100,000 篇合成笔记，每篇 10 个段落，共 1,000,000 块；另有迁移自动创建的内置欢迎笔记。合成笔记均在同一分类，属于大分类场景；plain_text 是较短的英文检索文本，不能代表富媒体真实资料库。
- 浏览器用真实 NoteEditor / NotesPanel 及产品样式，单独 Vite **production build**，本机 Chromium 155。两轮独立加载；每档插字 30 次，列表选中更新 20 次。无开发模式和 React StrictMode 双执行。
- 编辑器数据分别为 100 / 1,000 / 5,000 个普通段落，每段约 96 个字符；5,000 段约 48 万字符，是压力用例，超过单篇 10 万字的目标，但在 5,000 块目标内。后端长文档另测单段 10 万汉字及 5,000 个短段落。
- 插字数字是 Tiptap 命令同步执行耗时，**不是**真实键盘/中文输入法到屏幕的端到端延迟；两帧等待也不能等同于 INP。浏览器组件测试没有包括 Tauri IPC、WebView2 和窗口初始化。
- 浏览器装载耗时每档每轮一次，包含 React 生命周期、两帧及部分上一组件卸载，不是打开笔记 P95。列表选中更新采用 flushSync，可隔离同步渲染成本；真实交互还要加上保存、加载正文等成本。
- 项目规格目标包括普通笔记切换 P95 100ms、长笔记 500ms、输入 16ms、自动保存提交 100ms、全文搜索 200ms、冷启动可操作 2.5s、普通编辑内存 600MB。原有后端 gate 的保存阈值放宽到 150/750ms，不等于产品目标。

## 已复现问题与优先级

### P1：大文档保存主要消耗在无缓冲的恢复文件写入

`RecoveryStore::put` 将 `serde_json::to_writer` 直接写入临时 File。序列化产生大量细小写入，之后还有 sync_all 和原子文件替换。`SaveService::save_note` 必须等待这一步结束，因此会影响自动保存以及切换笔记前的 flush。

| 测试 | 结果 |
|---|---:|
| 完整保存 5,000 短段落，独立两次 | 671.64 / 686.19ms |
| 5,000 块恢复记录，原实现 P95，首轮/复测 | 721.02 / 734.28ms |
| 相同记录、相同 sync_all/文件替换，仅增加 BufWriter，P95 | 6.98 / 6.86ms |
| 1,000 块恢复记录，原实现/缓冲对照 P95，复测 | 83.16 / 4.37ms |

这是因果证据最强、预期收益最高的优化点。上述约 100 倍差异针对恢复写入阶段，不能宣传为整个应用或完整保存提速 100 倍。测试保持耐久化步骤，建议先引入有界缓冲，再验证崩溃恢复、磁盘满和切换保存行为，不能通过取消 sync_all 换速度。

定位：`src-tauri/src/infrastructure/recovery_store.rs:65`、`src-tauri/src/application/save_service.rs:123`、`src/app/App.tsx:50`。

### P1：置顶排序表达式破坏索引排序，分类查询扫描成本明显

真实 `WorkspaceService::list_notes` 在 10 万篇库的复测：全部列表 P95 **34.88ms**，指定大分类 P95 **393.61ms**。它包含 COUNT 和分页查询；门禁列表阈值是 100ms。前端切分类还人为等待 180ms，随后才发出请求。

EXPLAIN 证实，当前 `ORDER BY CASE WHEN n.deleted_at IS NULL THEN n.is_pinned ELSE 0 END` 产生 `USE TEMP B-TREE FOR ORDER BY`，无法直接利用刚建立的置顶联合索引完成排序。在正常未删除视图，单变量对照改为 `ORDER BY n.is_pinned` 后，SQL 探针 P95 从 **21.73ms** 降到 **0.03ms**。这个对照仅测同投影的第一页 SQL，**不包含 COUNT，也不是完整分类查询改进后的时间**。

分类条件采用 `(?1 IS NULL OR n.category_id=?1)`；本次计划只用到 active 索引的删除/归档前缀，没有按分类定位。已有分类索引也未被这条查询利用。COUNT 和分页都会付出额外扫描成本。

建议按视图生成明确的排序表达式，按有无分类/搜索生成明确 WHERE，实测索引组合及总数统计成本；把分类/排序的即时交互与文本搜索防抖分开。暂不需要替换 SQLite。

定位：`src-tauri/src/application/workspace_service.rs:142`、`:155`、`src/features/notes/useNotes.ts:176`。

### P1：列表分页只限制取数，没有限制累计 DOM 与重渲染

`loadMore` 持续拼接已有 notes；NotesPanel 每次对全量数据排序、map，逐条构造 Intl.DateTimeFormat，逐条查找分类，没有虚拟滚动或行级渲染隔离。

| 已加载行数 | 选中更新 P95，两轮 | 装载耗时，两轮 |
|---:|---:|---:|
| 80 | 4.7 / 5.1ms | 87.7 / 67.1ms |
| 1,000 | 55.4 / 53.4ms | 301.7 / 268.9ms |
| 5,000 | 268.0 / 263.7ms | 1,745.3 / 1,518.2ms |

实际 DOM 行数等于已加载行数。用户滚动加载越多，选中、保存状态更新等导致的列表重渲染越慢。5,000 条需要累计加载约 63 页，并非初次打开就加载 5,000 条；1,000 条约 13 页，也已出现明显同步成本。

建议优先虚拟列表，其次稳定 props/回调、缓存行组件和日期格式器、建立分类 Map。追加分页去重也应从 `current.some` 改为 ID Set。不要只增加分页大小。

定位：`src/features/notes/NotesPanel.tsx:21`、`:60`、`:66`、`src/features/notes/useNotes.ts:217`。

### P1：全局搜索对罕见词/无结果查询退化，且会与保存争抢数据库连接

顶部搜索调用 `global_search`，笔记部分实际使用 `%query%` 的 title/plain_text LIKE，而非 notes_fts。10 万篇短文本库中，仅笔记 SQL 的无匹配查询 P95 **202.30ms**；高命中词第一页则约 **0.03ms**。说明“随手搜一个常见词很快”不能验证搜索性能。真实命令还会继续查小记、任务、画廊，前端另有 160ms 防抖。

SQLite EXPLAIN 显示按 deleted_at 的索引扫描，而不是全文索引命中。所有读写共享一个 Mutex<Connection>，慢搜索占用连接时，打开笔记和写数据库可能排队。前端 active 标记只忽略旧结果，不会取消已经发出的后端工作。这部分排队放大效应是代码确认的风险，未作为整机并发延迟实测。

不能简单把 LIKE 换成现有 FTS 就结束：高命中 FTS 加更新时间排序探针本身 P95 **196.53ms**；unicode61 的分词匹配也不等价于中文子串搜索。建议定义中文检索语义，分别测试标题/正文、罕见词/高命中词/无结果，优化索引与排序，并加入过期请求的后端合并或取消。

定位：`src-tauri/src/application/workspace_service.rs:400`、`src-tauri/src/infrastructure/database.rs:220`、`src/app/App.tsx:65`。

### P2：长文档仍存在整篇同步处理，但没有复现普通插字慢

| 文档块数 | 直接插字 P95，两轮 | JSON→normalize→Markdown P95，两轮 |
|---:|---:|---:|
| 100 | 1.1 / 0.7ms | 0.5 / 0.4ms |
| 1,000 | 1.1 / 1.8ms | 4.7 / 4.3ms |
| 5,000 | 4.7 / 5.4ms | 20.0 / 17.8ms |

250ms 防抖和 idle 调度避免了每键序列化，但并未将整篇工作移出主线程或分片；切换前 flush 还会同步执行。5,000 段压力数据的单次序列化已超过 16ms 帧预算。编辑器全部段落进入 DOM，装载测得 366.6–414.9ms，留给 IPC、读取和其他 UI 的余量不多，但不能直接认定桌面长文档切换超标。

已排除一条怀疑：normalizedDocument 按 note.id memo，连续输入及父级接收草稿后，没有发生整篇 replace，计数为 0。不要为不存在的“每次保存 setContent 全文重置”做优化。

另外字数显示每次渲染调用 getText 全文遍历，ImageGalleryLayout 每次 docChanged 扫描顶层节点；是后续增量化候选，尚未单独量化其贡献。小记 onUpdate 同步 getHTML + getJSON 的路径比笔记更重，需专项测试。

### P1（验收基础设施）：原有性能 gate 当前失效且指标覆盖不完整

原样运行 `npm run perf:gate`，release 编译后直接报 `UNIQUE constraint failed: categories.id`。当前迁移自动创建了内置分类，旧夹具再次 INSERT，尚未进入计时。独立 audit 示例只对夹具做 INSERT OR IGNORE 以继续测量，原门禁未被修改。

`check:editor-performance` 主要检查源代码是否包含特定调用或字符串，没有运行交互计时。附件测试使用 jsdom、假 IntersectionObserver，不测实际图片解码/浏览器布局。后端 editor gate 是各一次采样，750ms 保存阈值远宽于规格 100ms；本次 686ms 保存会通过旧门禁，却明显达不到规格期望。

建议先恢复可运行的门禁，再增加真实 WebView2 的启动可操作、打开笔记、中文输入、切换前保存、长任务、内存与空闲 CPU 测量。性能回归标准应与产品规格一致，并规定数据集、冷/热缓存和硬件档位。

## 代码确认的容量风险，尚未量化

- 启动主 JS 现有产物为 **2,630,586 bytes（约 2.51 MiB）**；App 静态导入全部工作区和导出模块，export 静态导入 jsPDF/html-to-image，代码高亮一次注册 lowlight(all)。这是启动解析与初始化负担的候选，尚无足够数据把冷启动慢归因于它。Mermaid 自身已有动态导入，不能笼统说所有大库都首屏加载。
- 小记 snapshot 一次返回所有小记及完整正文；任务 snapshot 一次返回全部任务/子任务，没有分页。任务每行 filter 全部子任务，存在任务数×子任务数的扫描成本，日历也在客户端处理全集。
- 每次有效保存插入完整 Markdown 版本，未找到保留上限或压缩清理策略。以单篇约 300KB 文本、1,000 个版本估算，仅历史快照正文就约 300MB（估算，未做增长实测）。不能随意删除历史，应先定义保留策略。

## 本次没有下结论的指标

冷启动/热启动到可操作的 P95、真实 WebView2 中文输入法延迟、整机空闲 CPU、应用所有 WebView2 子进程的总内存、长时间泄漏、真实附件解码、真实任务月历性能未可靠测量。浏览器组件与 Rust 服务测量不能替代这些指标，也不能据此声称它们已经达标或存在内存泄漏。

建议实施顺序：恢复文件缓冲 → 修复列表 SQL/分类防抖 → 列表虚拟化 → 搜索索引与请求治理 → 长文档增量处理与工作区按需加载。恢复门禁和补桌面观测应伴随以上工作进行。

## 证据与复现

- `backend-run.txt`：第二轮 Rust 大库查询计划、30 次统计及服务调用结果。
- `editor-backend-run.txt`：第二轮长文档后端保存/读取；第一轮结果见上文。
- `recovery-run.txt`：第二轮相同耐久化步骤的恢复写入 A/B，每档各 30 次。
- `browser-run-1.json` / `browser-run-2.json`：两轮生产构建组件测量。

PowerShell，在仓库根目录运行。全部夹具均为合成数据；Rust 临时库退出后自动清理。

```powershell
$env:CARGO_TARGET_DIR="$PWD/src-tauri/.target/perf"
cargo run --manifest-path src-tauri/Cargo.toml --release --example performance_audit
cargo run --manifest-path src-tauri/Cargo.toml --release --example editor_performance_audit
cargo run --manifest-path src-tauri/Cargo.toml --release --example recovery_performance_audit
npx vite build scripts/perf-audit --config scripts/perf-audit/vite.config.ts
npx vite preview scripts/perf-audit --config scripts/perf-audit/vite.config.ts --host 127.0.0.1 --port 4174
```

最后打开 http://127.0.0.1:4174/，页面自动运行并显示 JSON，直到 status 为 complete。生成目录 `.perf-audit-dist` 仅为本地构建输出，不应提交。SQL 对照仅是候选优化验证；没有把它应用到产品代码。
