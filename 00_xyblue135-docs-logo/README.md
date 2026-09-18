# xyblue135 · 笔记状态

> **开源插件**：xyblue135 维护的开放源代码插件，仓库公开、可自由查看与复用。
> **兼容原则**：插件 ID 保持 `00_xyblue135-docs-logo`，升级包不携带 `data.json`，覆盖安装时保留用户本地配置与历史状态。

维护者：**xyblue135**

---

## 设计目标

只对白名单目录及其全部子目录添加状态显示。

- 白名单外：完全不处理。
- 白名单目录：只允许文件夹与 `.md` 文件。
- 文件夹默认状态图标：正方形。
- Markdown 默认状态图标：圆形。
- `status` 完成：绿色；未完成/缺失：红色。
- `visibility` 为 `open` / `公开`：公开；其他值或缺失：显示锁。
- 文件夹状态聚合全部后代 Markdown：只要任意一篇未完成，文件夹为红色；全部完成才绿色。
- 文件夹只要任意后代 Markdown 未公开，就显示锁。
- 自定义 SVG 必须同时处于白名单范围内，否则 `icons.json` 中即使写了也不会生效。

## whitelist.json

默认：

```json
{
  "_comment": "重要：白名单目录及其所有子目录只允许包含文件夹和 .md 文件，不允许放 .jpg、.png、.webp、.gif、.pdf、.zip 等附件。白名单路径自动递归包含全部子目录。",
  "paths": [
    "00_docs"
  ]
}
```

如果只想让部分目录生效：

```json
{
  "paths": [
    "00_docs/运维",
    "00_docs/代码"
  ]
}
```

`00_docs/运维/docker` 会自动继承 `00_docs/运维` 的白名单资格，不需要重复写。

## icons.json

仍然使用一个 JSON 映射文件。key 是 Vault 内完整相对路径，value 是 SVG 路径。

```json
{
  "_comment": "仅对白名单路径生效。",
  "00_docs/运维/docker": "./图标存放/运维_docker.svg",
  "00_docs/代码/Python.md": "./图标存放/代码_python.svg"
}
```

`./` 表示相对于当前插件目录。

自定义 SVG 不会丢掉状态：SVG 右下角会叠加一个小状态徽标。

- 文件夹：小正方形徽标。
- Markdown：小圆形徽标。

## Frontmatter

```yaml
---
status: done
visibility: open
---
```

完成值：

- done
- complete
- completed
- finished
- 已完成
- 完成

公开值：

- open
- 公开

其他值或缺失都按“未完成 / 未公开”处理。

## 结构限制

白名单目录树中请只放：

- 文件夹
- `.md`

不要放：

- `.jpg`
- `.png`
- `.webp`
- `.gif`
- `.pdf`
- `.zip`
- 其他附件

如果检测到非 `.md` 文件，插件会弹出警告并忽略它们。

## 命令

命令面板中提供：

- 刷新白名单状态图标
- 重新加载白名单与自定义图标
- 检查白名单目录结构

## 安装

将整个插件目录复制到你的 Vault 插件目录：

```text
<Vault>/.obsidian/plugins/00_xyblue135-docs-logo/
```

至少包含：

```text
manifest.json
main.js
```

然后在 Obsidian 中：设置 → 第三方插件 → 启用 **xyblue135 · 笔记状态**。

升级覆盖时保留当前插件目录中的 `data.json`，不要提交到公开仓库。
