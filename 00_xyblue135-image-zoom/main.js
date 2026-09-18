/*
 * xyblue135 私人 · 图片缩放与相框
 * 类型：xyblue135 私人插件（非公共发布版）
 * 说明：用户可见文案与维护注释已中文化；内部插件 ID 与 data.json 保持不变，以兼容原有设置和数据。
 */
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const obsidian_1 = require("obsidian");
const CURRENT_SETTINGS_VERSION = 5;
const FRAME_THEMES = {
    'mc-cherry': {
        id: 'mc-cherry',
        name: 'MC 樱花木',
        description: '低饱和粉色像素木框，接近 Minecraft 樱花木的柔和粉木层次。',
        borderWidth: 4,
        pixelUnit: 1,
        margin: 12,
        radius: 0,
        mainColor: '#d88f9f',
        backgroundColor: '#f4c6ce',
        innerDarkColor: '#8f5966',
        lightColor: '#efb4c0',
        outerColor: '#a96877',
        shadowColor: '#5a2d3c',
        shadowOpacity: 0.22
    },
    'mc-deepslate': {
        id: 'mc-deepslate',
        name: 'MC 深板岩',
        description: '深灰黑像素层，适合终端、服务器、网络拓扑等技术截图。',
        borderWidth: 4,
        pixelUnit: 1,
        margin: 12,
        radius: 0,
        mainColor: '#4b515a',
        backgroundColor: '#272b31',
        innerDarkColor: '#111419',
        lightColor: '#717a86',
        outerColor: '#343940',
        shadowColor: '#080a0d',
        shadowOpacity: 0.46
    },
    'mc-crimson': {
        id: 'mc-crimson',
        name: 'MC 绯红木',
        description: '下界绯红木风格，酒红与暗紫层次更强，适合强调型截图。',
        borderWidth: 4,
        pixelUnit: 1,
        margin: 12,
        radius: 0,
        mainColor: '#98465d',
        backgroundColor: '#5c2439',
        innerDarkColor: '#32101f',
        lightColor: '#cb6681',
        outerColor: '#712d47',
        shadowColor: '#330b1b',
        shadowOpacity: 0.38
    },
    'mc-amethyst': {
        id: 'mc-amethyst',
        name: 'MC 紫水晶',
        description: '紫水晶簇的深浅紫层次，明亮但不过分刺眼。',
        borderWidth: 4,
        pixelUnit: 1,
        margin: 12,
        radius: 0,
        mainColor: '#9e70d2',
        backgroundColor: '#d9c7ef',
        innerDarkColor: '#50356f',
        lightColor: '#c9a6eb',
        outerColor: '#704b98',
        shadowColor: '#382550',
        shadowOpacity: 0.32
    },
    'oxidized-copper': {
        id: 'oxidized-copper',
        name: '氧化铜',
        description: '青铜与氧化铜绿组合，偏工业、机械、基础设施风格。',
        borderWidth: 3,
        pixelUnit: 1,
        margin: 12,
        radius: 2,
        mainColor: '#4fa99f',
        backgroundColor: '#b9ddd8',
        innerDarkColor: '#245b56',
        lightColor: '#7ac8bd',
        outerColor: '#347f77',
        shadowColor: '#1c4d49',
        shadowOpacity: 0.32
    },
    'black-gold': {
        id: 'black-gold',
        name: '黑金典藏',
        description: '哑黑底配香槟金多层边框，偏高级展示和作品集风格。',
        borderWidth: 3,
        pixelUnit: 2,
        margin: 14,
        radius: 3,
        mainColor: '#c9aa5f',
        backgroundColor: '#171717',
        innerDarkColor: '#5d491d',
        lightColor: '#ead48f',
        outerColor: '#312812',
        shadowColor: '#000000',
        shadowOpacity: 0.48
    },
    'frost-glass': {
        id: 'frost-glass',
        name: '冰霜玻璃',
        description: '浅蓝银白层次和柔和阴影，适合浅色主题和干净的文档截图。',
        borderWidth: 2,
        pixelUnit: 1,
        margin: 14,
        radius: 10,
        mainColor: '#b8d9e8',
        backgroundColor: '#edf9ff',
        innerDarkColor: '#729fb5',
        lightColor: '#ffffff',
        outerColor: '#9bc7dc',
        shadowColor: '#557b8d',
        shadowOpacity: 0.24
    },
    'cyber-neon': {
        id: 'cyber-neon',
        name: '赛博霓虹',
        description: '青绿、紫色和洋红的霓虹层，适合深色主题、代码和监控面板。',
        borderWidth: 3,
        pixelUnit: 1,
        margin: 14,
        radius: 5,
        mainColor: '#39f0d0',
        backgroundColor: '#07151b',
        innerDarkColor: '#ff4fd8',
        lightColor: '#8bfff1',
        outerColor: '#625dff',
        shadowColor: '#00d9ff',
        shadowOpacity: 0.42
    }
};
const DEFAULT_SETTINGS = {
    settingsVersion: CURRENT_SETTINGS_VERSION,
    modifier: 'Shift',
    step: 0.15,
    minScale: 0.35,
    maxScale: 4.0,
    showScaleBadge: true,
    frameEnabled: true,
    frameTheme: 'mc-cherry',
    frameBorderWidth: FRAME_THEMES['mc-cherry'].borderWidth,
    framePixelUnit: FRAME_THEMES['mc-cherry'].pixelUnit,
    frameMargin: FRAME_THEMES['mc-cherry'].margin,
    frameRadius: FRAME_THEMES['mc-cherry'].radius,
    frameMainColor: FRAME_THEMES['mc-cherry'].mainColor,
    frameBackgroundColor: FRAME_THEMES['mc-cherry'].backgroundColor,
    frameInnerDarkColor: FRAME_THEMES['mc-cherry'].innerDarkColor,
    frameLightColor: FRAME_THEMES['mc-cherry'].lightColor,
    frameOuterColor: FRAME_THEMES['mc-cherry'].outerColor,
    frameShadowColor: FRAME_THEMES['mc-cherry'].shadowColor,
    frameShadowOpacity: FRAME_THEMES['mc-cherry'].shadowOpacity
};
class LocalImageHoverZoomPlugin extends obsidian_1.Plugin {
    constructor() {
        super(...arguments);
        this.imageStates = new WeakMap();
        this.badgeEl = null;
        this.badgeTimer = null;
        this.frameObserver = null;
        this.refreshTimer = null;
    }
    async onload() {
        await this.loadSettings();
        // 只监听 Obsidian 当前界面中的 DOM 事件，不读取或改写 Markdown 文件内容。
        this.registerDomEvent(document, 'wheel', (event) => this.onWheel(event), {
            capture: true,
            passive: false
        });
        // 按住设定组合键双击图片，可恢复该图片到首次缩放前的显示尺寸。
        this.registerDomEvent(document, 'dblclick', (event) => this.onDoubleClick(event), true);
        // 相框只标记标准 Markdown 的 ![]() 图片；MutationObserver 用于处理后续动态渲染。
        this.startFrameObserver();
        this.applyFrameCssVariables();
        this.scheduleRefreshFrameClasses();
        // 切换笔记、布局变化或元数据刷新后重新核对，避免旧 DOM 标记残留。
        this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.scheduleRefreshFrameClasses()));
        this.registerEvent(this.app.workspace.on('layout-change', () => this.scheduleRefreshFrameClasses()));
        this.registerEvent(this.app.metadataCache.on('changed', () => this.scheduleRefreshFrameClasses()));
        this.addCommand({
            id: 'toggle-image-frame',
            name: '切换图片相框',
            callback: async () => {
                this.settings.frameEnabled = !this.settings.frameEnabled;
                await this.saveSettings();
                this.refreshFrameClasses();
            }
        });
        this.addSettingTab(new ImageHoverZoomSettingTab(this.app, this));
    }
    onunload() {
        var _a;
        this.resetAllImages();
        this.removeAllFrameClasses();
        this.removeFrameCssVariables();
        (_a = this.frameObserver) === null || _a === void 0 ? void 0 : _a.disconnect();
        this.frameObserver = null;
        if (this.refreshTimer !== null)
            window.clearTimeout(this.refreshTimer);
        this.refreshTimer = null;
        this.removeBadge();
    }
    async loadSettings() {
        const raw = (await this.loadData());
        const oldSettings = raw !== null && raw !== void 0 ? raw : {};
        const theme = this.isValidTheme(oldSettings.frameTheme)
            ? oldSettings.frameTheme
            : DEFAULT_SETTINGS.frameTheme;
        this.settings = {
            settingsVersion: CURRENT_SETTINGS_VERSION,
            modifier: this.isValidModifier(oldSettings.modifier) ? oldSettings.modifier : DEFAULT_SETTINGS.modifier,
            step: typeof oldSettings.step === 'number' ? oldSettings.step : DEFAULT_SETTINGS.step,
            minScale: typeof oldSettings.minScale === 'number' ? oldSettings.minScale : DEFAULT_SETTINGS.minScale,
            maxScale: typeof oldSettings.maxScale === 'number' ? oldSettings.maxScale : DEFAULT_SETTINGS.maxScale,
            showScaleBadge: typeof oldSettings.showScaleBadge === 'boolean' ? oldSettings.showScaleBadge : DEFAULT_SETTINGS.showScaleBadge,
            frameEnabled: typeof oldSettings.frameEnabled === 'boolean' ? oldSettings.frameEnabled : DEFAULT_SETTINGS.frameEnabled,
            frameTheme: theme,
            frameBorderWidth: typeof oldSettings.frameBorderWidth === 'number' ? oldSettings.frameBorderWidth : DEFAULT_SETTINGS.frameBorderWidth,
            framePixelUnit: typeof oldSettings.framePixelUnit === 'number' ? oldSettings.framePixelUnit : DEFAULT_SETTINGS.framePixelUnit,
            frameMargin: typeof oldSettings.frameMargin === 'number' ? oldSettings.frameMargin : DEFAULT_SETTINGS.frameMargin,
            frameRadius: typeof oldSettings.frameRadius === 'number' ? oldSettings.frameRadius : DEFAULT_SETTINGS.frameRadius,
            frameMainColor: this.validColor(oldSettings.frameMainColor, DEFAULT_SETTINGS.frameMainColor),
            frameBackgroundColor: this.validColor(oldSettings.frameBackgroundColor, DEFAULT_SETTINGS.frameBackgroundColor),
            frameInnerDarkColor: this.validColor(oldSettings.frameInnerDarkColor, DEFAULT_SETTINGS.frameInnerDarkColor),
            frameLightColor: this.validColor(oldSettings.frameLightColor, DEFAULT_SETTINGS.frameLightColor),
            frameOuterColor: this.validColor(oldSettings.frameOuterColor, DEFAULT_SETTINGS.frameOuterColor),
            frameShadowColor: this.validColor(oldSettings.frameShadowColor, DEFAULT_SETTINGS.frameShadowColor),
            frameShadowOpacity: typeof oldSettings.frameShadowOpacity === 'number' ? oldSettings.frameShadowOpacity : DEFAULT_SETTINGS.frameShadowOpacity
        };
        // 从 v1.3.x 升级时，如果还是旧版默认樱花木参数，补上新主题标识和圆角/阴影色字段。
        if (!oldSettings.frameTheme) {
            this.settings.frameTheme = 'mc-cherry';
        }
        await this.saveSettings();
    }
    validColor(value, fallback) {
        return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
    }
    isValidModifier(value) {
        return value === 'Alt' || value === 'Shift' || value === 'Ctrl' || value === 'Meta';
    }
    isValidTheme(value) {
        return value === 'custom' || (typeof value === 'string' && value in FRAME_THEMES);
    }
    isModifierPressed(event) {
        switch (this.settings.modifier) {
            case 'Alt': return event.altKey;
            case 'Ctrl': return event.ctrlKey;
            case 'Meta': return event.metaKey;
            default: return event.shiftKey;
        }
    }
    /**
     * 用于缩放的“正文图片”筛选。
     * 这里仍允许标准 Markdown 图片和 Obsidian 的其他正文图片，但排除界面图标、弹窗等。
     */
    isZoomableMarkdownImage(img) {
        if (!img.closest('.markdown-preview-view, .markdown-source-view, .markdown-rendered, .cm-editor'))
            return false;
        if (img.closest('.mod-settings, .modal-container, .menu, .suggestion-container, .view-header, .workspace-tab-header'))
            return false;
        if (img.matches('.emoji, .icon, .view-header-icon img, .nav-file-icon img'))
            return false;
        return true;
    }
    /**
     * 相框严格只认标准 Markdown 图片语法 ![]()。
     *
     * v1.4.1 修复：不能再用 `.internal-embed / .image-embed` 判断 Wiki 图片，
     * 因为 Obsidian 1.12.x 的 Live Preview 对标准 Markdown 本地图片也可能使用
     * `.image-embed` 容器。这里改为以 metadataCache 记录的原始 Markdown 为准。
     *
     * 为了处理“同一个图片文件既被 ![]() 又被 ![[...]] 引用”的情况，
     * 还会按照同资源图片在当前渲染区域中的 DOM 顺序，与源码 embed 顺序一一对应。
     */
    isStandardMarkdownImage(img) {
        var _a;
        if (!this.isZoomableMarkdownImage(img))
            return false;
        // 排除 Callout / Admonition 等组件内部自带的图标图片。
        if (img.closest('.callout-icon, .admonition-icon, .callout-title'))
            return false;
        const file = this.getFileForElement(img);
        if (!file)
            return false;
        const cache = this.app.metadataCache.getFileCache(file);
        const embeds = (_a = cache === null || cache === void 0 ? void 0 : cache.embeds) !== null && _a !== void 0 ? _a : [];
        if (!embeds.length)
            return false;
        const imgSrc = this.getImageSource(img);
        if (!imgSrc)
            return false;
        // 找出源码中所有最终指向当前图片资源的 embed，并按源码位置排序。
        const matchingEmbeds = embeds
            .filter((embed) => this.embedMatchesImageSource(embed, imgSrc, file))
            .sort((a, b) => {
            var _a, _b, _c, _d;
            const ao = (_b = (_a = a === null || a === void 0 ? void 0 : a.position) === null || _a === void 0 ? void 0 : _a.start) === null || _b === void 0 ? void 0 : _b.offset;
            const bo = (_d = (_c = b === null || b === void 0 ? void 0 : b.position) === null || _c === void 0 ? void 0 : _c.start) === null || _d === void 0 ? void 0 : _d.offset;
            return (ao !== null && ao !== void 0 ? ao : 0) - (bo !== null && bo !== void 0 ? bo : 0);
        });
        if (!matchingEmbeds.length)
            return false;
        // 同一渲染区域中，找出所有指向相同资源的图片，按 DOM 顺序与源码顺序对应。
        // 这能避免同一张图片同时存在 ![]() 和 ![[...]] 时误判。
        const renderRoot = img.closest('.markdown-preview-view, .markdown-source-view, .markdown-rendered, .cm-editor') ||
            this.getViewContainerForElement(img);
        if (renderRoot) {
            const sameResourceImages = Array.from(renderRoot.querySelectorAll('img'))
                .filter((candidate) => this.isZoomableMarkdownImage(candidate))
                .filter((candidate) => this.urlsEquivalent(this.getImageSource(candidate), imgSrc));
            const index = sameResourceImages.indexOf(img);
            if (index >= 0 && index < matchingEmbeds.length) {
                return this.isStandardMarkdownEmbed(matchingEmbeds[index]);
            }
        }
        // 无法建立顺序映射时：只有全部匹配项都是标准 Markdown 才放行，宁可不加也不误加。
        return matchingEmbeds.every((embed) => this.isStandardMarkdownEmbed(embed));
    }
    /** 判断 metadataCache 中的一条 embed 是否来自标准 Markdown 图片语法。 */
    isStandardMarkdownEmbed(embed) {
        var _a;
        const original = String((_a = embed === null || embed === void 0 ? void 0 : embed.original) !== null && _a !== void 0 ? _a : '').trim();
        return /^!\[[\s\S]*?\]\s*\(/.test(original);
    }
    /** 获取图片当前渲染资源地址，并做统一规范化。 */
    getImageSource(img) {
        return this.normalizeUrl(img.currentSrc || img.src || img.getAttribute('src') || '');
    }
    /** 判断 metadataCache 的 embed 最终是否指向给定图片资源。 */
    embedMatchesImageSource(embed, imgSrc, file) {
        var _a;
        const link = String((_a = embed === null || embed === void 0 ? void 0 : embed.link) !== null && _a !== void 0 ? _a : '').trim();
        if (!link)
            return false;
        // 外部图片直接比较 URL。
        if (/^(https?:|data:|file:)/i.test(link)) {
            return this.urlsEquivalent(imgSrc, this.normalizeUrl(link));
        }
        // Vault 内图片用 Obsidian 解析后的资源 URL 比较。
        const destination = this.app.metadataCache.getFirstLinkpathDest(link, file.path);
        if (!destination)
            return false;
        const resourceUrl = this.normalizeUrl(this.app.vault.getResourcePath(destination));
        return this.urlsEquivalent(imgSrc, resourceUrl);
    }
    /** 找到元素所在 Markdown 视图的根容器。 */
    getViewContainerForElement(element) {
        var _a;
        const leaves = this.app.workspace.getLeavesOfType('markdown');
        for (const leaf of leaves) {
            const view = leaf.view;
            if ((_a = view === null || view === void 0 ? void 0 : view.containerEl) === null || _a === void 0 ? void 0 : _a.contains(element))
                return view.containerEl;
        }
        return null;
    }
    getFileForElement(element) {
        var _a, _b;
        const leaves = this.app.workspace.getLeavesOfType('markdown');
        for (const leaf of leaves) {
            const view = leaf.view;
            if (!((_a = view === null || view === void 0 ? void 0 : view.containerEl) === null || _a === void 0 ? void 0 : _a.contains(element)))
                continue;
            return (_b = view.file) !== null && _b !== void 0 ? _b : null;
        }
        return this.app.workspace.getActiveFile();
    }
    normalizeUrl(value) {
        if (!value)
            return '';
        try {
            return decodeURI(value).replace(/#.*$/, '');
        }
        catch (_a) {
            return value.replace(/#.*$/, '');
        }
    }
    urlsEquivalent(a, b) {
        if (!a || !b)
            return false;
        if (a === b)
            return true;
        // Electron/Obsidian 有时会给资源 URL 添加查询参数，这里忽略 query 再比较。
        const stripQuery = (value) => value.replace(/\?.*$/, '');
        return stripQuery(a) === stripQuery(b);
    }
    getZoomImage(target) {
        if (!(target instanceof Element))
            return null;
        const img = target instanceof HTMLImageElement ? target : target.closest('img');
        if (!(img instanceof HTMLImageElement))
            return null;
        return this.isZoomableMarkdownImage(img) ? img : null;
    }
    startFrameObserver() {
        var _a;
        (_a = this.frameObserver) === null || _a === void 0 ? void 0 : _a.disconnect();
        this.frameObserver = new MutationObserver((mutations) => {
            let foundImage = false;
            for (const mutation of mutations) {
                for (const node of Array.from(mutation.addedNodes)) {
                    if (!(node instanceof Element))
                        continue;
                    if (node instanceof HTMLImageElement || node.querySelector('img')) {
                        foundImage = true;
                        break;
                    }
                }
                if (foundImage)
                    break;
            }
            if (foundImage)
                this.scheduleRefreshFrameClasses();
        });
        this.frameObserver.observe(document.body, { childList: true, subtree: true });
        this.register(() => { var _a; return (_a = this.frameObserver) === null || _a === void 0 ? void 0 : _a.disconnect(); });
    }
    scheduleRefreshFrameClasses() {
        if (this.refreshTimer !== null)
            window.clearTimeout(this.refreshTimer);
        this.refreshTimer = window.setTimeout(() => {
            this.refreshTimer = null;
            this.refreshFrameClasses();
        }, 80);
    }
    updateFrameClass(img) {
        const shouldHaveFrame = this.settings.frameEnabled && this.isStandardMarkdownImage(img);
        img.classList.toggle('xyblue135-markdown-image-frame', shouldHaveFrame);
    }
    refreshFrameClasses() {
        document.querySelectorAll('img').forEach((img) => this.updateFrameClass(img));
    }
    removeAllFrameClasses() {
        document.querySelectorAll('img.xyblue135-markdown-image-frame').forEach((img) => {
            img.classList.remove('xyblue135-markdown-image-frame');
        });
    }
    applyTheme(themeId) {
        const theme = FRAME_THEMES[themeId];
        this.settings.frameTheme = themeId;
        this.settings.frameBorderWidth = theme.borderWidth;
        this.settings.framePixelUnit = theme.pixelUnit;
        this.settings.frameMargin = theme.margin;
        this.settings.frameRadius = theme.radius;
        this.settings.frameMainColor = theme.mainColor;
        this.settings.frameBackgroundColor = theme.backgroundColor;
        this.settings.frameInnerDarkColor = theme.innerDarkColor;
        this.settings.frameLightColor = theme.lightColor;
        this.settings.frameOuterColor = theme.outerColor;
        this.settings.frameShadowColor = theme.shadowColor;
        this.settings.frameShadowOpacity = theme.shadowOpacity;
    }
    markThemeCustom() {
        this.settings.frameTheme = 'custom';
    }
    applyFrameCssVariables() {
        const root = document.documentElement;
        const unit = Math.max(1, Math.round(this.settings.framePixelUnit));
        const shadow = this.hexToRgba(this.settings.frameShadowColor, this.settings.frameShadowOpacity);
        root.style.setProperty('--xyblue135-frame-border-width', `${this.settings.frameBorderWidth}px`);
        root.style.setProperty('--xyblue135-frame-margin', `${this.settings.frameMargin}px`);
        root.style.setProperty('--xyblue135-frame-radius', `${this.settings.frameRadius}px`);
        root.style.setProperty('--xyblue135-frame-main', this.settings.frameMainColor);
        root.style.setProperty('--xyblue135-frame-background', this.settings.frameBackgroundColor);
        root.style.setProperty('--xyblue135-frame-inner-dark', this.settings.frameInnerDarkColor);
        root.style.setProperty('--xyblue135-frame-light', this.settings.frameLightColor);
        root.style.setProperty('--xyblue135-frame-outer', this.settings.frameOuterColor);
        root.style.setProperty('--xyblue135-frame-layer-1', `${2 * unit}px`);
        root.style.setProperty('--xyblue135-frame-layer-2', `${5 * unit}px`);
        root.style.setProperty('--xyblue135-frame-layer-3', `${7 * unit}px`);
        root.style.setProperty('--xyblue135-frame-shadow-y', `${8 * unit}px`);
        root.style.setProperty('--xyblue135-frame-shadow-blur', `${16 * unit}px`);
        root.style.setProperty('--xyblue135-frame-shadow', shadow);
    }
    hexToRgba(hex, opacity) {
        const clean = hex.replace('#', '');
        const r = parseInt(clean.slice(0, 2), 16);
        const g = parseInt(clean.slice(2, 4), 16);
        const b = parseInt(clean.slice(4, 6), 16);
        const a = Math.min(1, Math.max(0, opacity));
        return `rgba(${r}, ${g}, ${b}, ${a})`;
    }
    removeFrameCssVariables() {
        const root = document.documentElement;
        [
            '--xyblue135-frame-border-width',
            '--xyblue135-frame-margin',
            '--xyblue135-frame-radius',
            '--xyblue135-frame-main',
            '--xyblue135-frame-background',
            '--xyblue135-frame-inner-dark',
            '--xyblue135-frame-light',
            '--xyblue135-frame-outer',
            '--xyblue135-frame-layer-1',
            '--xyblue135-frame-layer-2',
            '--xyblue135-frame-layer-3',
            '--xyblue135-frame-shadow-y',
            '--xyblue135-frame-shadow-blur',
            '--xyblue135-frame-shadow'
        ].forEach((name) => root.style.removeProperty(name));
    }
    onWheel(event) {
        if (!this.isModifierPressed(event))
            return;
        const img = this.getZoomImage(event.target);
        if (!img)
            return;
        event.preventDefault();
        event.stopPropagation();
        const state = this.ensureState(img);
        const direction = event.deltaY < 0 ? 1 : -1;
        const nextScale = this.clamp(state.scale + direction * this.settings.step, this.settings.minScale, this.settings.maxScale);
        if (nextScale === state.scale)
            return;
        state.scale = Number(nextScale.toFixed(3));
        // 修改真实 width / height，让图片参与浏览器布局重排，因此会影响旁边和下方文字。
        const nextWidth = Math.max(1, state.baseWidth * state.scale);
        const nextHeight = Math.max(1, state.baseHeight * state.scale);
        img.style.setProperty('width', `${nextWidth.toFixed(2)}px`, 'important');
        img.style.setProperty('height', `${nextHeight.toFixed(2)}px`, 'important');
        img.classList.add('hiz-layout-active');
        img.classList.toggle('hiz-zoomed-out', state.scale < 1);
        if (this.settings.showScaleBadge) {
            this.showBadge(event.clientX, event.clientY, state.scale, nextWidth, nextHeight);
        }
    }
    onDoubleClick(event) {
        if (!this.isModifierPressed(event))
            return;
        const img = this.getZoomImage(event.target);
        if (!img)
            return;
        event.preventDefault();
        event.stopPropagation();
        this.resetImage(img);
    }
    ensureState(img) {
        const existing = this.imageStates.get(img);
        if (existing)
            return existing;
        const rect = img.getBoundingClientRect();
        const baseWidth = rect.width > 0 ? rect.width : (img.clientWidth || img.naturalWidth || 1);
        let baseHeight = rect.height > 0 ? rect.height : (img.clientHeight || img.naturalHeight || 0);
        if (baseHeight <= 0) {
            const ratio = img.naturalWidth > 0 && img.naturalHeight > 0 ? img.naturalHeight / img.naturalWidth : 1;
            baseHeight = baseWidth * ratio;
        }
        const state = {
            scale: 1,
            baseWidth,
            baseHeight,
            originalWidth: this.captureInlineStyle(img, 'width'),
            originalHeight: this.captureInlineStyle(img, 'height')
        };
        this.imageStates.set(img, state);
        return state;
    }
    captureInlineStyle(img, property) {
        return {
            value: img.style.getPropertyValue(property),
            priority: img.style.getPropertyPriority(property)
        };
    }
    restoreInlineStyle(img, property, snapshot) {
        if (snapshot.value)
            img.style.setProperty(property, snapshot.value, snapshot.priority);
        else
            img.style.removeProperty(property);
    }
    resetImage(img) {
        const state = this.imageStates.get(img);
        if (state) {
            this.restoreInlineStyle(img, 'width', state.originalWidth);
            this.restoreInlineStyle(img, 'height', state.originalHeight);
        }
        else {
            img.style.removeProperty('width');
            img.style.removeProperty('height');
        }
        img.classList.remove('hiz-layout-active', 'hiz-zoomed-out');
        this.imageStates.delete(img);
        this.removeBadge();
    }
    resetAllImages() {
        document.querySelectorAll('img.hiz-layout-active').forEach((img) => this.resetImage(img));
    }
    showBadge(x, y, scale, width, height) {
        if (!this.badgeEl)
            this.badgeEl = document.body.createDiv({ cls: 'hiz-scale-badge' });
        this.badgeEl.setText(`${Math.round(scale * 100)}% · ${Math.round(width)}×${Math.round(height)} px`);
        this.badgeEl.style.left = `${x + 14}px`;
        this.badgeEl.style.top = `${y + 14}px`;
        if (this.badgeTimer !== null)
            window.clearTimeout(this.badgeTimer);
        this.badgeTimer = window.setTimeout(() => this.removeBadge(), 850);
    }
    removeBadge() {
        var _a;
        if (this.badgeTimer !== null) {
            window.clearTimeout(this.badgeTimer);
            this.badgeTimer = null;
        }
        (_a = this.badgeEl) === null || _a === void 0 ? void 0 : _a.remove();
        this.badgeEl = null;
    }
    clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }
    async saveSettings() {
        await this.saveData(this.settings);
        this.applyFrameCssVariables();
    }
}
exports.default = LocalImageHoverZoomPlugin;
class ImageHoverZoomSettingTab extends obsidian_1.PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }
    display() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: '图片布局临时缩放' });
        containerEl.createEl('p', {
            text: '缩放只改变当前 Obsidian DOM，不修改 Markdown、图片附件、alt 或图片路径。'
        });
        new obsidian_1.Setting(containerEl)
            .setName('缩放组合键')
            .setDesc('鼠标放到正文图片上，按住该按键再滚动。默认 Shift。')
            .addDropdown((dropdown) => dropdown
            .addOption('Shift', 'Shift')
            .addOption('Alt', 'Alt')
            .addOption('Ctrl', 'Ctrl')
            .addOption('Meta', 'Meta / Command')
            .setValue(this.plugin.settings.modifier)
            .onChange(async (value) => {
            this.plugin.settings.modifier = value;
            await this.plugin.saveSettings();
        }));
        new obsidian_1.Setting(containerEl)
            .setName('每次缩放幅度')
            .setDesc('默认 0.15，即每格约 15%。')
            .addSlider((slider) => slider
            .setLimits(0.05, 0.5, 0.05)
            .setValue(this.plugin.settings.step)
            .setDynamicTooltip()
            .onChange(async (value) => {
            this.plugin.settings.step = value;
            await this.plugin.saveSettings();
        }));
        new obsidian_1.Setting(containerEl)
            .setName('最大放大倍率')
            .setDesc('例如 4.0 表示最多放大到首次显示尺寸的 400%。')
            .addSlider((slider) => slider
            .setLimits(1.5, 8, 0.5)
            .setValue(this.plugin.settings.maxScale)
            .setDynamicTooltip()
            .onChange(async (value) => {
            this.plugin.settings.maxScale = value;
            await this.plugin.saveSettings();
        }));
        new obsidian_1.Setting(containerEl)
            .setName('显示临时倍率提示')
            .setDesc('缩放时在鼠标附近短暂显示倍率和当前像素尺寸。')
            .addToggle((toggle) => toggle
            .setValue(this.plugin.settings.showScaleBadge)
            .onChange(async (value) => {
            this.plugin.settings.showScaleBadge = value;
            if (!value)
                this.plugin.removeBadge();
            await this.plugin.saveSettings();
        }));
        containerEl.createEl('h2', { text: '图片相框主题' });
        containerEl.createEl('p', {
            text: '重要：相框只作用于标准 Markdown 图片语法 ![]()。不会给 # / ## 标题、![[图片]]、Callout 图标、Obsidian 界面图片或 HTML <img> 套边框。'
        });
        new obsidian_1.Setting(containerEl)
            .setName('启用图片相框')
            .setDesc('关闭后只保留图片缩放功能。')
            .addToggle((toggle) => toggle
            .setValue(this.plugin.settings.frameEnabled)
            .onChange(async (value) => {
            this.plugin.settings.frameEnabled = value;
            await this.plugin.saveSettings();
            this.plugin.refreshFrameClasses();
        }));
        new obsidian_1.Setting(containerEl)
            .setName('主题预设')
            .setDesc(this.getThemeDescription())
            .addDropdown((dropdown) => {
            for (const theme of Object.values(FRAME_THEMES)) {
                dropdown.addOption(theme.id, theme.name);
            }
            dropdown.addOption('custom', '自定义');
            dropdown.setValue(this.plugin.settings.frameTheme);
            dropdown.onChange(async (value) => {
                const themeId = value;
                if (themeId !== 'custom')
                    this.plugin.applyTheme(themeId);
                else
                    this.plugin.settings.frameTheme = 'custom';
                await this.plugin.saveSettings();
                this.plugin.refreshFrameClasses();
                this.display();
            });
        });
        // 主题说明卡片，方便快速理解各预设的用途。
        const themeList = containerEl.createDiv({ cls: 'xyblue135-theme-list' });
        for (const theme of Object.values(FRAME_THEMES)) {
            const item = themeList.createDiv({ cls: 'xyblue135-theme-item' });
            item.createEl('strong', { text: theme.name });
            item.createSpan({ text: ` — ${theme.description}` });
        }
        containerEl.createEl('h3', { text: '高级自定义' });
        containerEl.createEl('p', {
            text: '下面任意参数一旦手动修改，主题会自动切换为“自定义”。你也可以随时重新选择某个预设恢复整套参数。'
        });
        this.addNumberSlider(containerEl, '主体边框厚度', '最靠近图片的边框厚度。', 'frameBorderWidth', 1, 10, 1);
        this.addNumberSlider(containerEl, '像素层级粗细', '控制外侧三层框的扩张步幅。MC 风格建议 1。', 'framePixelUnit', 1, 3, 1);
        this.addNumberSlider(containerEl, '相框外侧留白', '相框与旁边文字之间的距离。', 'frameMargin', 0, 28, 1);
        this.addNumberSlider(containerEl, '圆角', '0 为 MC 方块像素风；冰霜、赛博主题可使用更大圆角。', 'frameRadius', 0, 18, 1);
        this.addColorSetting(containerEl, '主体颜色', '最靠近图片的主体边框颜色。', 'frameMainColor');
        this.addColorSetting(containerEl, '底层颜色', '图片边缘底色。', 'frameBackgroundColor');
        this.addColorSetting(containerEl, '内层深色', '第一层深色纹理。', 'frameInnerDarkColor');
        this.addColorSetting(containerEl, '高亮颜色', '中间高亮层。', 'frameLightColor');
        this.addColorSetting(containerEl, '外层颜色', '最外层边框颜色。', 'frameOuterColor');
        this.addColorSetting(containerEl, '阴影颜色', '相框外侧投影颜色。', 'frameShadowColor');
        new obsidian_1.Setting(containerEl)
            .setName('阴影强度')
            .setDesc('0 表示关闭投影；只影响阴影，不影响多层边框。')
            .addSlider((slider) => slider
            .setLimits(0, 0.7, 0.02)
            .setValue(this.plugin.settings.frameShadowOpacity)
            .setDynamicTooltip()
            .onChange(async (value) => {
            this.plugin.markThemeCustom();
            this.plugin.settings.frameShadowOpacity = value;
            await this.plugin.saveSettings();
        }));
        new obsidian_1.Setting(containerEl)
            .setName('恢复当前预设')
            .setDesc('如果当前是自定义，则恢复默认 MC 樱花木；否则重新载入当前预设的完整参数。')
            .addButton((button) => button
            .setButtonText('恢复')
            .onClick(async () => {
            const current = this.plugin.settings.frameTheme;
            const target = current === 'custom' ? 'mc-cherry' : current;
            this.plugin.applyTheme(target);
            await this.plugin.saveSettings();
            this.plugin.refreshFrameClasses();
            this.display();
        }));
    }
    getThemeDescription() {
        const id = this.plugin.settings.frameTheme;
        if (id === 'custom')
            return '当前使用自定义参数。';
        const theme = FRAME_THEMES[id];
        return `${theme.name}：${theme.description}`;
    }
    addNumberSlider(containerEl, name, desc, key, min, max, step) {
        new obsidian_1.Setting(containerEl)
            .setName(name)
            .setDesc(desc)
            .addSlider((slider) => slider
            .setLimits(min, max, step)
            .setValue(this.plugin.settings[key])
            .setDynamicTooltip()
            .onChange(async (value) => {
            this.plugin.markThemeCustom();
            this.plugin.settings[key] = value;
            await this.plugin.saveSettings();
        }));
    }
    addColorSetting(containerEl, name, desc, key) {
        new obsidian_1.Setting(containerEl)
            .setName(name)
            .setDesc(desc)
            .addColorPicker((picker) => picker
            .setValue(this.plugin.settings[key])
            .onChange(async (value) => {
            this.plugin.markThemeCustom();
            this.plugin.settings[key] = value;
            await this.plugin.saveSettings();
        }))
            .addText((text) => text
            .setPlaceholder('#d88f9f')
            .setValue(this.plugin.settings[key])
            .onChange(async (value) => {
            if (!/^#[0-9a-fA-F]{6}$/.test(value))
                return;
            this.plugin.markThemeCustom();
            this.plugin.settings[key] = value;
            await this.plugin.saveSettings();
        }));
    }
}
