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

此外还支持 3 个面向「内容发布 / 短视频引流」的增值生成字段（锐评、面试问答、标题），详见下方「附加生成字段」一节。

## 主要功能

- Properties 中每个元数据字段旁都有独立的 ✨ 按钮，点击哪个字段只生成并写入该字段，不会顺带覆盖其他字段。
- 待更新笔记面板按真实目录层级展示文件夹树，给出每篇 Markdown 的缺失字段、正文预览、上次错误，并支持逐篇重试。
- 支持按文件夹批量识别（运行中可停止）；**全部为手动触发，无自动定时更新**。
- 可选「内容指纹 fingerprint」识别：按正文变化判断元数据是否过期（默认关闭）。
- 开启「Beta：批量合并 4 项 AI 元数据请求」时，同一篇缺少多项的文章尽量只发 1 次请求（默认开启）。
- 全局 API 串行队列，**默认请求间隔 30 秒、单次硬超时 180 秒**；所有手动更新（单篇命令、待更新面板逐篇重试、文件夹批量识别）都受此节流约束，最快约 30 秒/次，文件夹批量识别支持中途停止。
- 结构化 JSON 输出 + 容错（JSON mode、保守修复、必要时自动重试 1 次）。
- 设置页底部提供「导出字段与提示词 CSV」按钮，一键把 7 个可 AI 生成的字段及其提示词导出为 `ai-metadata-fields.csv`（保存在仓库根目录）。

## 标签处理

- 默认最多生成 7 个标签（可在设置中调整上限），少于上限也正常写入。
- AI 返回带 weight 的候选，插件本地排序、归一化、去重后写入。
- 支持 Tag 大小写本地规范化与技术词规范表，优先复用 Vault 中已有写法。
- 本地 Tag 索引仅用于大小写匹配，不会发送给 AI。

## 待更新识别

默认以 Properties 内容存在性判断完成状态（`summary_short` / `summary_long` / `tags` / `technical_depth` 分别判断）。开启 fingerprint 后，再按正文指纹判断是否过期。

## 附加生成字段（内容增值）

除上面 4 项核心元数据外，插件还支持 3 个面向「博客发布 / 短视频引流」的增值生成字段。它们各自独立开关，写入独立的 frontmatter 字段，**不会覆盖**核心元数据，提示词（Harness）也与核心元数据分开配置、可单独改写：

- **`take`（锐评）**：以内行视角生成一段 50～150 字、单段落的犀利技术点评——先点出文章表面价值，再重点批评短板（如只会罗列操作、浮于现象、缺少底层原理、把简单踩坑包装成干货、论证薄弱等）；若文章无明显问题也可转为表扬。输出固定以 `【锐评】` 开头，禁止分点 / 小标题 / 列表 / Markdown。对应设置 `takeHarness` / `takeHarnessEnabled`。
- **`_qa`（面试问答）**：模拟资深技术招聘面试官，把正文转换为「面试官视角的提问 + 第一人称经验型回答」，用于评估候选人是否真正掌握该主题。问题数量随文档复杂度动态调整（简单 1~3 / 中等 3~6 / 复杂 6~10），覆盖环境搭建、原理理解、故障排查、工程实践、架构设计、性能优化等方向；输出为 YAML 格式，不修改、不删除原文其它字段。对应设置 `qaHarness` / `qaHarnessEnabled` / `qaMaxQuestions`。
- **`aiTitle`（标题）**：基于正文生成若干（默认 5 个）纯文本标题，每行一个，兼顾博客发布与短视频封面，并保留核心主题词以保证 RAG 检索；要求严格依据原文、不编造，使用爆款钩子手法（反差 / 痛点 / 疑问 / 轻情绪词 / 第一人称体验 / 数字清单）且风格错落搭配。对应设置 `aiTitleHarness` / `aiTitleHarnessEnabled` / `aiTitleMaxItems`。

这 3 个字段属于「内容增值」而非 vault 元数据，不参与待更新识别与合并请求，仅按各自开关独立生成。

## 设置中可见参数

- Base URL / API Key / Model
- API 请求超时、请求间隔
- 白名单目录（默认 `00_docs`）
- Tags 数量、Tag 大小写规范化、技术词规范表、本地 Tag 索引
- 实验性：合并请求、内容指纹、Summary 输入 Markdown 清理
- 元数据 status 校验
- 各字段的 Harness 与摘要最大字符数
- 附加生成字段：锐评（take）、面试问答（_qa）、标题（aiTitle）的开关与数量上限

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