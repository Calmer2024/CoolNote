# CoolNote 发布与静默更新

CoolNote 使用 Tauri Updater 检查 GitHub Releases 中的 `latest.json`。Windows 更新器使用 `quiet` 安装模式，下载并验证签名后静默替换已安装程序。

## 首次配置

1. 本地更新签名私钥位于被 Git 忽略的 `.secrets/coolnote-updater.key`。请安全备份；丢失后，已安装版本将无法信任使用新密钥签名的更新。
2. 在 GitHub 仓库 Actions secrets 中新增 `TAURI_SIGNING_PRIVATE_KEY`，值为私钥文件的完整内容。
3. 当前私钥没有密码，可将 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` 留空。若后续改用有密码私钥，请同步设置该 secret，并同时更新应用内公钥后再发布过渡版本。

## 发布

同步更新 `package.json`、`src-tauri/Cargo.toml` 和 `src-tauri/tauri.conf.json` 中的版本号，然后推送相同版本标签，例如 `v0.1.19`。GitHub Actions 会构建 NSIS 安装包、签名更新包并发布 `latest.json`。

已安装的生产版本会在启动 8 秒后后台检查更新。发现新版本后，应用下载并校验更新包，然后以 Windows quiet 模式安装并重启。
