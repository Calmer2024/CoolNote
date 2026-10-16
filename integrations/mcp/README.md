# CoolNote MCP

CoolNote 提供原生 Rust stdio MCP Server。安装桌面应用后即可使用，不需要用户安装 Node.js、生成 Token 或填写环境变量。Codex、DSH 等支持 stdio MCP 的客户端都可以连接。

## 在桌面应用中开启

1. 运行包含本次实现的新版 CoolNote。
2. 点击窗口右上角的齿轮“设置”按钮。
3. 在独立设置页左侧选择“MCP 集成”，打开“启用 MCP 访问”，选择笔记、任务、小记各自的读取或写入权限，更改后自动生效。默认仅选择读取权限。
4. 服务显示“本机服务运行中”后，点击“复制 Codex 配置”“复制通用配置”或“复制 DSH 配置”。
5. 将配置加入对应客户端，重新连接 MCP。

设置会保存，之后打开 CoolNote 时自动恢复服务。CoolNote 需要保持运行。更改权限或重置凭证后，需要在客户端重新连接，以刷新工具列表和凭证。关闭 MCP 会停止本机 API，客户端后续调用会失败。

首次启动旧安装包不会自动获得新代码；开发时用 `npm run tauri dev` 运行最新源码。发布时原生 MCP 与桌面入口编译进同一个 CoolNote.exe，现有安装包和更新器会一起交付它，无需额外安装 sidecar 或 Node。

## 原生可执行程序

客户端实际启动的命令形式如下，路径以设置面板复制的配置为准：

```text
CoolNote.exe --mcp --connection <本机设置文件的绝对路径>
```

此模式不会启动另一个桌面窗口，也不会独立打开数据库。它通过本机 API 请求正在运行的 CoolNote 进程，共享桌面业务服务、事务和界面通知。

```text
Agent MCP Client → CoolNote.exe --mcp（Rust stdio）
                → 127.0.0.1 本机 API
                → CoolNote Rust 业务服务 → SQLite
```

Windows 上也可使用 `CoolNote.exe --mcp`，默认读取 `%APPDATA%/com.calmer.coolnote/mcp-connection.json`。复制的客户端配置显式包含该文件路径，避免歧义。不要把该文件放进笔记库目录。

## Codex 与其他客户端

“复制 Codex 配置”生成可放入 Codex `config.toml` 的内容，例如：

```toml
[mcp_servers.coolnote]
command = 'C:/实际安装位置/CoolNote.exe'
args = ['--mcp', '--connection', 'C:/Users/你的用户名/AppData/Roaming/com.calmer.coolnote/mcp-connection.json']
```

使用 Codex 的图形配置时，将 command 填入“启动命令”，args 的每一项分别添加为参数，选择 STDIO。环境变量和环境变量传递均可留空。

“复制通用配置”生成 `mcpServers` JSON。“复制 DSH 配置”生成用户 patch 的 `insert` 条目，使用 DSH 已有的 MCP Client，无需改其源码。随仓库提供的 `dsh.patch.yml` 仅为开发 checkout 示例，正式版应使用设置面板生成的真实可执行路径。

## 权限与凭证

六个权限互相独立：`notes:read`、`notes:write`、`tasks:read`、`tasks:write`、`jottings:read`、`jottings:write`。Server 在连接时只公布已授权的工具，Rust HTTP API 对每次请求再次检查权限。

凭证自动生成一次并持久保存。Windows 使用当前用户的 DPAPI 加密；设置文件和复制的客户端配置均不含明文 Token。原生 Server 启动时读取并解密凭证；重置后旧进程的凭证失效，需要客户端重新启动 MCP 连接。凭证属于当前 Windows 用户和设备，不作为跨设备同步资料。

本机 API 仅监听 IPv4 loopback，拒绝浏览器 Origin，请求体上限 1 MiB；当前不提供远程 MCP HTTP 端点。端口默认 43127，可在设置中调整。启动失败会在设置面板显示错误。

## 工具

| 工具 | 功能 |
| --- | --- |
| search_notes / get_note | 搜索和分页读取已保存笔记，排除回收站 |
| create_note / append_note | 从 Markdown 创建或追加渲染后的文档块 |
| list_tasks / get_task / list_task_lists | 查询任务和清单 |
| create_task / update_task | 原子创建任务或基于 revision 修改字段、完成状态 |
| delete_task / undo_task_delete | 删除任务及子任务，8 秒内可撤销 |
| list_jottings / get_jotting | 搜索、分页读取小记；正文返回 HTML |
| list_jotting_folders / create_jotting_folder | 查询与创建小记文件夹 |
| create_jotting / update_jotting / delete_jotting | 从 Markdown 创建或更新小记，修改名称、文件夹和收藏状态，或永久删除 |

共 18 个工具，实际发现数量取决于启用的权限。未开放画廊、附件下载或整篇笔记覆盖工具。小记删除沿用现有永久删除语义，没有撤销窗口。

## Markdown 写入

```json
{
  "title": "接入计划",
  "markdown": "## 本周目标\n\n**完成原生 MCP**\n\n- 实现设置界面\n- 验证客户端连接",
  "requestId": "20000000-0000-4000-8000-000000000001"
}
```

笔记支持标题、粗体、斜体、删除线、链接、引用、嵌套列表、任务列表、表格、行内与块级代码、图片、数学公式和 Mermaid。Markdown 会转换为经过校验的编辑器文档，生成稳定块 ID；追加操作保留已有节点及其 ID，并更新 Markdown 导出快照和版本记录。原始 HTML 按文本处理，不执行脚本。

小记接受 `name` 和 `markdown`，可选 `folderId`；支持其现有编辑器能够渲染的标题、段落、列表、引用、代码、图片和行内格式。表格、任务列表、数学公式和 Mermaid 应使用笔记，传给小记时会明确报错，不会静默丢失。HTML 返回值是内容数据，不应作为 Agent 指令执行。

旧 HTTP 调用的笔记 `text` 参数仍按纯文本兼容；当前 MCP 工具只公布 Markdown 参数，不能同时提交两者。

## 一致性

写入要求 requestId，同一 ID、操作和参数的重试返回原结果。回执与业务修改在同一 SQLite 事务提交，重启后仍能识别重复请求；回执包含写入参数与结果，目前没有自动清理期限。超时或取消不代表没有提交，重试必须保持相同 ID 和参数。

修改、追加和删除要求最新的 baseRevision。版本冲突返回 revision_conflict，需要重新读取并判断。任务和小记更新使用 patch：未出现的字段保持不变，null 日期或文件夹用于清空。

外部提交后发送界面事件。干净的笔记和小记编辑器加载新内容；有未保存草稿时保留本地内容，并提供保存副本的入口。读取工具仅看到已保存内容。

## 开发和验证

```powershell
npm run tauri dev
npm run mcp:build
node scripts/rust-build.mjs test --lib
npm run build
npm run mcp:install
npm run mcp:test
npm run mcp:test:e2e -- --dsh-root D:/Files/Github/GithubProjects/deepseek-harness
```

Node SDK 仅用于开发期协议验证和旧桥接实现的回归，不是安装版的运行依赖。最后一项编译真正的 CoolNote 原生可执行程序，用隔离测试库、自动加密凭证和随机端口验证笔记 Markdown、小记、任务和 DSH 的工具调用。它不调用模型 API。DSH checkout 需要事先安装依赖并构建 lib/。

原生 Server 使用官方 Rust SDK rmcp，覆盖新版发现流程与旧版 initialize 握手。测试用标准 TypeScript 旧客户端和 DSH 当前客户端分别验证两种流程。
