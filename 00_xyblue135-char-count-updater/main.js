/*
 * xyblue135 私人 · Token 统计
 * 类型：xyblue135 私人插件（非公共发布版）
 * 说明：用户可见文案与维护注释已中文化；内部插件 ID 与 data.json 保持不变，以兼容原有设置和数据。
 * v4.0.0：移除 char_count 字段统计；移除全部黑名单配置（全局 / 忽略文件夹 / 字段级），
 *         改为白名单机制——仅处理白名单目录下的 Markdown（默认 00_docs 及其子笔记）。
 */
"use strict";

const {
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  normalizePath,
} = require("obsidian");

const DEFAULT_SETTINGS = {
  debounceMs: 5000,
  // 白名单：每行一个路径，可写文件夹（含全部子笔记）或单个文件；为空则不处理任何文件
  whitelist: "00_docs",
  enableTokenCount: true,
  splitTokenCount: true,
  unifiedTokenFactor: 0.55,
  chineseTokenFactor: 0.5,
  englishTokenFactor: 0.25,
  flushOnFileSwitch: true,
  flushOnWindowBlur: true,
};

const MIN_DEBOUNCE_MS = 250;
const MAX_DEBOUNCE_MS = 60000;
const MIN_TOKEN_FACTOR = 0;
const MAX_TOKEN_FACTOR = 5;
const INTERNAL_WRITE_TIMEOUT_MS = 5000;

class CharCountUpdaterPlugin extends Plugin {
  async onload() {
    await this.loadSettings();

    this.pendingUpdates = new Map();
    this.updateChains = new Map();
    this.internalWrites = new Map();

    this.addSettingTab(new CharCountSettingTab(this.app, this));

    this.app.workspace.onLayoutReady(() => {
      this.registerVaultEvents();
      this.registerFlushEvents();
    });
  }

  onunload() {
    for (const entry of this.pendingUpdates.values()) {
      clearTimeout(entry.timer);
    }

    this.pendingUpdates.clear();
    this.updateChains.clear();
    this.internalWrites.clear();
  }

  registerVaultEvents() {
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (!(file instanceof TFile) || file.extension !== "md") {
          return;
        }

        if (!this.isWhitelisted(file.path) || this.consumeInternalWrite(file.path)) {
          return;
        }

        this.scheduleUpdate(file);
      })
    );

    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (!(file instanceof TFile) || file.extension !== "md") {
          return;
        }

        if (this.isWhitelisted(file.path)) {
          this.scheduleUpdate(file);
        }
      })
    );

    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        this.clearPathState(oldPath);

        if (file instanceof TFile) {
          this.clearPathState(file.path);
        }
      })
    );

    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        if (file instanceof TFile) {
          this.clearPathState(file.path);
        }
      })
    );
  }

  registerFlushEvents() {
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        if (this.settings.flushOnFileSwitch) {
          void this.flushPendingUpdates();
        }
      })
    );

    this.registerDomEvent(window, "blur", () => {
      if (this.settings.flushOnWindowBlur) {
        void this.flushPendingUpdates();
      }
    });
  }

  clearPathState(path) {
    const pending = this.pendingUpdates.get(path);
    if (pending) {
      clearTimeout(pending.timer);
      this.pendingUpdates.delete(path);
    }

    this.updateChains.delete(path);
    this.internalWrites.delete(path);
  }

  scheduleUpdate(file) {
    const previous = this.pendingUpdates.get(file.path);

    if (previous) {
      clearTimeout(previous.timer);
    }

    const timer = setTimeout(() => {
      this.pendingUpdates.delete(file.path);
      void this.enqueueUpdate(file);
    }, this.settings.debounceMs);

    this.pendingUpdates.set(file.path, {
      file,
      timer,
    });
  }

  async flushPendingUpdates() {
    const entries = Array.from(this.pendingUpdates.values());
    this.pendingUpdates.clear();

    for (const entry of entries) {
      clearTimeout(entry.timer);
    }

    await Promise.all(
      entries.map((entry) => this.enqueueUpdate(entry.file))
    );
  }

  enqueueUpdate(file) {
    const previous = this.updateChains.get(file.path) ?? Promise.resolve();

    const next = previous
      .catch(() => undefined)
      .then(() => this.updateFile(file))
      .catch(() => undefined)
      .finally(() => {
        if (this.updateChains.get(file.path) === next) {
          this.updateChains.delete(file.path);
        }
      });

    this.updateChains.set(file.path, next);
    return next;
  }

  consumeInternalWrite(path) {
    const until = this.internalWrites.get(path);

    if (!until) {
      return false;
    }

    this.internalWrites.delete(path);
    return Date.now() <= until;
  }

  markInternalWrite(path) {
    this.internalWrites.set(path, Date.now() + INTERNAL_WRITE_TIMEOUT_MS);
  }

  // ── 路径解析工具 ──────────────────────────────────────

  parsePathList(raw) {
    if (!raw || typeof raw !== "string") {
      return [];
    }
    return raw
      .split(/\r?\n/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => normalizePath(p).replace(/\/$/, ""));
  }

  pathMatches(path, entry) {
    const normalized = normalizePath(path);
    // 精确匹配文件路径
    if (normalized === entry) {
      return true;
    }
    // 前缀匹配文件夹路径（含其全部子笔记）
    if (normalized.startsWith(entry + "/")) {
      return true;
    }
    return false;
  }

  pathMatchesAny(path, entries) {
    return entries.some((entry) => this.pathMatches(path, entry));
  }

  // ── 白名单（处理范围） ────────────────────────────────

  getWhitelist() {
    return this.parsePathList(this.settings.whitelist);
  }

  isWhitelisted(path) {
    const entries = this.getWhitelist();
    if (entries.length === 0) {
      return false;
    }
    return this.pathMatchesAny(path, entries);
  }

  // ── Frontmatter 解析 ──────────────────────────────────

  getFrontmatterMatch(content) {
    const bomOffset = content.charCodeAt(0) === 0xfeff ? 1 : 0;
    const source = content.slice(bomOffset);
    const match = source.match(
      /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/
    );

    return match
      ? {
          source,
          full: match[0],
          block: match[1],
        }
      : null;
  }

  extractBody(content) {
    const frontmatter = this.getFrontmatterMatch(content);
    const source = frontmatter
      ? frontmatter.source.slice(frontmatter.full.length)
      : content.charCodeAt(0) === 0xfeff
        ? content.slice(1)
        : content;

    return source.replace(/\r\n/g, "\n");
  }

  hasFrontmatterKey(content, key) {
    const frontmatter = this.getFrontmatterMatch(content);

    if (!frontmatter) {
      return false;
    }

    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`^${escapedKey}\\s*:`, "m").test(frontmatter.block);
  }

  readFrontmatterValue(content, key) {
    const frontmatter = this.getFrontmatterMatch(content);

    if (!frontmatter) {
      return undefined;
    }

    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = frontmatter.block.match(
      new RegExp(`^${escapedKey}\\s*:\\s*(.*?)\\s*$`, "m")
    );

    if (!match) {
      return undefined;
    }

    const value = match[1].trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      return value.slice(1, -1);
    }

    return value;
  }

  isHanCodePoint(codePoint) {
    return (
      (codePoint >= 0x3400 && codePoint <= 0x4dbf) ||
      (codePoint >= 0x4e00 && codePoint <= 0x9fff) ||
      (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
      (codePoint >= 0x20000 && codePoint <= 0x2ebef) ||
      (codePoint >= 0x2f800 && codePoint <= 0x2fa1f)
    );
  }

  analyzeBody(body) {
    let charCount = 0;
    let chineseCount = 0;

    for (const character of body) {
      charCount += 1;

      if (this.isHanCodePoint(character.codePointAt(0))) {
        chineseCount += 1;
      }
    }

    return {
      charCount,
      chineseCount,
      englishCount: charCount - chineseCount,
    };
  }

  calculateTokenCount(stats) {
    if (this.settings.splitTokenCount) {
      return Math.round(
        stats.chineseCount * this.settings.chineseTokenFactor +
          stats.englishCount * this.settings.englishTokenFactor
      );
    }

    return Math.round(stats.charCount * this.settings.unifiedTokenFactor);
  }

  async updateFile(file) {
    if (!(file instanceof TFile) || file.extension !== "md") {
      return;
    }

    if (!this.settings.enableTokenCount || !this.isWhitelisted(file.path)) {
      return;
    }

    const content = await this.app.vault.cachedRead(file);
    const frontmatter = this.getFrontmatterMatch(content);

    if (!frontmatter) {
      return;
    }

    // 只修改已存在的 token_count，字段不存在时直接跳过
    if (!this.hasFrontmatterKey(content, "token_count")) {
      return;
    }

    const body = this.extractBody(content);
    const stats = this.analyzeBody(body);
    const tokenCount = this.calculateTokenCount(stats);

    const existingTokenCount = Number.parseInt(
      this.readFrontmatterValue(content, "token_count") ?? "",
      10
    );

    if (existingTokenCount === tokenCount) {
      return;
    }

    this.markInternalWrite(file.path);

    await this.app.fileManager.processFrontMatter(file, (metadata) => {
      metadata.token_count = tokenCount;
    });
  }

  validateNumber(value, fallback, min, max) {
    const number = Number.parseFloat(value);

    if (!Number.isFinite(number)) {
      return fallback;
    }

    return Math.min(Math.max(number, min), max);
  }

  validateSettings(settings) {
    return {
      debounceMs: Math.round(
        this.validateNumber(
          settings.debounceMs,
          DEFAULT_SETTINGS.debounceMs,
          MIN_DEBOUNCE_MS,
          MAX_DEBOUNCE_MS
        )
      ),
      whitelist:
        typeof settings.whitelist === "string"
          ? settings.whitelist
          : DEFAULT_SETTINGS.whitelist,
      enableTokenCount:
        settings.enableTokenCount === undefined
          ? DEFAULT_SETTINGS.enableTokenCount
          : Boolean(settings.enableTokenCount),
      splitTokenCount:
        settings.splitTokenCount === undefined
          ? DEFAULT_SETTINGS.splitTokenCount
          : Boolean(settings.splitTokenCount),
      unifiedTokenFactor: this.validateNumber(
        settings.unifiedTokenFactor,
        DEFAULT_SETTINGS.unifiedTokenFactor,
        MIN_TOKEN_FACTOR,
        MAX_TOKEN_FACTOR
      ),
      chineseTokenFactor: this.validateNumber(
        settings.chineseTokenFactor,
        DEFAULT_SETTINGS.chineseTokenFactor,
        MIN_TOKEN_FACTOR,
        MAX_TOKEN_FACTOR
      ),
      englishTokenFactor: this.validateNumber(
        settings.englishTokenFactor,
        DEFAULT_SETTINGS.englishTokenFactor,
        MIN_TOKEN_FACTOR,
        MAX_TOKEN_FACTOR
      ),
      flushOnFileSwitch:
        settings.flushOnFileSwitch === undefined
          ? DEFAULT_SETTINGS.flushOnFileSwitch
          : Boolean(settings.flushOnFileSwitch),
      flushOnWindowBlur:
        settings.flushOnWindowBlur === undefined
          ? DEFAULT_SETTINGS.flushOnWindowBlur
          : Boolean(settings.flushOnWindowBlur),
    };
  }

  async loadSettings() {
    this.settings = this.validateSettings((await this.loadData()) ?? {});
  }

  async saveSettings() {
    this.settings = this.validateSettings(this.settings);
    await this.saveData(this.settings);
  }
}

class CharCountSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "xyblue135 私人 · Token 统计" });
    containerEl.createEl("p", {
      text: "插件只修改 YAML 中已经存在的 token_count 字段，绝不会创建字段或 frontmatter。",
      cls: "setting-item-description",
    });

    // ═══ ① 白名单（处理范围）═══
    containerEl.createEl("h3", { text: "① 白名单（处理范围）" });
    containerEl.createEl("p", {
      text: "只有白名单命中的文件才会被处理，其余一律跳过。每行一个 Vault 相对路径：写文件夹则包含其全部子笔记，写具体 .md 则是单个文件。白名单为空时不处理任何文件。",
      cls: "setting-item-description",
    });

    new Setting(containerEl)
      .setName("白名单目录 / 文件")
      .setDesc("默认 00_docs（含其下全部子笔记）。每行一个路径，例如 00_docs")
      .addTextArea((text) =>
        text
          .setPlaceholder("00_docs")
          .setValue(this.plugin.settings.whitelist)
          .onChange(async (value) => {
            this.plugin.settings.whitelist = value;
            await this.plugin.saveSettings();
          })
      );

    // ═══ ② token_count 总开关 ═══
    containerEl.createEl("h3", { text: "② token_count 总开关" });

    new Setting(containerEl)
      .setName("Token 估算 · token_count")
      .setDesc("【开】编辑后更新 Token 估算值（依赖下方倍率设置）；【关】完全不碰此字段。默认开。")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableTokenCount)
          .onChange(async (value) => {
            this.plugin.settings.enableTokenCount = value;
            await this.plugin.saveSettings();
          })
      );

    // ═══ ③ Token 估算参数（仅 token_count 开启时生效）═══
    containerEl.createEl("h3", { text: "③ Token 估算参数（仅 token_count 开启时生效）" });

    new Setting(containerEl)
      .setName("中英文分别估算")
      .setDesc("开启后：中文字符 × 中文倍率 + 英文及其他字符 × 英文倍率；关闭后使用统一倍率")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.splitTokenCount)
          .onChange(async (value) => {
            this.plugin.settings.splitTokenCount = value;
            await this.plugin.saveSettings();
            this.display();
          })
      );

    if (this.plugin.settings.splitTokenCount) {
      new Setting(containerEl)
        .setName("中文字符倍率")
        .setDesc("默认 0.50；识别 Unicode 汉字，包含常用字和扩展区汉字")
        .addText((text) =>
          text
            .setPlaceholder("0.50")
            .setValue(String(this.plugin.settings.chineseTokenFactor))
            .onChange(async (value) => {
              this.plugin.settings.chineseTokenFactor = value;
              await this.plugin.saveSettings();
            })
        );

      new Setting(containerEl)
        .setName("英文及其他字符倍率")
        .setDesc("默认 0.25；用于英文、数字、空格、标点、Markdown 和代码字符")
        .addText((text) =>
          text
            .setPlaceholder("0.25")
            .setValue(String(this.plugin.settings.englishTokenFactor))
            .onChange(async (value) => {
              this.plugin.settings.englishTokenFactor = value;
              await this.plugin.saveSettings();
            })
        );
    } else {
      new Setting(containerEl)
        .setName("统一 Token 倍率")
        .setDesc("默认 0.55；token_count = 正文 Unicode 字符数 × 统一倍率")
        .addText((text) =>
          text
            .setPlaceholder("0.55")
            .setValue(String(this.plugin.settings.unifiedTokenFactor))
            .onChange(async (value) => {
              this.plugin.settings.unifiedTokenFactor = value;
              await this.plugin.saveSettings();
            })
        );
    }

    // ═══ ④ 自动更新节奏 ═══
    containerEl.createEl("h3", { text: "④ 自动更新节奏" });

    new Setting(containerEl)
      .setName("防抖延迟（毫秒）")
      .setDesc("停止编辑后多久更新；建议 3000～8000")
      .addText((text) =>
        text
          .setPlaceholder("5000")
          .setValue(String(this.plugin.settings.debounceMs))
          .onChange(async (value) => {
            this.plugin.settings.debounceMs = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("切换文件时立即更新")
      .setDesc("切换笔记时立即处理仍在防抖等待中的文件")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.flushOnFileSwitch)
          .onChange(async (value) => {
            this.plugin.settings.flushOnFileSwitch = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("窗口失焦时立即更新")
      .setDesc("切换到其他应用时处理仍在防抖等待中的文件")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.flushOnWindowBlur)
          .onChange(async (value) => {
            this.plugin.settings.flushOnWindowBlur = value;
            await this.plugin.saveSettings();
          })
      );
  }
}

module.exports = CharCountUpdaterPlugin;
