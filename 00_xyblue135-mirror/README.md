# xyblue135 私人 · 附件镜像

> 当前版本：**v2.0.1**  
> 插件 ID：`00_xyblue135-mirror`  
> 当前附件根目录：`00_assets`

这是一个用于 Obsidian 的附件管理插件。v2.x 已经从早期的“00_docs 与附件目录树完全镜像”改为“**一个 Markdown 文件名对应一个单层共享附件目录**”。

插件 ID 保持不变，升级时可以继续覆盖原插件目录。升级包不携带 `data.json`，避免覆盖本地设置。

---

## 1. v2.x 当前目录结构

假设笔记为：

```text
00_docs/A/test.md
00_docs/B/test.md
00_docs/Linux/docker.md
```

附件目录为：

```text
00_assets/
├─ test/
└─ docker/
```

其中：

```text
00_docs/A/test.md ─┐
                 ├─> 00_assets/test/
00_docs/B/test.md ─┘
```

不同父目录下的同名 Markdown 明确共享同一个附件目录。

因此附件目录只保留一层“文章名”目录，不再复制 00_docs 的父目录结构。

---

## 2. 为什么取消旧镜像结构

v1.x 使用：

```text
00_docs/A/B/文章.md
Attachments/A/B/文章/
```

这种结构的问题是 00_docs 目录树与 Attachments 目录树高度耦合。

例如：

```text
00_docs -> Note1
```

或者：

```text
00_docs/Linux/Docker/
-> 00_docs/运维/容器/
```

都会触发大量 Markdown rename / move 事件，旧版必须同步搬迁整棵附件树。一旦目录事件判断错误，影响范围会被放大。

v2.x 改为：

```text
00_docs/任意目录/文章.md
00_assets/文章/
```

因此：

- Markdown 只移动父目录：附件不动。
- 00_docs 根目录改名：附件不动。
- 00_docs 子目录批量整理：附件不动。
- 不同目录创建同名 Markdown：共享附件目录。
- 删除共享笔记：根据剩余同名 Markdown 数量决定是否回收附件。

目录结构与附件结构已经从架构层面解耦。

---

## 3. 同名 Markdown 与共享附件

例如：

```text
00_docs/A/test.md
00_docs/B/test.md
00_docs/C/test.md
```

三篇笔记全部共享：

```text
00_assets/test/
```

插件不会为它们创建三份附件目录。

创建新的同名 Markdown 时会提示：

```text
检测到同名笔记「test」
不会重复创建附件目录，将共享：00_assets/test/
```

这不是冲突，而是 v2.x 的正式共享规则。

### 设置页同名检查

设置页提供“同名 Markdown 检查”，可以查看：

- 哪些文件名存在重复。
- 当前共有几篇同名 Markdown。
- 每一篇 Markdown 的完整路径。
- 它们共同使用哪个 `00_assets/<文件名>/` 目录。

插件不会依赖一个长期保存、容易过期的“文章路径 → 附件路径”数据库。

共享关系以当前 Vault 中实际存在的 Markdown 为准，每次需要判断时实时扫描。

---

## 4. 删除规则：最后引用才回收

例如：

```text
00_docs/A/test.md
00_docs/B/test.md
00_docs/C/test.md
```

全部共享：

```text
00_assets/test/
```

删除行为：

```text
删除 A/test.md
-> 仍有 2 篇 test.md
-> 00_assets/test/ 不动

删除 B/test.md
-> 仍有 1 篇 test.md
-> 00_assets/test/ 不动

删除 C/test.md
-> 已无 test.md
-> 00_assets/test/ 才进入系统回收站
```

也就是说：

> **附件属于“同名 Markdown 共享组”，而不是属于某一个具体父目录下的 Markdown。**

只要还有一个同名 Markdown 存在，共享附件就不会被删除。

---

## 5. 附件删除与系统回收站

最后一个同名 Markdown 被真正删除后，共享附件目录会直接移入系统回收站（Windows 回收站），不再进入插件自己的垃圾桶。

因此：

- 附件仍可在系统回收站中找回，不会永久丢失。
- 插件不再在 data.json 中保存恢复记录。
- 设置页也不再提供恢复按钮，找回操作交给系统回收站完成。

---

## 6. 重命名规则

### 6.1 只移动父目录

```text
00_docs/A/test.md
-> 00_docs/B/test.md
```

文件名仍然是 `test.md`，所以附件始终是：

```text
00_assets/test/
```

不执行任何附件搬迁。

### 6.2 唯一文章改名

如果 Vault 中只有一篇：

```text
test.md
```

现在改名：

```text
test.md -> demo.md
```

且不存在：

```text
00_assets/demo/
```

插件可以安全地把：

```text
00_assets/test/
-> 00_assets/demo/
```

重命名优先通过 Obsidian `FileManager` 完成，让 Obsidian 有机会同步 Vault 内已有链接。

### 6.3 旧名字仍有其他共享文章

如果：

```text
00_docs/A/test.md
00_docs/B/test.md
```

A 被改名为：

```text
00_docs/A/demo.md
```

此时 B 仍然需要：

```text
00_assets/test/
```

所以插件绝不会把 `test/` 搬走。

A 会使用：

```text
00_assets/demo/
```

### 6.4 新名字已经存在附件目录

如果目标已经存在：

```text
00_assets/demo/
```

插件不会自动把：

```text
00_assets/test/
```

与它合并。

原因是插件无法可靠判断两个目录里的同名文件、历史附件和正文引用应该如何合并。

安全原则始终是：**不自动覆盖、不自动合并。**

---

## 7. 附件导入与命名规则

插件接管从系统文件管理器进行的：

- `Ctrl+V` 文件粘贴。
- 文件拖入。

当前 Markdown 为：

```text
00_docs/A/test.md
```

附件统一保存到：

```text
00_assets/test/
```

### 7.1 图片和 PDF

图片与 PDF 属于可直接嵌入正文的资源，使用毫秒级时间戳：

```text
00_assets/test/20260815143000123.png
00_assets/test/20260815143000124.pdf
```

Markdown：

```md
![](/00_assets/test/20260815143000123.png)
![](/00_assets/test/20260815143000124.pdf)
```

支持的图片类型包括：

```text
PNG / JPG / JPEG / GIF / WebP / BMP / SVG / AVIF
```

### 7.2 ZIP、Office 和普通附件

非嵌入式附件保留原始可读文件名：

```text
00_assets/test/项目源码.zip
00_assets/test/毕业论文.docx
00_assets/test/实验数据.xlsx
```

Markdown：

```md
[项目源码.zip](/00_assets/test/项目源码.zip)
[毕业论文.docx](/00_assets/test/毕业论文.docx)
[实验数据.xlsx](/00_assets/test/实验数据.xlsx)
```

### 7.3 普通附件重名

不覆盖旧文件，自动追加：

```text
项目源码.zip
项目源码 (1).zip
项目源码 (2).zip
```

### 7.4 文件名安全处理

普通附件尽量保留原文件名，只清理明显不安全内容：

- Windows 非法字符：`\ / : * ? " < > |`
- ASCII 控制字符。
- 文件名结尾的句点和空格。
- `CON`、`PRN`、`AUX`、`NUL`、`COM1`～`COM9`、`LPT1`～`LPT9` 等 Windows 保留设备名。

中文、正常空格、括号等尽量原样保留。

例如：

```text
项目:最终版?.zip
-> 项目-最终版-.zip
```

### 7.5 批量导入

一次导入多个附件时：

- Markdown 链接之间自动留一个空行。
- 单个文件失败不会中断整批任务。
- 成功、失败、自动重名都会给出提示。

---

## 8. Windows 文件复制兼容

Windows 文件资源管理器复制 ZIP、Office、PDF 等文件后，Electron 某些情况下不会稳定地把文件放入 `clipboardData.files`。

插件同时读取：

```text
clipboardData.files
clipboardData.items
```

并自动去重。

因此从 Windows：

```text
Ctrl+C 文件
-> Obsidian
-> Ctrl+V
```

ZIP、Office、PDF 和图片都可以被统一处理。

---

## 9. 结构校验

设置页会扫描：

- 当前受管理 Markdown 数量。
- 实际需要的共享附件目录数量。
- 缺失的共享附件目录。
- 同名 Markdown 共享组。
- 路径冲突。
- `00_assets` 根目录下没有对应当前 Markdown 的孤立目录。

### “补建缺失目录”只创建，不删除

自动操作仅负责补建：

```text
00_assets/<Markdown 文件名>/
```

不会自动删除孤立目录。

因为孤立目录可能是：

- v1.x 镜像结构迁移后的历史数据。
- 用户手工恢复的数据。
- 正文仍在引用的旧附件。
- 临时保留的数据。

这项规则是 v2.x 的重要安全策略。

---

## 10. 文件树快捷操作

左侧文件树右键 Markdown：

```text
📂 打开对应附件目录
```

可以直接定位到：

```text
00_assets/<当前 Markdown 文件名>/
```

---

## 11. v2.0.1 的 `00_assets` 迁移规则

v2.0.0 曾使用默认根目录：

```text
attachment/
```

从 v2.0.1 开始统一改为：

```text
00_assets/
```

使用 `00_` 前缀是为了让笔记文档（00_docs）与附件目录（00_assets）在 Vault 根目录的字母排序中排在最前面、彼此相邻，便于一眼定位。

### 从 v2.0.0 自动升级

如果 `data.json` 中记录的是：

```text
attachmentsRoot = attachment
```

插件会进行安全检查。

#### 情况 A：只有旧 `attachment/`

且不存在：

```text
00_assets/
```

插件会通过 Obsidian FileManager 整体改名：

```text
attachment/
-> 00_assets/
```

随后把插件配置更新为 `00_assets`。

#### 情况 B：旧目录不存在

直接把设置更新为：

```text
00_assets
```

#### 情况 C：`attachment/` 与 `00_assets/` 同时存在

插件**停止自动迁移**。

不会：

- 自动合并。
- 覆盖。
- 删除其中一边。

插件会提示用户先人工确认数据。

### v1.x 的 `Attachments/` 不自动迁移

旧镜像目录例如：

```text
Attachments/Linux/Docker/test/
```

仍然不会自动搬入：

```text
00_assets/test/
```

因为不同父目录下可能存在多个同名 Markdown，自动把多个历史目录合并到一个共享目录风险太高。

旧 v1.x 数据应人工确认后再迁移。

---

## 12. 推荐配置

```text
笔记根目录：00_docs
附件根目录：00_assets
```

最终示例：

```text
Vault/
├─ 00_docs/
│  ├─ Linux/
│  │  └─ test.md
│  └─ Windows/
│     └─ test.md
│
└─ 00_assets/
   ├─ test/
   │  ├─ 20260815143000123.png
   │  └─ 项目源码.zip
```

两篇 `test.md` 共享 `00_assets/test/`。

---

## 13. 安装与升级

插件目录：

```text
<Vault>/.obsidian/plugins/00_xyblue135-mirror/
```

至少包含：

```text
manifest.json
main.js
styles.css
README.md
```

然后：

```text
Obsidian
-> 设置
-> 第三方插件
-> 启用 xyblue135 私人 · 附件镜像
```

### 覆盖升级注意事项

升级包不包含 `data.json`。

如果当前插件目录已经存在：

```text
data.json
```

请保留它。

`data.json` 中可能包含：

- 笔记根目录设置。
- 附件根目录设置。
- 粘贴/拖入开关。
- 删除保护设置。

不要为了升级插件而主动删除 `data.json`。

---

## 14. 当前安全原则

v2.x 的核心原则：

1. **父目录 rename 不删除附件。**
2. **00_docs 根目录 rename 不删除附件。**
3. **同名 Markdown 明确共享附件。**
4. **最后一个共享引用消失才允许回收附件。**
5. **删除进入系统回收站。**
6. **结构校验只补建，不自动清理孤立附件。**
7. **两个附件目录存在冲突时不自动合并。**
8. **旧镜像结构不进行危险的批量自动迁移。**

目标不是让插件“尽可能自动处理”，而是在附件数据安全的前提下减少人工管理。
