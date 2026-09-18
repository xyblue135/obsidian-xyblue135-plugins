# xyblue135 · AI 元数据

> **开源插件**：xyblue135 维护的开放源代码插件，仓库公开、可自由查看与复用。
> **兼容原则**：插件 ID 保持 `00_xyblue135-metadata-ai`，升级包不携带 `data.json`，覆盖安装时保留用户本地配置、API Key 与历史状态。

维护者：**xyblue135**

---

## 简介

调用 OpenAI 兼容 API，为 `00_docs` 目录中的 Markdown 自动生成并维护 4 项 AI 元数据字段：

```yaml
summary_short: "短摘要"
summary_long: "长摘要"
tags:
  - 标签
technical_depth: 68
```

- `summary_short`：用于首页卡片、搜索结果、悬浮预览等快速识别场景的短摘要。
- `summary_long`：用于 AI 理解文章结构、排序、RAG、相关推荐等场景的长摘要。
- `tags`：带权重的技术标签。
- `technical_depth`：0～100 的技术深度评分。

## 主要功能

- Properties 中每个元数据字段旁都有独立的 ✨ 按钮，点击哪个字段只生成并写入该字段，不会顺带覆盖其他字段。
- 待更新笔记面板按真实目录层级展示文件夹树，给出每篇 Markdown 的缺失字段、正文预览、上次错误，并支持逐篇重试。
- 支持按文件夹批量识别、自动定时更新，运行中可停止识别。
- 可选「内容指纹 fingerprint」识别：按正文变化判断元数据是否过期（默认关闭）。
- 开启「Beta：批量合并 4 项 AI 元数据请求」时，同一篇缺少多项的文章尽量只发 1 次请求（默认开启）。
- 全局 API 串行队列，默认请求间隔 30 秒，单次硬超时 180 秒。
- 结构化 JSON 输出 + 容错（JSON mode、保守修复、必要时自动重试 1 次）。

## 标签处理

- 默认最多生成 7 个标签（可在设置中调整上限），少于上限也正常写入。
- AI 返回带 weight 的候选，插件本地排序、归一化、去重后写入。
- 支持 Tag 大小写本地规范化与技术词规范表，优先复用 Vault 中已有写法。
- 本地 Tag 索引仅用于大小写匹配，不会发送给 AI。

## 待更新识别

默认以 Properties 内容存在性判断完成状态（`summary_short` / `summary_long` / `tags` / `technical_depth` 分别判断）。开启 fingerprint 后，再按正文指纹判断是否过期。

## 设置中可见参数

- Base URL / API Key / Model
- API 请求超时、请求间隔
- 白名单目录（默认 `00_docs`）
- Tags 数量、Tag 大小写规范化、技术词规范表、本地 Tag 索引
- 实验性：合并请求、内容指纹、Summary 输入 Markdown 清理
- 元数据 status 校验
- 自动触发更新与更新频率
- 各字段的 Harness 与摘要最大字符数

## 安装

插件目录：

```text
<Vault>/.obsidian/plugins/00_xyblue135-metadata-ai/
```

至少包含：

```text
manifest.json
main.js
styles.css
```

然后在 Obsidian → 设置 → 第三方插件中启用 **xyblue135 · AI 元数据**。

## API

插件使用 OpenAI 兼容的 `POST {Base URL}/chat/completions` 生成元数据；「测试 API」按钮会先 `GET {Base URL}/models` 再发送一次真实 `chat/completions` 请求校验链路。

为支持真正可中断的硬超时与关闭时取消请求，插件使用 Obsidian Desktop 环境的 Node.js `http` / `https`，因此 manifest 标记为 Desktop Only。

`data.json` 可能保存 API Key 等本地敏感配置，请勿提交进仓库；升级包也不携带该文件。