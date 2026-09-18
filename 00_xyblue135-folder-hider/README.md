# xyblue135 · 文件夹隐藏

作者：xyblue135

一个极简的 Obsidian 文件夹视觉隐藏插件。

## 功能

- 在 Obsidian 左侧文件列表中右键文件夹，选择 **“隐藏此文件夹”**。
- 只隐藏文件夹在文件浏览器中的显示，不删除、不移动、不重命名真实文件夹。
- 不修改 Vault 文件、搜索索引、附件引用或其他插件读取逻辑。
- 当 Obsidian 或其他插件通过文件浏览器主动定位隐藏文件夹（或里面的文件）时，自动取消该文件夹的隐藏状态并正常显示。
- 如果之后还想隐藏，再右键该文件夹选择 **“隐藏此文件夹”** 即可。

## 安装

### 直接安装编译版

把下面三个文件放入：

`你的仓库/.obsidian/plugins/00_xyblue135-folder-hider/`

- `main.js`
- `manifest.json`
- `styles.css`

然后在 Obsidian → 设置 → 第三方插件中启用 **“xyblue135 · 文件夹隐藏”**。

### 源码编译

```bash
npm install
npm run build
```

## 数据

插件只会在自己的 `data.json` 中保存被隐藏文件夹的 Vault 相对路径，例如：

```json
{
  "hiddenFolders": ["z_attachments"]
}
```

## 注意

“被代码主动定位时自动恢复显示”依赖 Obsidian 内置文件浏览器的 `revealInFolder` 行为。插件做了兼容性检测：如果某个版本不存在该内部方法，不会阻止插件其他功能运行。