# xyblue135 · Token 统计

> **开源插件**：xyblue135 维护的开放源代码插件，仓库公开、可自由查看与复用。
> **兼容原则**：插件 ID 保持 `00_xyblue135-char-count-updater`，升级包不携带 `data.json`，覆盖安装时保留用户本地配置与历史状态。

维护者：**xyblue135**

---

按**白名单**自动更新 Obsidian Markdown 文件 YAML frontmatter 中已经存在的 `token_count` 字段。

## 安全原则

插件绝不会创建 YAML frontmatter，也绝不会创建任何字段。只有文件中已经存在对应键时，才会尝试修改：

```yaml
---
token_count:
---
```

字段不存在时直接跳过。

## 处理范围（白名单）

只有白名单命中的文件才会被处理，其余一律跳过。每行一个 Vault 相对路径：

- 写**文件夹** → 包含该文件夹及其全部子笔记（如 `00_docs`）；
- 写**具体文件** → 只处理这一个文件（如 `00_docs/索引.md`）。

默认白名单为 `00_docs`。白名单留空时不处理任何文件。

## 功能

- 自动更新已有 `token_count`
- 可选择统一倍率或中英文分倍率估算
- 每个文件独立防抖
- 切换文件或窗口失焦时可立即处理
- 支持 BOM、CRLF、Emoji 和 Unicode 字符
- 没有批量更新命令
- 没有手动更新命令
- 没有旧字段或旧设置迁移

## v4.0.0 变更

- **移除 `char_count`**：不再统计和写入字符数字段（正文 Unicode 字符数仍用于 Token 估算）。
- **黑名单 → 白名单**：删除全局黑名单、忽略文件夹、字段级黑名单等全部黑名单配置与代码，改为白名单机制。
- 修复 `flushOnFileSwitch` / `flushOnWindowBlur` 两个开关未写入 `data.json` 导致设置无法保存的问题。

## Token 估算

### 中英文分开估算

```text
token_count = 中文字符数 × 中文倍率
               + 英文及其他字符数 × 英文倍率
```

默认值：

```text
中文字符倍率：0.50
英文及其他字符倍率：0.25
```

中文字符使用 Unicode 汉字范围识别；英文及其他字符包括英文、数字、空格、标点、Markdown 标记和代码字符。

### 统一倍率

关闭“中英文分别估算”后：

```text
token_count = 正文 Unicode 字符数 × 统一倍率
```

默认统一倍率为 `0.55`。

Token 估算只适合粗略筛选和预算，不等于特定模型 tokenizer 的精确结果。

## 统计口径

- 排除 YAML frontmatter
- 将 CRLF 统一为 LF
- 按 Unicode 字符统计
- Emoji 按一个 Unicode 字符处理
- 包含正文中的空格、换行、Markdown 和代码

## 安装

将整个插件目录复制到你的 Vault 插件目录：

```text
<Vault>/.obsidian/plugins/00_xyblue135-char-count-updater/
```

至少包含：

```text
manifest.json
main.js
styles.css
```

然后重新加载 Obsidian，并在第三方插件中启用 **xyblue135 · Token 统计**。

升级覆盖时保留当前插件目录中的 `data.json`，不要提交到公开仓库。
