"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const obsidian_1 = require("obsidian");
const DEFAULT_REQUIRED_FIELDS = [
    'status',
    'visibility',
    'updated',
    'token_count',
    'AI_title',
    'AI_tags',
    'AI_summary_short',
    'AI_summary_long',
    'AI_technical_depth',
    'AI_take',
    'AI_qa',
];
function hasData(value) {
    if (value === null || value === undefined)
        return false;
    if (typeof value === 'string')
        return value.trim().length > 0;
    if (Array.isArray(value))
        return value.length > 0;
    if (typeof value === 'object') {
        return Object.keys(value).length > 0;
    }
    // Numbers (including 0) and booleans (including false) count as data.
    return true;
}
function normalizeWhitelistDir(input) {
    const trimmed = input.trim().replace(/^\/+|\/+$/g, '');
    return trimmed ? (0, obsidian_1.normalizePath)(trimmed) : '';
}
function uniqueNonEmpty(values) {
    const seen = new Set();
    const result = [];
    for (const raw of values) {
        const value = raw.trim();
        if (!value || seen.has(value))
            continue;
        seen.add(value);
        result.push(value);
    }
    return result;
}
function parseListInput(value) {
    return uniqueNonEmpty(value.split(/[\n,]/g));
}
const VIEW_TYPE_METADATA_HEALTH = 'metadata-health-checker-view';
const DEFAULT_WHITELIST = ['00_docs'];
const DEFAULT_SETTINGS = {
    whitelistDirs: DEFAULT_WHITELIST,
    requiredFields: DEFAULT_REQUIRED_FIELDS,
    autoRescan: true,
    scanOnStartup: true,
};
class MetadataHealthPlugin extends obsidian_1.Plugin {
    constructor() {
        super(...arguments);
        this.lastReport = null;
        this.rescanTimer = null;
    }
    async onload() {
        await this.loadSettings();
        this.registerView(VIEW_TYPE_METADATA_HEALTH, (leaf) => new MetadataHealthView(leaf, this));
        this.addRibbonIcon('shield-check', '打开元数据健康面板', () => {
            void this.openHealthView();
        });
        this.addCommand({
            id: 'open-metadata-health',
            name: '打开元数据健康面板',
            callback: () => {
                void this.openHealthView();
            },
        });
        this.addCommand({
            id: 'scan-metadata-health',
            name: '立即扫描元数据健康',
            callback: () => {
                void this.scan(true);
            },
        });
        this.addSettingTab(new MetadataHealthSettingTab(this.app, this));
        this.statusBarEl = this.addStatusBarItem();
        this.statusBarEl.addClass('metadata-health-statusbar');
        this.statusBarEl.setText('元数据: 未扫描');
        this.statusBarEl.setAttribute('aria-label', '打开元数据健康面板');
        this.statusBarEl.addEventListener('click', () => {
            void this.openHealthView();
        });
        this.app.workspace.onLayoutReady(() => {
            this.registerLiveRescanEvents();
            if (this.settings.scanOnStartup) {
                void this.scan(false);
            }
        });
    }
    onunload() {
        if (this.rescanTimer !== null) {
            window.clearTimeout(this.rescanTimer);
            this.rescanTimer = null;
        }
    }
    async loadSettings() {
        const loaded = (await this.loadData());
        this.settings = {
            ...DEFAULT_SETTINGS,
            ...(loaded ?? {}),
            whitelistDirs: uniqueNonEmpty((loaded?.whitelistDirs ?? DEFAULT_SETTINGS.whitelistDirs).map(normalizeWhitelistDir)).filter(Boolean),
            requiredFields: uniqueNonEmpty(loaded?.requiredFields ?? DEFAULT_SETTINGS.requiredFields),
        };
    }
    async saveSettings() {
        await this.saveData(this.settings);
    }
    async openHealthView() {
        let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_METADATA_HEALTH)[0];
        if (!leaf) {
            leaf = this.app.workspace.getRightLeaf(false) ?? this.app.workspace.getLeaf(true);
            await leaf.setViewState({
                type: VIEW_TYPE_METADATA_HEALTH,
                active: true,
            });
        }
        await this.app.workspace.revealLeaf(leaf);
        await this.scan(false);
    }
    async scan(showNotice) {
        const requiredFields = uniqueNonEmpty(this.settings.requiredFields);
        const scannedFolders = uniqueNonEmpty(this.settings.whitelistDirs.map(normalizeWhitelistDir)).filter(Boolean);
        const files = this.app.vault
            .getMarkdownFiles()
            .filter((file) => this.isWhitelistedPath(file.path, scannedFolders));
        const results = [];
        for (const file of files) {
            const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
            const missingKeys = [];
            const emptyKeys = [];
            for (const key of requiredFields) {
                if (!frontmatter || !Object.prototype.hasOwnProperty.call(frontmatter, key)) {
                    missingKeys.push(key);
                    continue;
                }
                if (!hasData(frontmatter[key])) {
                    emptyKeys.push(key);
                }
            }
            results.push({
                file,
                missingKeys,
                emptyKeys,
                healthy: missingKeys.length === 0 && emptyKeys.length === 0,
            });
        }
        results.sort((a, b) => {
            if (a.healthy !== b.healthy)
                return a.healthy ? 1 : -1;
            return a.file.path.localeCompare(b.file.path);
        });
        const healthy = results.filter((result) => result.healthy).length;
        const report = {
            generatedAt: Date.now(),
            scannedFolders,
            requiredFields,
            files: results,
            total: results.length,
            healthy,
            unhealthy: results.length - healthy,
        };
        this.lastReport = report;
        this.updateStatusBar(report);
        this.refreshOpenViews();
        if (showNotice) {
            new obsidian_1.Notice(report.unhealthy === 0
                ? `元数据健康：${report.total}/${report.total} 个文件完整`
                : `元数据健康：${report.unhealthy} 个文件需要处理`);
        }
        return report;
    }
    scheduleScan() {
        if (!this.settings.autoRescan)
            return;
        if (this.rescanTimer !== null) {
            window.clearTimeout(this.rescanTimer);
        }
        this.rescanTimer = window.setTimeout(() => {
            this.rescanTimer = null;
            void this.scan(false);
        }, 350);
    }
    isPathWatched(path) {
        const dirs = this.settings.whitelistDirs
            .map(normalizeWhitelistDir)
            .filter(Boolean);
        return this.isWhitelistedPath(path, dirs);
    }
    isWhitelistedPath(path, dirs) {
        return dirs.some((dir) => path.startsWith(`${dir}/`));
    }
    registerLiveRescanEvents() {
        this.registerEvent(this.app.metadataCache.on('changed', (file) => {
            if (this.isPathWatched(file.path))
                this.scheduleScan();
        }));
        this.registerEvent(this.app.vault.on('create', (file) => {
            if (this.isWatchedMarkdownFile(file))
                this.scheduleScan();
        }));
        this.registerEvent(this.app.vault.on('delete', (file) => {
            if (this.isWatchedMarkdownFile(file))
                this.scheduleScan();
        }));
        this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
            const wasWatched = this.isPathWatched(oldPath);
            const isWatched = this.isWatchedMarkdownFile(file);
            if (wasWatched || isWatched)
                this.scheduleScan();
        }));
    }
    isWatchedMarkdownFile(file) {
        return file instanceof obsidian_1.TFile && file.extension === 'md' && this.isPathWatched(file.path);
    }
    updateStatusBar(report) {
        if (report.total === 0) {
            this.statusBarEl.setText('元数据: 0 个文件');
            return;
        }
        const percentage = Math.round((report.healthy / report.total) * 100);
        this.statusBarEl.setText(report.unhealthy === 0
            ? `元数据: ${percentage}% ✓`
            : `元数据: ${percentage}% · ${report.unhealthy} 个问题文件`);
    }
    refreshOpenViews() {
        for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_METADATA_HEALTH)) {
            if (leaf.view instanceof MetadataHealthView) {
                leaf.view.render();
            }
        }
    }
}
exports.default = MetadataHealthPlugin;
class MetadataHealthView extends obsidian_1.ItemView {
    constructor(leaf, plugin) {
        super(leaf);
        this.plugin = plugin;
        this.filterMode = 'issues';
        this.searchQuery = '';
    }
    getViewType() {
        return VIEW_TYPE_METADATA_HEALTH;
    }
    getDisplayText() {
        return '元数据健康';
    }
    getIcon() {
        return 'shield-check';
    }
    async onOpen() {
        this.render();
        if (!this.plugin.lastReport) {
            await this.plugin.scan(false);
        }
    }
    async onClose() { }
    render() {
        const container = this.contentEl;
        container.empty();
        container.addClass('metadata-health-view');
        const report = this.plugin.lastReport;
        const header = container.createDiv({ cls: 'metadata-health-header' });
        const titleGroup = header.createDiv({ cls: 'metadata-health-title-group' });
        titleGroup.createEl('h2', { text: '元数据健康' });
        titleGroup.createDiv({
            cls: 'metadata-health-subtitle',
            text: '只检查必需 Frontmatter 字段是否存在且非空，不校验具体内容。',
        });
        const actions = header.createDiv({ cls: 'metadata-health-actions' });
        const scanButton = actions.createEl('button', { text: '重新扫描' });
        scanButton.addEventListener('click', () => void this.plugin.scan(true));
        const copyButton = actions.createEl('button', { text: '复制报告' });
        copyButton.disabled = !report;
        copyButton.addEventListener('click', () => void this.copyReport());
        if (!report) {
            container.createDiv({
                cls: 'metadata-health-empty',
                text: '尚未执行扫描。',
            });
            return;
        }
        this.renderSummary(container, report);
        this.renderControls(container, report);
        this.renderFileList(container, report);
    }
    renderSummary(container, report) {
        const summary = container.createDiv({ cls: 'metadata-health-summary' });
        this.createMetric(summary, '已扫描', String(report.total));
        this.createMetric(summary, '健康', String(report.healthy));
        this.createMetric(summary, '需处理', String(report.unhealthy));
        const percent = report.total === 0 ? null : Math.round((report.healthy / report.total) * 100);
        this.createMetric(summary, '健康率', percent === null ? '—' : `${percent}%`);
        const scope = container.createDiv({ cls: 'metadata-health-scope' });
        scope.createDiv({
            text: `目录：${report.scannedFolders.length > 0 ? report.scannedFolders.join(', ') : '（未配置）'}`,
        });
        scope.createDiv({ text: `必需字段：${report.requiredFields.length}` });
        scope.createDiv({ text: `上次扫描：${new Date(report.generatedAt).toLocaleString()}` });
    }
    renderControls(container, report) {
        const controls = container.createDiv({ cls: 'metadata-health-controls' });
        const tabs = controls.createDiv({ cls: 'metadata-health-tabs' });
        const filters = [
            { mode: 'issues', label: '问题', count: report.unhealthy },
            { mode: 'all', label: '全部', count: report.total },
            { mode: 'healthy', label: '健康', count: report.healthy },
        ];
        for (const filter of filters) {
            const button = tabs.createEl('button', {
                cls: this.filterMode === filter.mode ? 'is-active' : '',
                text: `${filter.label} ${filter.count}`,
            });
            button.addEventListener('click', () => {
                this.filterMode = filter.mode;
                this.render();
            });
        }
        const search = controls.createEl('input', {
            cls: 'metadata-health-search',
            type: 'search',
            placeholder: '按文件路径筛选…',
            value: this.searchQuery,
        });
        search.addEventListener('input', () => {
            this.searchQuery = search.value;
            this.renderFileListOnly();
        });
    }
    renderFileList(container, report) {
        const list = container.createDiv({ cls: 'metadata-health-list', attr: { 'data-role': 'file-list' } });
        const query = this.searchQuery.trim().toLowerCase();
        const visible = report.files.filter((item) => {
            if (this.filterMode === 'issues' && item.healthy)
                return false;
            if (this.filterMode === 'healthy' && !item.healthy)
                return false;
            if (query && !item.file.path.toLowerCase().includes(query))
                return false;
            return true;
        });
        if (visible.length === 0) {
            const message = report.total === 0
                ? '白名单目录中没有找到 Markdown 文件。'
                : this.filterMode === 'issues' && report.unhealthy === 0
                    ? '全部完整，没有发现元数据问题。'
                    : '没有文件匹配当前筛选条件。';
            list.createDiv({ cls: 'metadata-health-empty', text: message });
            return;
        }
        for (const item of visible) {
            const card = list.createDiv({
                cls: `metadata-health-card ${item.healthy ? 'is-healthy' : 'has-issues'}`,
            });
            const top = card.createDiv({ cls: 'metadata-health-card-top' });
            const fileButton = top.createEl('button', {
                cls: 'metadata-health-file-link',
                text: item.file.path,
            });
            fileButton.addEventListener('click', () => {
                void this.app.workspace.getLeaf(false).openFile(item.file);
            });
            top.createSpan({
                cls: `metadata-health-badge ${item.healthy ? 'is-healthy' : 'has-issues'}`,
                text: item.healthy
                    ? '健康'
                    : `${item.missingKeys.length + item.emptyKeys.length} 项问题`,
            });
            if (!item.healthy) {
                if (item.missingKeys.length > 0) {
                    this.renderIssueRow(card, '缺失', item.missingKeys);
                }
                if (item.emptyKeys.length > 0) {
                    this.renderIssueRow(card, '空值', item.emptyKeys);
                }
            }
        }
    }
    renderFileListOnly() {
        const report = this.plugin.lastReport;
        if (!report)
            return;
        const existing = this.contentEl.querySelector('[data-role="file-list"]');
        if (!existing) {
            this.render();
            return;
        }
        const parent = existing.parentElement;
        if (!parent)
            return;
        existing.remove();
        this.renderFileList(parent, report);
    }
    renderIssueRow(card, label, keys) {
        const row = card.createDiv({ cls: 'metadata-health-issue-row' });
        row.createSpan({ cls: 'metadata-health-issue-label', text: label });
        const chips = row.createDiv({ cls: 'metadata-health-chips' });
        for (const key of keys) {
            chips.createSpan({ cls: 'metadata-health-chip', text: key });
        }
    }
    createMetric(container, label, value) {
        const metric = container.createDiv({ cls: 'metadata-health-metric' });
        metric.createDiv({ cls: 'metadata-health-metric-value', text: value });
        metric.createDiv({ cls: 'metadata-health-metric-label', text: label });
    }
    async copyReport() {
        const report = this.plugin.lastReport;
        if (!report)
            return;
        const lines = [
            '# 元数据健康报告',
            '',
            `已扫描: ${report.total}`,
            `健康: ${report.healthy}`,
            `需处理: ${report.unhealthy}`,
            `目录: ${report.scannedFolders.join(', ') || '（未配置）'}`,
            '',
        ];
        for (const item of report.files.filter((file) => !file.healthy)) {
            lines.push(`- ${item.file.path}`);
            if (item.missingKeys.length > 0) {
                lines.push(`  - 缺失: ${item.missingKeys.join(', ')}`);
            }
            if (item.emptyKeys.length > 0) {
                lines.push(`  - 空值: ${item.emptyKeys.join(', ')}`);
            }
        }
        await navigator.clipboard.writeText(lines.join('\n'));
        new obsidian_1.Notice('元数据健康报告已复制');
    }
}
class MetadataHealthSettingTab extends obsidian_1.PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }
    display() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: '元数据健康检查' });
        containerEl.createEl('p', {
            text: '字段只要存在于 Frontmatter 且值非空即可通过。0 和 false 也视为有效数据。',
        });
        new obsidian_1.Setting(containerEl)
            .setName('白名单目录')
            .setDesc('每行一个目录，路径相对 Vault 根目录；会递归包含所有子目录中的 Markdown 文件。')
            .addTextArea((text) => {
            text
                .setPlaceholder('00_docs')
                .setValue(this.plugin.settings.whitelistDirs.join('\n'))
                .onChange(async (value) => {
                this.plugin.settings.whitelistDirs = parseListInput(value)
                    .map(normalizeWhitelistDir)
                    .filter(Boolean);
                await this.plugin.saveSettings();
                this.plugin.scheduleScan();
            });
            text.inputEl.rows = 4;
            text.inputEl.addClass('metadata-health-settings-textarea');
        });
        new obsidian_1.Setting(containerEl)
            .setName('必需元数据字段')
            .setDesc('每行一个 Frontmatter 字段名；字段名大小写敏感。')
            .addTextArea((text) => {
            text
                .setValue(this.plugin.settings.requiredFields.join('\n'))
                .onChange(async (value) => {
                this.plugin.settings.requiredFields = parseListInput(value);
                await this.plugin.saveSettings();
                this.plugin.scheduleScan();
            });
            text.inputEl.rows = 12;
            text.inputEl.addClass('metadata-health-settings-textarea');
        });
        new obsidian_1.Setting(containerEl)
            .setName('自动重新扫描')
            .setDesc('白名单目录中的 Markdown 文件创建、修改、重命名或删除后，自动刷新报告。')
            .addToggle((toggle) => toggle
            .setValue(this.plugin.settings.autoRescan)
            .onChange(async (value) => {
            this.plugin.settings.autoRescan = value;
            await this.plugin.saveSettings();
        }));
        new obsidian_1.Setting(containerEl)
            .setName('启动后扫描')
            .setDesc('Obsidian 工作区加载完成后自动执行一次扫描。')
            .addToggle((toggle) => toggle
            .setValue(this.plugin.settings.scanOnStartup)
            .onChange(async (value) => {
            this.plugin.settings.scanOnStartup = value;
            await this.plugin.saveSettings();
        }));
        new obsidian_1.Setting(containerEl)
            .setName('恢复默认值')
            .setDesc('恢复默认白名单目录和必需字段。')
            .addButton((button) => button.setButtonText('恢复').onClick(async () => {
            this.plugin.settings.whitelistDirs = [...DEFAULT_WHITELIST];
            this.plugin.settings.requiredFields = [...DEFAULT_REQUIRED_FIELDS];
            await this.plugin.saveSettings();
            this.display();
            await this.plugin.scan(false);
            new obsidian_1.Notice('已恢复元数据健康检查默认值');
        }));
    }
}
