# CoolNote

<p align="center">
  <img src="public/assets/logo-CoolNote.png" alt="CoolNote" width="128">
</p>

<p align="center">
  一款本地优先、专注创作与个人知识管理的 Windows 桌面应用。
</p>

<p align="center">
  <a href="https://github.com/Calmer2024/CoolNote/releases/latest"><img alt="GitHub Release" src="https://img.shields.io/github/v/release/Calmer2024/CoolNote?display_name=tag"></a>
  <img alt="Platform" src="https://img.shields.io/badge/platform-Windows-2563eb">
  <img alt="Tauri" src="https://img.shields.io/badge/Tauri-2-24c8db">
  <img alt="React" src="https://img.shields.io/badge/React-19-149eca">
</p>

CoolNote 把笔记、小记、任务和画廊放进一个统一工作区。核心内容保存在本机 SQLite 数据库，附件与图片保存在本地资源目录；编辑自动保存，无需注册账号，也不依赖云端才能完成日常工作。

## 下载与安装

前往 [GitHub Releases](https://github.com/Calmer2024/CoolNote/releases/latest) 下载最新版 Windows x64 安装程序：

```text
CoolNote_1.0.0_x64-setup.exe
```

安装后，CoolNote 会在启动约 8 秒后静默检查更新。正式发布的更新包会经过 Tauri 签名验证，再以安静模式完成替换并重新启动应用。

> 当前正式支持 Windows 10/11 x64。首次发布若出现 Windows SmartScreen 提示，请核对下载来源为本仓库的 GitHub Release。

## 核心功能

### 笔记与知识整理

- 分类、收藏、归档、回收站与批量操作。
- 分页加载、更新时间排序、全局搜索和文档大纲。
- 内置不可删除的“欢迎使用 CoolNote”产品指南。
- Markdown、HTML、JSON 与纯文本导入。
- Markdown、PDF 导出与系统分享。
- 自动保存、revision 冲突保护、恢复日志和异常草稿恢复。

### 富文本编辑器

- 一至五级标题、粗体、斜体、下划线、删除线、高亮、链接、引用和行内代码。
- 无序列表、有序列表、任务列表、表格与稳定块 ID。
- `/` 斜杠菜单、选中文本浮动工具栏和 Markdown 即时语法转换。
- 多语言代码块与语法高亮。
- LaTeX 行内/块级公式以及 Mermaid 图表。
- 正文查找、替换和大内容分批粘贴。

### 图片、附件与网页资源

- 选择、粘贴或拖拽图片到正文，支持并排布局、排序和缩放。
- 支持音频、视频、PDF、压缩包、文本、Markdown、HTML 等常见附件。
- 音视频内嵌播放，网页链接与本地 HTML 沙箱预览。
- 一键打开资源、跳转网页、另存为或在资源管理器中显示。
- 相同附件按内容复用，减少重复存储。

### 小记

- 适合灵感、轻量写作和可分享长内容的独立工作区。
- 文件夹资源树、拖拽整理、原地重命名和自动保存。
- 富文本格式菜单以及图片选择、粘贴和拖拽。
- 24 张内置封面和本地封面上传。
- 导出 Markdown、PDF 或长图。

### 任务

- 收集箱、全部任务、今天、已完成、自定义清单与日历视图。
- 圆形完成动画，完成后延迟移入“已完成”。
- 备注、开始/结束时间、重要程度、所属清单与子任务。
- 状态、重要程度和日期筛选，以及多字段排序。
- 表格列宽拖拽、自定义清单图标与清单拖拽排序。
- 完整六周日历，可按日期快速创建任务。

### 画廊

- 多画廊管理、介绍、封面和手动排序。
- 多图选择或拖拽导入，显示进度并按内容去重。
- 批量移动、复制、下载和删除。
- 图片灯箱、键盘切换、原图复制与下载。
- 24 张内置封面和本地封面上传。

### 体验与外观

- 浅色、深色与跟随系统主题。
- 侧边栏、内容区骨架屏及柔和 Shimmer 过渡。
- 统一的悬停、选择、弹出层、图标与滚动条规范。
- 列表键盘导航和基础无障碍语义。

## 快捷键

| 快捷键 | 操作 |
| --- | --- |
| `Ctrl+K` | 聚焦全局搜索 |
| `Ctrl+B` | 折叠或展开当前模块第二栏 |
| `Ctrl+N` | 在笔记或小记模块新建内容 |
| `Ctrl+/` | 折叠或展开笔记大纲 |
| `Ctrl+1`—`Ctrl+5` | 将当前段落设置为对应级别标题 |
| `Ctrl+6` | 恢复为正文 |
| `Ctrl+I` | 切换斜体 |
| `Ctrl+U` | 切换下划线 |
| `Ctrl+T` | 插入 3×3 表格 |
| `Ctrl+F` | 查找正文 |
| `Ctrl+H` | 查找并替换 |
| `Enter` / `Shift+Enter` | 下一个 / 上一个查找结果 |
| `Ctrl+Enter` | 确认 Mermaid 源码输入 |
| `↑` `↓` `Enter` `Esc` | 操作斜杠菜单和多数选择卡片 |
| 灯箱中 `←` `→` `Esc` | 上一张、下一张、退出灯箱 |

## 数据位置与备份

Windows 默认数据目录：

```text
%APPDATA%\com.calmer.coolnote\library\
```

主要内容包括：

- `coolnote.db`：SQLite 数据库。
- `library.json`：笔记库配置。
- `attachments/`：附件、画廊原图和缩略图。
- `recovery/`：未确认保存事务的恢复记录。

备份时请先退出 CoolNote，再复制整个 `library` 文件夹，这样可以同时保留数据库与所有本地资源。

## 本地开发

### 环境要求

- Node.js 20+
- Rust stable
- Windows 10/11
- [Tauri 2 Windows 开发依赖](https://v2.tauri.app/start/prerequisites/)

### 启动完整桌面应用

```powershell
npm install
npm run tauri dev
```

### 仅启动浏览器前端

```powershell
npm run dev
```

浏览器模式使用本地 Web Store 作为功能预览；正式的 SQLite、文件系统和桌面能力以 Tauri 应用为准。

## 验证与构建

运行前端类型检查、契约检查与测试：

```powershell
npm run build
```

运行 Rust 测试：

```powershell
cargo test --manifest-path src-tauri/Cargo.toml
```

构建 Windows NSIS 安装包：

```powershell
npm run tauri build -- --bundles nsis
```

发布构建需要设置 `TAURI_SIGNING_PRIVATE_KEY`，以生成可被应用内更新器验证的签名包。

## 技术架构

```text
React 19 + TypeScript + Tiptap
              │
         Tauri 2 IPC
              │
      Rust application services
              │
     SQLite + local attachments
```

- 前端：React、TypeScript、Vite、Tiptap。
- 桌面运行时：Tauri 2。
- 后端：Rust application/domain/infrastructure 分层。
- 数据：SQLite 迁移、全文搜索、revision 并发保护与恢复日志。
- 导出：jsPDF、html-to-image。
- 内容渲染：KaTeX、Mermaid、Lowlight。

## 隐私与安全

- 核心数据默认只保存在本机，不要求账号或云服务。
- 网页与本地 HTML 资源使用受限 iframe 预览。
- 应用更新使用签名校验。
- `.env`、`.secrets`、数据库、恢复日志和附件目录均被 Git 忽略。
- 永久删除和清空回收站属于不可撤销操作，请提前备份。

## 发布

版本号同时维护在 `package.json`、`src-tauri/Cargo.toml` 和 `src-tauri/tauri.conf.json`。推送形如 `v1.0.0` 的标签后，GitHub Actions 会构建 Windows NSIS 安装包、更新签名及 `latest.json`，并创建正式 GitHub Release。

详细流程见 [docs/releasing.md](docs/releasing.md)。

## 致谢

CoolNote 使用 Tauri、React、Tiptap、Lucide、Noto Sans SC、KaTeX、Mermaid 等开源项目。第三方字体、图标和主题许可文件位于 `assets/` 与 `public/assets/`。
