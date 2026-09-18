/*
 * xyblue135 私人 · 文件夹模板笔记
 * 类型：xyblue135 私人插件（非公共发布版）
 * 说明：用户可见文案与维护注释已中文化；内部插件 ID 与 data.json 保持不变，以兼容原有设置和数据。
 */
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const obsidian_1 = require("obsidian");

/** 插件自带的默认笔记模板。用户可以在设置页中直接修改。 */
const DEFAULT_TEMPLATE = "---\nsummary:\ntags: []\ncreated: {{timestamp}}\nupdated: {{timestamp}}\nstatus: undone\nvisibility: unopen\nchar_count: 0\ntoken_count: 0\n---\n\n";
/** 插件默认设置。首次安装或缺少字段时会使用这些值。 */
const DEFAULT_SETTINGS = {
    menuEmoji: "📝",
    noteTemplate: DEFAULT_TEMPLATE,
    // 状态栏（左侧 ribbon）快捷入口的目标文件夹。留空表示仓库根目录。
    targetFolder: "/待分类",
};
/**
 * 左侧 ribbon 与右键菜单统一使用「Emoji 图标」：取自设置中的 menuEmoji（默认 📝）。
 * Emoji 本身自带配色，天然适配浅色 / 深色主题，无需额外处理。
 */
/**
 * xyblue135 私人 · 文件夹模板笔记 主插件。
 *
 * 功能：
 * 1. 监听文件浏览器右键菜单。
 * 2. 仅在右键文件夹时显示“新建模板笔记”。
 * 3. 使用设置页中保存的模板生成新笔记。
 * 4. 模板默认提供一套 YAML Frontmatter，但用户可以随时修改。
 * 5. 不依赖 Templater。
 */
class FolderTemplateNotePlugin extends obsidian_1.Plugin {
    constructor() {
        super(...arguments);
        this.settings = { ...DEFAULT_SETTINGS };
    }
    /** 插件加载时执行。 */
    async onload() {
        await this.loadSettings();
        // 注册插件设置页，用于修改菜单 Emoji / Unicode、元数据模板和快捷入口目标文件夹。
        this.addSettingTab(new FolderTemplateNoteSettingTab(this.app, this));
        // 在左侧 ribbon（状态栏快捷入口）添加一个快捷方式，点击后快速创建模板笔记。
        // 图标用 Emoji（取自设置 menuEmoji，默认 📝），天然适配浅色 / 深色主题。
        // 目标文件夹由设置中的 targetFolder 决定，默认是仓库根目录的 /待分类。
        const ribbonEl = this.addRibbonIcon("file-plus-2", this.getRibbonTooltip(), async () => {
            const folder = await this.resolveTargetFolder();
            if (!folder) {
                return;
            }
            new NoteNameModal(this.app, folder, this.getMenuTitle(), async (name) => {
                await this.createTemplateNote(folder, name);
            }).open();
        });
        // 把 ribbon 里默认的线条图标替换成 Emoji。
        const ribbonEmoji = this.getMenuEmoji();
        if (ribbonEl) {
            ribbonEl.empty();
            ribbonEl.setText(ribbonEmoji);
            ribbonEl.addClass("xyblue135-ribbon-emoji");
        }
        // 监听文件浏览器的右键菜单。
        this.registerEvent(this.app.workspace.on("file-menu", (menu, file) => {
            // 只处理文件夹；右键普通 Markdown 文件时不显示此菜单项。
            if (!(file instanceof obsidian_1.TFolder)) {
                return;
            }
            const emoji = this.getMenuEmoji();
            menu.addItem((item) => {
                item
                    .setTitle(this.getMenuTitle())
                    .onClick(() => {
                    // 点击菜单后弹出笔记名称输入框。
                    new NoteNameModal(this.app, file, this.getMenuTitle(), async (name) => {
                        await this.createTemplateNote(file, name);
                    }).open();
                });
                // 把菜单项前面的线条图标换成 Emoji。
                const iconContainer = item.dom?.querySelector(".menu-item-icon");
                if (iconContainer) {
                    iconContainer.empty();
                    iconContainer.setText(emoji);
                }
            });
        }));
    }
    /**
     * 从 data.json 中读取插件设置。
     *
     * 旧版本只有 menuEmoji，没有 noteTemplate。
     * Object.assign 会自动给旧配置补上默认模板，因此升级不会丢失原设置。
     */
    async loadSettings() {
        const saved = (await this.loadData());
        const hasValidMenuEmoji = typeof saved?.menuEmoji === "string";
        const hasValidNoteTemplate = typeof saved?.noteTemplate === "string";
        const hasValidTargetFolder = typeof saved?.targetFolder === "string";
        this.settings = Object.assign({}, DEFAULT_SETTINGS, saved ?? {});
        // 防止用户手动修改 data.json 后出现非字符串值。
        if (!hasValidMenuEmoji) {
            this.settings.menuEmoji = DEFAULT_SETTINGS.menuEmoji;
        }
        if (!hasValidNoteTemplate) {
            this.settings.noteTemplate = DEFAULT_TEMPLATE;
        }
        if (!hasValidTargetFolder) {
            this.settings.targetFolder = DEFAULT_SETTINGS.targetFolder;
        }
        // 首次安装或从旧版本升级时，把缺少的默认字段真正写入 data.json。
        // 这样设置页显示的内容与插件实际保存的数据始终保持一致。
        if (!hasValidMenuEmoji || !hasValidNoteTemplate || !hasValidTargetFolder) {
            await this.saveSettings();
        }
    }
    /** 保存插件设置到 data.json。 */
    async saveSettings() {
        await this.saveData(this.settings);
    }
    /** 把元数据模板恢复成插件自带的默认预设。 */
    async resetTemplate() {
        this.settings.noteTemplate = DEFAULT_TEMPLATE;
        await this.saveSettings();
    }
    /**
     * 读取要在图标上显示的 Emoji。
     * 来自设置中的 menuEmoji；若留空则回退到默认 📝，保证图标永远有内容。
     */
    getMenuEmoji() {
        const emoji = this.settings.menuEmoji.trim();
        return emoji || "📝";
    }
    /**
     * 根据设置生成菜单 / 弹窗标题。
     * Emoji 现在作为图标显示，所以标题这里只保留文字“新建模板笔记”，避免重复。
     */
    getMenuTitle() {
        return "新建模板笔记";
    }
    /**
     * 生成左侧 ribbon 图标的悬停提示。
     * 提示里带上当前的目标文件夹路径，让用户一眼看清笔记会创建到哪里。
     */
    getRibbonTooltip() {
        const target = this.getDisplayTargetPath();
        return `新建模板笔记（快捷入口 → ${target}）`;
    }
    /**
     * 把设置中的目标文件夹路径整理成展示用的字符串。
     * 空 / “/” / “.” 都视为仓库根目录，展示为 “/”。
     */
    getDisplayTargetPath() {
        const raw = (this.settings.targetFolder || "").trim();
        if (!raw || raw === "/" || raw === ".") {
            return "/";
        }
        const normalized = (0, obsidian_1.normalizePath)(raw);
        return normalized.startsWith("/") ? normalized : `/${normalized}`;
    }
    /**
     * 解析“状态栏快捷入口”要使用的目标文件夹。
     *
     * - 文件夹已存在：直接返回。
     * - 目标路径是个文件（不是文件夹）：报错并返回 null。
     * - 文件夹不存在：自动创建（支持多级路径），再返回。
     * - 路径为空 / “/” / “.”：返回仓库根目录。
     */
    async resolveTargetFolder() {
        const raw = (this.settings.targetFolder || "").trim();
        if (!raw || raw === "/" || raw === ".") {
            return this.app.vault.getRoot();
        }
        const normalized = (0, obsidian_1.normalizePath)(raw);
        const existing = this.app.vault.getAbstractFileByPath(normalized);
        if (existing instanceof obsidian_1.TFolder) {
            return existing;
        }
        if (existing) {
            new obsidian_1.Notice(`目标路径不是文件夹，无法创建笔记：${normalized}`);
            return null;
        }
        try {
            await this.app.vault.createFolder(normalized);
        }
        catch (error) {
            console.error("[xyblue135 私人·文件夹模板笔记] 创建目标文件夹失败：", error);
            new obsidian_1.Notice(`创建目标文件夹失败：${normalized}`);
            return null;
        }
        const created = this.app.vault.getAbstractFileByPath(normalized);
        if (!(created instanceof obsidian_1.TFolder)) {
            new obsidian_1.Notice(`目标文件夹解析失败：${normalized}`);
            return null;
        }
        return created;
    }
    /** 在指定文件夹中创建一篇带模板内容的新笔记。 */
    async createTemplateNote(folder, rawName) {
        const filename = this.normalizeNoteName(rawName);
        if (!filename) {
            new obsidian_1.Notice("请输入有效的笔记名称");
            return;
        }
        // 创建文件前先检查文件名是否合法，避免 Windows 下出现创建失败。
        const validationError = this.validateNoteName(filename);
        if (validationError) {
            new obsidian_1.Notice(validationError);
            return;
        }
        // 拼接目标 Markdown 文件路径。
        const path = (0, obsidian_1.normalizePath)(folder.path ? `${folder.path}/${filename}.md` : `${filename}.md`);
        // 已存在同名文件时不覆盖原文件。
        if (this.app.vault.getAbstractFileByPath(path)) {
            new obsidian_1.Notice(`文件已经存在：${path}`);
            return;
        }
        // 根据当前文件夹、文件名和时间渲染用户在设置中保存的模板。
        const content = this.renderTemplate(folder, filename);
        try {
            const file = await this.app.vault.create(path, content);
            // 创建成功后立即打开新笔记。
            await this.app.workspace.getLeaf(false).openFile(file);
            new obsidian_1.Notice(`已创建：${file.path}`);
        }
        catch (error) {
            console.error("[xyblue135 私人·文件夹模板笔记] 创建模板笔记失败：", error);
            new obsidian_1.Notice("创建模板笔记失败，请查看开发者控制台日志");
        }
    }
    /**
     * 清理用户输入的笔记名。
     * 如果用户手动输入了 .md，则自动去掉扩展名，避免生成 xxx.md.md。
     */
    normalizeNoteName(rawName) {
        let name = rawName.trim();
        if (name.toLowerCase().endsWith(".md")) {
            name = name.slice(0, -3).trim();
        }
        return name;
    }
    /** 检查笔记文件名是否包含 Windows 不允许使用的字符或保留名称。 */
    validateNoteName(name) {
        if (!name || name === "." || name === "..") {
            return "请输入有效的笔记名称";
        }
        if (/[\\/:*?"<>|]/.test(name)) {
            return '文件名不能包含 \\ / : * ? " < > |';
        }
        if (/[. ]$/.test(name)) {
            return "文件名不能以句点或空格结尾";
        }
        const windowsReserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
        if (windowsReserved.test(name)) {
            return "该文件名是 Windows 保留名称，请换一个名称";
        }
        return null;
    }
    /**
     * 渲染设置页中保存的模板。
     *
     * 当前支持：
     * {{folder}}    当前文件夹名称
     * {{filename}}  新笔记文件名（不含 .md）
     * {{path}}      当前文件夹路径
     * {{datetime}}  当前日期时间，格式 YYYY-MM-DDTHH
     * {{date}}      当前日期，格式 YYYY-MM-DD
     * {{time}}      当前时间，格式 HH:mm
     * {{timestamp}} 17 位时间戳，格式 yyyyMMddHHmmssSSS（如 20240118021618010）
     *
     * 未识别的 {{变量}} 会原样保留，方便以后扩展。
     */
    renderTemplate(folder, filename) {
        // 如果是在仓库根目录创建，则使用 Vault 名称作为 folder。
        const folderName = folder.path ? folder.name : this.app.vault.getName();
        const now = (0, obsidian_1.moment)();
        const variables = {
            folder: folderName,
            filename,
            path: folder.path,
            datetime: now.format("YYYY-MM-DDTHH"),
            date: now.format("YYYY-MM-DD"),
            time: now.format("HH:mm"),
            timestamp: now.format("YYYYMMDDHHmmssSSS"),
        };
        return this.settings.noteTemplate.replace(/\{\{(folder|filename|path|datetime|date|time|timestamp)\}\}/g, (_match, key) => {
            if (key === "timestamp") {
                // 17 位时间戳直接以裸值写入，不套引号，方便当数字 / 唯一标识使用。
                return variables[key] ?? "";
            }
            return this.toYamlString(variables[key] ?? "");
        });
    }
    /**
     * 把普通字符串转换成安全的 YAML 字符串。
     * 例如文件夹名称中包含冒号、# 等特殊字符时，也不容易破坏 Frontmatter。
     *
     * 因此模板里写 summary: {{folder}} 即可，不需要自己再给变量套引号。
     */
    toYamlString(value) {
        return JSON.stringify(value);
    }
}
exports.default = FolderTemplateNotePlugin;
/** 新建模板笔记时用于输入文件名的弹窗。 */
class NoteNameModal extends obsidian_1.Modal {
    constructor(app, folder, modalTitle, onSubmit) {
        super(app);
        this.folder = folder;
        this.modalTitle = modalTitle;
        this.onSubmit = onSubmit;
        /** 用户当前输入的笔记名称。 */
        this.noteName = "";
        /** 防止连续按回车或连续点击“创建”导致重复提交。 */
        this.submitting = false;
    }
    /** 弹窗打开时构建界面。 */
    onOpen() {
        this.titleEl.setText(this.modalTitle);
        const targetPath = this.folder.path || "/";
        new obsidian_1.Setting(this.contentEl)
            .setName("笔记名称")
            .setDesc(`创建到：${targetPath}`)
            .addText((text) => {
            text
                .setPlaceholder("例如：Selenium 基础")
                .onChange((value) => {
                this.noteName = value;
            });
            text.inputEl.addClass("xyblue135-template-note-name-input");
            // 在输入框中按回车即可直接创建笔记。
            text.inputEl.addEventListener("keydown", (event) => {
                // 输入法正在组合中文时，不把 Enter 当成提交操作。
                if (event.key === "Enter" && !event.isComposing) {
                    event.preventDefault();
                    void this.submit();
                }
            });
            // 弹窗打开后自动把焦点放进输入框。
            window.setTimeout(() => text.inputEl.focus(), 0);
        });
        new obsidian_1.Setting(this.contentEl).addButton((button) => {
            button
                .setButtonText("创建")
                .setCta()
                .onClick(() => {
                void this.submit();
            });
        });
    }
    /** 弹窗关闭时清理 DOM。 */
    onClose() {
        this.contentEl.empty();
    }
    /** 提交用户输入的笔记名称。 */
    async submit() {
        if (this.submitting) {
            return;
        }
        const name = this.noteName.trim();
        if (!name) {
            new obsidian_1.Notice("请输入笔记名称");
            return;
        }
        this.submitting = true;
        this.close();
        try {
            await this.onSubmit(name);
        }
        finally {
            this.submitting = false;
        }
    }
}
/** 插件设置页。 */
class FolderTemplateNoteSettingTab extends obsidian_1.PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }
    /** 渲染插件设置界面。 */
    display() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl("h2", { text: "xyblue135 私人 · 文件夹模板笔记" });
        new obsidian_1.Setting(containerEl)
            .setName("菜单 Emoji / Unicode")
            .setDesc("显示在“新建模板笔记”前面的字符。可以输入 📝、📄、✍️、🧩 等，也可以留空。")
            .addText((text) => {
            text
                .setPlaceholder("📝")
                .setValue(this.plugin.settings.menuEmoji)
                .onChange(async (value) => {
                this.plugin.settings.menuEmoji = value;
                await this.plugin.saveSettings();
            });
        });
        new obsidian_1.Setting(containerEl)
            .setName("状态栏快捷入口 · 目标文件夹")
            .setDesc("点按左侧状态栏（ribbon）图标时，新笔记会创建到这个文件夹。留空表示仓库根目录。路径用 / 分隔，例如 待分类 或 项目/草稿。文件夹不存在时会自动创建。")
            .addText((text) => {
            text
                .setPlaceholder("/待分类")
                .setValue(this.plugin.settings.targetFolder)
                .onChange(async (value) => {
                this.plugin.settings.targetFolder = value.trim();
                await this.plugin.saveSettings();
            });
        });
        containerEl.createEl("h3", { text: "笔记元数据模板" });
        containerEl.createEl("p", {
            text: "下面就是当前实际使用的模板。修改后会自动保存；以后新建的笔记都会使用这里的内容。",
            cls: "setting-item-description",
        });
        new obsidian_1.Setting(containerEl)
            .setName("模板内容")
            .setDesc("默认是插件预设。支持 {{folder}}、{{filename}}、{{path}}、{{datetime}}、{{date}}、{{time}}、{{timestamp}}（17 位时间戳 yyyyMMddHHmmssSSS）。变量外不要额外加引号。")
            .addTextArea((textArea) => {
            textArea
                .setPlaceholder(DEFAULT_TEMPLATE)
                .setValue(this.plugin.settings.noteTemplate)
                .onChange(async (value) => {
                // 每次修改都保存到 data.json，不需要额外点击保存按钮。
                this.plugin.settings.noteTemplate = value;
                await this.plugin.saveSettings();
            });
            textArea.inputEl.rows = 16;
            textArea.inputEl.addClass("xyblue135-template-note-template-input");
        })
            .addButton((button) => {
            button
                .setButtonText("恢复默认模板")
                .setWarning()
                .onClick(async () => {
                await this.plugin.resetTemplate();
                new obsidian_1.Notice("已恢复默认元数据模板");
                // 重新渲染设置页，让文本框立刻显示恢复后的模板。
                this.display();
            });
        });
        const variablesEl = containerEl.createDiv({
            cls: "xyblue135-template-note-variable-help",
        });
        variablesEl.createEl("strong", { text: "可用变量：" });
        variablesEl.createEl("code", {
            text: "{{folder}}  {{filename}}  {{path}}  {{datetime}}  {{date}}  {{time}}  {{timestamp}}",
        });
    }
}

// Obsidian 插件入口需要直接导出插件类。
module.exports = exports.default;
