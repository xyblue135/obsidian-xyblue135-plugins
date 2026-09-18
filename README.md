# xyblue135 开源 Obsidian 插件合集

xyblue135 自建的一组 Obsidian 插件（开放源代码），统一在此仓库版本化维护，
用于快照 / 回溯 Obsidian 插件状态，未提交至 Obsidian 官方社区插件商店。

## 插件列表

| 目录（插件 ID） | 显示名 |
| --- | --- |
| 00_xyblue135-ai-metadata-demo | xyblue135 · AI 元数据 |
| 00_xyblue135-char-count-updater | xyblue135 · 字数与 Token 统计 |
| 00_xyblue135-code-block-wrap | xyblue135 · 代码块增强 |
| 00_xyblue135-folder-template-note | xyblue135 · 文件夹模板笔记 |
| 00_xyblue135-folder-hider | xyblue135 · 文件夹隐藏 |
| 00_xyblue135-local-image-hover-zoom | xyblue135 · 图片缩放与相框 |
| 00_xyblue135-mirror-attachments | xyblue135 私人 · 附件镜像 |
| 00_xyblue135-notes-status | xyblue135 · 笔记状态 |

## 结构

- 根目录即 Obsidian 插件目录：每个子文件夹是一个插件（含 `manifest.json` / `main.js` / `styles.css` / 配置）。
- 各插件的功能说明见其目录下的 `README.md`。

## 还原方法

1. 克隆或下载本仓库（Release 中的 `obsidian-plugins-*.zip`）。
2. 将内容解压覆盖到 `Vault/.obsidian/plugins/`（**先备份原目录**）。
3. 在 Obsidian 设置 → 社区插件中启用对应插件。

## 自动打包

打 `v*` 标签会触发 GitHub Actions，把整个插件目录打包成 `obsidian-plugins-<tag>.zip` 作为 Release 还原点。

## 安全说明

部分插件的 `data.json` 记录了内网（局域网 / 家庭实验室）API 地址，外部不可达。
请勿把含 API Key 且公网可达的 `data.json` 提交到公开仓库。