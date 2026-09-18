/*
 * xyblue135 私人 · 笔记状态
 * 类型：xyblue135 私人插件（非公共发布版）
 * 说明：用户可见文案与维护注释已中文化；内部插件 ID 与 data.json 保持不变，以兼容原有设置和数据。
 */
const { Plugin, Notice, TFile, TFolder, normalizePath } = require("obsidian");

const STYLE_ID = "xyblue135-docs-logo-styles";
const SVG_SIZE = 16;

const COLORS = {
  done: "#4CAF50",
  undone: "#F44336"
};

const DONE_VALUES = new Set([
  "done",
  "complete",
  "completed",
  "finished",
  "已完成",
  "完成"
]);

const OPEN_VALUES = new Set([
  "open",
  "公开"
]);

const LOCK_SVG = `<svg xmlns="http://www.w3.org/2000/svg"
     width="16"
     height="16"
     viewBox="0 0 16 16"
     shape-rendering="crispEdges">

  <!-- 红色外框 -->
  <path fill="#d90000" d="
    M4 2 H12 V3 H14 V5 H15 V11 H14 V13 H12 V14 H4 V13 H2 V11 H1 V5 H2 V3 H4 Z

    M4 4 V5 H3 V11 H4 V12 H12 V11 H13 V5 H12 V4 Z
  " fill-rule="evenodd"/>

  <!-- 中间斜杠 -->
  <path fill="#d90000" d="
    M10 4 H13 V6
    L6 13
    H3 V10
    Z
  "/>

</svg>`;

module.exports = class xyblue135NotesStatusPlugin extends Plugin {
  async onload() {
    this.pluginDir = this.manifest.dir || ".obsidian/plugins/xyblue135-docs-logo";
    this.whitelistPath = normalizePath(`${this.pluginDir}/whitelist.json`);
    this.iconsPath = normalizePath(`${this.pluginDir}/icons.json`);

    this.whitelistRoots = [];
    this.iconMap = new Map();
    this.iconSourcePaths = new Set();
    this.noteStatus = new Map();
    this.lastInvalidSignature = "";

    this.styleEl = document.getElementById(STYLE_ID);
    if (!this.styleEl) {
      this.styleEl = document.createElement("style");
      this.styleEl.id = STYLE_ID;
      document.head.appendChild(this.styleEl);
    }

    await this.reloadConfiguration(false);

    this.rebuildSoon = this.debounce(() => this.rebuildStyles(), 180);
    this.reloadSoon = this.debounceAsync(() => this.reloadConfiguration(true), 260);

    this.registerEvent(this.app.vault.on("create", (file) => this.handleStructureChange(file)));
    this.registerEvent(this.app.vault.on("delete", (file) => this.handleStructureChange(file)));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => this.handleRename(file, oldPath)));
    this.registerEvent(this.app.vault.on("modify", (file) => this.handleModify(file)));
    this.registerEvent(this.app.metadataCache.on("changed", (file) => this.handleMetadataChange(file)));

    this.addCommand({
      id: "refresh-whitelist-status",
      name: "刷新白名单状态图标",
      callback: () => this.rebuildStyles()
    });

    this.addCommand({
      id: "reload-whitelist-and-icons",
      name: "重新加载白名单与自定义图标",
      callback: () => this.reloadConfiguration(true)
    });

    this.addCommand({
      id: "validate-whitelist-tree",
      name: "检查白名单目录结构",
      callback: () => {
        const result = this.collectRows();
        this.reportInvalidFiles(result.invalidFiles, true);
        if (result.invalidFiles.length === 0) {
          new Notice("xyblue135 私人·笔记状态：白名单目录结构检查通过，仅包含文件夹和 .md 文件。");
        }
      }
    });

    this.app.workspace.onLayoutReady(() => this.rebuildStyles());
  }

  onunload() {
    if (this.styleEl) {
      this.styleEl.remove();
      this.styleEl = null;
    }
  }

  debounce(fn, delay) {
    let timeout = null;
    this.register(() => window.clearTimeout(timeout));
    return (...args) => {
      window.clearTimeout(timeout);
      timeout = window.setTimeout(() => fn(...args), delay);
    };
  }

  debounceAsync(fn, delay) {
    let timeout = null;
    this.register(() => window.clearTimeout(timeout));
    return (...args) => {
      window.clearTimeout(timeout);
      timeout = window.setTimeout(() => {
        Promise.resolve(fn(...args)).catch((e) => {
          console.error("xyblue135 私人·笔记状态： reload failed", e);
        });
      }, delay);
    };
  }

  normalizeValue(value) {
    return String(value ?? "").trim().toLowerCase();
  }

  normalizeConfigPath(value) {
    if (typeof value !== "string") return "";
    const trimmed = value.trim().replace(/^\/+/, "").replace(/\/+$/, "");
    if (!trimmed) return "";
    return normalizePath(trimmed);
  }

  minimizeRoots(paths) {
    const unique = [...new Set(paths.filter(Boolean))];
    unique.sort((a, b) => a.length - b.length || a.localeCompare(b));
    const roots = [];

    for (const path of unique) {
      if (roots.some((root) => path === root || path.startsWith(root + "/"))) {
        continue;
      }
      roots.push(path);
    }
    return roots;
  }

  async loadWhitelist() {
    try {
      const raw = await this.app.vault.adapter.read(this.whitelistPath);
      const parsed = JSON.parse(raw);
      const values = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed.paths)
          ? parsed.paths
          : Array.isArray(parsed.whitelist)
            ? parsed.whitelist
            : [];

      this.whitelistRoots = this.minimizeRoots(
        values.map((v) => this.normalizeConfigPath(v)).filter(Boolean)
      );
    } catch (e) {
      this.whitelistRoots = [];
      console.warn("xyblue135 私人·笔记状态： whitelist.json missing or invalid", e);
      new Notice("xyblue135 私人·笔记状态：whitelist.json 读取失败，当前不会给任何目录添加状态图标。");
    }
  }

  resolveSvgPath(rawPath) {
    if (typeof rawPath !== "string") return "";
    const value = rawPath.trim();
    if (!value) return "";

    if (value.startsWith("./")) {
      return normalizePath(`${this.pluginDir}/${value.slice(2)}`);
    }

    return normalizePath(value.replace(/^\/+/, ""));
  }

  async loadIconConfig() {
    this.iconMap.clear();
    this.iconSourcePaths.clear();

    try {
      const raw = await this.app.vault.adapter.read(this.iconsPath);
      const config = JSON.parse(raw);

      for (const [targetRaw, svgRaw] of Object.entries(config)) {
        if (targetRaw.startsWith("_")) continue;
        if (typeof svgRaw !== "string") continue;

        const targetPath = this.normalizeConfigPath(targetRaw);
        if (!targetPath || !this.isPathWhitelisted(targetPath)) {
          // 白名单优先级最高：白名单之外即使配置了 SVG，也完全不生效、不读取。
          continue;
        }

        const svgPath = this.resolveSvgPath(svgRaw);
        if (!svgPath) continue;

        try {
          const svgContent = await this.app.vault.adapter.read(svgPath);
          this.iconMap.set(targetPath, svgContent);
          this.iconSourcePaths.add(svgPath);
        } catch (e) {
          console.warn(`xyblue135 私人·笔记状态： failed to load icon for "${targetPath}" from "${svgPath}"`, e);
        }
      }
    } catch (e) {
      console.warn("xyblue135 私人·笔记状态： icons.json missing or invalid", e);
    }
  }

  async reloadConfiguration(showNotice) {
    await this.loadWhitelist();
    await this.loadIconConfig();
    this.rebuildStyles();

    if (showNotice) {
      const roots = this.whitelistRoots.length ? this.whitelistRoots.join(", ") : "（空）";
      new Notice(`xyblue135 私人·笔记状态：配置已重新加载。白名单：${roots}`);
    }
  }

  isPathWhitelisted(path) {
    const normalized = this.normalizeConfigPath(path);
    if (!normalized) return false;
    return this.whitelistRoots.some(
      (root) => normalized === root || normalized.startsWith(root + "/")
    );
  }

  isWhitelistRelatedPath(path) {
    const normalized = this.normalizeConfigPath(path);
    if (!normalized) return false;

    return this.whitelistRoots.some(
      (root) =>
        normalized === root ||
        normalized.startsWith(root + "/") ||
        root.startsWith(normalized + "/")
    );
  }

  handleStructureChange(file) {
    if (!file || !file.path) return;

    if (file.path === this.whitelistPath || file.path === this.iconsPath) {
      this.reloadSoon();
      return;
    }

    if (this.isWhitelistRelatedPath(file.path)) {
      this.rebuildSoon();
    }
  }

  handleRename(file, oldPath) {
    const newPath = file && file.path ? file.path : "";

    if (
      newPath === this.whitelistPath ||
      newPath === this.iconsPath ||
      oldPath === this.whitelistPath ||
      oldPath === this.iconsPath
    ) {
      this.reloadSoon();
      return;
    }

    if (this.isWhitelistRelatedPath(newPath) || this.isWhitelistRelatedPath(oldPath)) {
      this.rebuildSoon();
    }
  }

  handleModify(file) {
    if (!file || !file.path) return;

    if (file.path === this.whitelistPath || file.path === this.iconsPath) {
      this.reloadSoon();
      return;
    }

    if (this.iconSourcePaths.has(file.path)) {
      this.reloadSoon();
    }

    // 普通 Markdown 正文修改不在这里触发重扫。
    // frontmatter 的 status / visibility 是否真正变化，由 metadataCache changed 精确判断。
  }

  handleMetadataChange(file) {
    if (!(file instanceof TFile) || file.extension.toLowerCase() !== "md") return;
    if (!this.isPathWhitelisted(file.path)) return;

    const next = this.getNoteMetadata(file);
    const nextKey = `${next.status}|${next.visibility}`;

    if (!this.noteStatus.has(file.path) || this.noteStatus.get(file.path) !== nextKey) {
      this.rebuildSoon();
    }
  }

  getNoteMetadata(file) {
    const cache = this.app.metadataCache.getFileCache(file);
    const frontmatter = (cache && cache.frontmatter) || {};

    const statusValue = this.normalizeValue(frontmatter.status);
    const visibilityValue = this.normalizeValue(frontmatter.visibility);

    return {
      status: DONE_VALUES.has(statusValue) ? "done" : "undone",
      visibility: OPEN_VALUES.has(visibilityValue) ? "open" : "unopen"
    };
  }

  collectRows() {
    const rows = new Map();
    const invalidFiles = [];
    const nextNoteStatus = new Map();

    const walkFolder = (folder) => {
      const folderRow = {
        path: folder.path,
        type: "folder",
        hasMd: false,
        hasUndone: false,
        hasUnopen: false
      };

      rows.set(folder.path, folderRow);

      for (const child of folder.children) {
        if (child instanceof TFolder) {
          const childRow = walkFolder(child);
          if (childRow.hasMd) folderRow.hasMd = true;
          if (childRow.hasUndone) folderRow.hasUndone = true;
          if (childRow.hasUnopen) folderRow.hasUnopen = true;
          continue;
        }

        if (!(child instanceof TFile)) continue;

        if (child.extension.toLowerCase() !== "md") {
          invalidFiles.push(child.path);
          continue;
        }

        const metadata = this.getNoteMetadata(child);
        nextNoteStatus.set(child.path, `${metadata.status}|${metadata.visibility}`);

        const fileRow = {
          path: child.path,
          type: "file",
          status: metadata.status,
          unopen: metadata.visibility === "unopen"
        };

        rows.set(child.path, fileRow);

        folderRow.hasMd = true;
        if (metadata.status === "undone") folderRow.hasUndone = true;
        if (metadata.visibility === "unopen") folderRow.hasUnopen = true;
      }

      folderRow.status = folderRow.hasMd && !folderRow.hasUndone ? "done" : "undone";
      folderRow.unopen = folderRow.hasUnopen;
      return folderRow;
    };

    for (const rootPath of this.whitelistRoots) {
      const root = this.app.vault.getAbstractFileByPath(rootPath);

      if (!root) {
        continue;
      }

      if (!(root instanceof TFolder)) {
        console.warn(`xyblue135 私人·笔记状态： whitelist entry is not a folder: ${rootPath}`);
        continue;
      }

      walkFolder(root);
    }

    this.noteStatus = nextNoteStatus;
    return { rows, invalidFiles };
  }

  reportInvalidFiles(files, forceNotice = false) {
    const sorted = [...files].sort();
    const signature = sorted.join("\n");

    if (!forceNotice && signature === this.lastInvalidSignature) return;
    this.lastInvalidSignature = signature;

    if (sorted.length === 0) return;

    const preview = sorted.slice(0, 3).join("、");
    const more = sorted.length > 3 ? ` 等 ${sorted.length} 个` : "";
    const message =
      `xyblue135 私人·笔记状态：白名单目录检测到非 .md 文件：${preview}${more}。` +
      `请把 .jpg/.png/.pdf/.zip 等附件移出白名单目录。`;

    console.warn(message, sorted);
    new Notice(message, 9000);
  }

  sanitizeSvg(svg) {
    return String(svg)
      .replace(/<script\b[\s\S]*?<\/script>/gi, "")
      .replace(/\s+on[a-z]+\s*=\s*(['"])[\s\S]*?\1/gi, "");
  }

  svgToDataUri(svg) {
    const safe = this.sanitizeSvg(svg)
      .replace(/\r?\n/g, " ")
      .replace(/>\s+</g, "><");
    return `url("data:image/svg+xml;charset=UTF-8,${encodeURIComponent(safe)}")`;
  }

  makeSquareSvg(color, badge = false) {
    const stroke = badge ? ` stroke="#ffffff" stroke-width="1.2"` : "";
    const x = badge ? 1.2 : 2.5;
    const y = badge ? 1.2 : 2.5;
    const size = badge ? 5.6 : 11;
    const rx = badge ? 1.1 : 1.8;
    const vb = badge ? "0 0 8 8" : "0 0 16 16";

    return this.svgToDataUri(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">` +
      `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${rx}" fill="${color}"${stroke}/>` +
      `</svg>`
    );
  }

  makeCircleSvg(color, badge = false) {
    const vb = badge ? "0 0 8 8" : "0 0 16 16";
    const cx = badge ? 4 : 8;
    const cy = badge ? 4 : 8;
    const r = badge ? 3 : 5.8;
    const stroke = badge ? ` stroke="#ffffff" stroke-width="1.2"` : "";

    return this.svgToDataUri(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">` +
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}"${stroke}/>` +
      `</svg>`
    );
  }

  cssString(value) {
    return String(value)
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\A ");
  }

  selectors(path, type, pseudo) {
    const p = this.cssString(path);
    const native =
      type === "folder"
        ? `.workspace-leaf-content[data-type="file-explorer"] .nav-folder-title[data-path="${p}"] > .nav-folder-title-content::${pseudo}`
        : `.workspace-leaf-content[data-type="file-explorer"] .nav-file-title[data-path="${p}"] > .nav-file-title-content::${pseudo}`;

    const fallback =
      `.workspace-leaf-content[data-type="file-explorer"] .tree-item-self[data-path="${p}"] > .tree-item-inner::${pseudo}`;

    return `${native},\n${fallback}`;
  }

  buildCss(rows) {
    const lines = [
      "/* xyblue135 私人 · 笔记状态 - whitelist only */",
      ".workspace-leaf-content[data-type=\"file-explorer\"] .nav-folder-title-content,",
      ".workspace-leaf-content[data-type=\"file-explorer\"] .nav-file-title-content,",
      ".workspace-leaf-content[data-type=\"file-explorer\"] .tree-item-self[data-path] > .tree-item-inner {",
      "  display: flex !important;",
      "  align-items: center !important;",
      "}"
    ];

    for (const row of rows.values()) {
      const color = row.status === "done" ? COLORS.done : COLORS.undone;
      const customSvg = this.iconMap.get(row.path);
      const before = this.selectors(row.path, row.type, "before");

      if (customSvg) {
        const customUri = this.svgToDataUri(customSvg);
        const badgeUri =
          row.type === "folder"
            ? this.makeSquareSvg(color, true)
            : this.makeCircleSvg(color, true);

        lines.push(
          `${before} {`,
          `  content: "";`,
          `  display: inline-block !important;`,
          `  width: ${SVG_SIZE}px;`,
          `  height: ${SVG_SIZE}px;`,
          `  min-width: ${SVG_SIZE}px;`,
          `  background-image: ${badgeUri}, ${customUri};`,
          `  background-size: 7px 7px, contain;`,
          `  background-repeat: no-repeat, no-repeat;`,
          `  background-position: right bottom, center;`,
          `  margin-right: 6px;`,
          `  pointer-events: none;`,
          `  opacity: 0.92;`,
          `  flex-shrink: 0;`,
          `}`
        );
      } else {
        const statusUri =
          row.type === "folder"
            ? this.makeSquareSvg(color, false)
            : this.makeCircleSvg(color, false);

        lines.push(
          `${before} {`,
          `  content: "";`,
          `  display: inline-block !important;`,
          `  width: ${SVG_SIZE}px;`,
          `  height: ${SVG_SIZE}px;`,
          `  min-width: ${SVG_SIZE}px;`,
          `  background-image: ${statusUri};`,
          `  background-size: contain;`,
          `  background-repeat: no-repeat;`,
          `  background-position: center;`,
          `  margin-right: 6px;`,
          `  pointer-events: none;`,
          `  opacity: 0.74;`,
          `  flex-shrink: 0;`,
          `}`
        );
      }

      if (row.unopen && row.type === "file") {
        const after = this.selectors(row.path, row.type, "after");
        const lockUri = this.svgToDataUri(LOCK_SVG);
        lines.push(
          `${after} {`,
          `  content: "";`,
          `  display: inline-block !important;`,
          `  width: ${SVG_SIZE}px;`,
          `  height: ${SVG_SIZE}px;`,
          `  min-width: ${SVG_SIZE}px;`,
          `  background-image: ${lockUri};`,
          `  background-size: contain;`,
          `  background-repeat: no-repeat;`,
          `  background-position: center;`,
          `  margin-left: 4px;`,
          `  opacity: 0.78;`,
          `  pointer-events: none;`,
          `  flex-shrink: 0;`,
          `}`
        );
      }
    }

    return lines.join("\n");
  }

  rebuildStyles() {
    if (!this.styleEl) return;

    const { rows, invalidFiles } = this.collectRows();
    this.reportInvalidFiles(invalidFiles, false);

    const css = this.buildCss(rows);
    if (this.styleEl.textContent === css) return;

    this.styleEl.textContent = css;
  }
};
