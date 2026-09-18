import {
  App,
  ColorComponent,
  DropdownComponent,
  ExtraButtonComponent,
  Notice,
  PluginSettingTab,
  Setting,
  SliderComponent,
} from "obsidian";

import {
  ADVANCED_BLOCKQUOTE_OPTIONS,
  ADVANCED_CODE_COLOR_OPTIONS,
  ADVANCED_CODE_SLIDER_OPTIONS,
  ADVANCED_LIST_COLOR_OPTIONS,
  ADVANCED_LIST_OPTIONS,
  ADVANCED_TAG_OPTIONS,
  COLOR_OPTIONS_BY_KEY,
  HEADING_DEFAULTS,
  HEADING_LEVELS,
  PROFILE_LABELS,
  TYPOGRAPHY_COLOR_OPTIONS,
  TYPOGRAPHY_OPTIONS,
} from "./constants";
import { formatNumber } from "./utils";

import type DefaultThemeStyleTunerPlugin from "./main";
import type { ColorOption, HeadingLevel, ProfileMode, SliderOption } from "./types";

/**
 * A unique token minted every time {@link display} runs.  Each async handler
 * captures the token that was current when it was created.  Before touching
 * the UI the handler compares its token with the live one – if they differ,
 * the settings tab has been re-rendered since the handler was created and the
 * handler should bail out instead of operating on stale DOM.
 */
type DisplayToken = symbol;

export class DefaultThemeStyleTunerSettingTab extends PluginSettingTab {
  /**
   * The current display token.  Replaced on every {@link display} call.
   * Handlers compare their captured token against this to detect staleness.
   */
  private displayToken: DisplayToken = Symbol();

  /** Cached Base16 YAML text – lives on the instance so it survives re-renders. */
  private base16Yaml = "";

  constructor(app: App, private readonly plugin: DefaultThemeStyleTunerPlugin) {
    super(app, plugin);
  }

  override hide(): void {
    this.containerEl.empty();
  }

  refreshDisplayPreserveScroll(): void {
    const containers = [this.containerEl, this.containerEl.parentElement].filter(
      (element): element is HTMLElement => element instanceof HTMLElement
    );
    const scrollPositions = containers.map((element) => ({
      element,
      top: element.scrollTop,
    }));

    this.display();

    const restoreScrollPosition = (): void => {
      for (const { element, top } of scrollPositions) {
        element.scrollTop = top;
      }
    };

    restoreScrollPosition();
    requestAnimationFrame(() => {
      restoreScrollPosition();
      requestAnimationFrame(() => {
        restoreScrollPosition();
      });
    });
  }

  override display(): void {
    // Mint a fresh token – any handler from a previous display() is now stale.
    const token: DisplayToken = Symbol();
    this.displayToken = token;

    const { containerEl } = this;
    const editedMode = this.plugin.getEditedProfileMode();
    const otherMode = editedMode === "light" ? "dark" : "light";

    containerEl.empty();
    containerEl.addClass("xyblue135-theme-settings");

    // ── Profile controls ──────────────────────────────────────────────
    new Setting(containerEl)
      .setName("编辑的配置")
      .setDesc("选择要编辑浅色还是深色配置。")
      .addDropdown((dropdown: DropdownComponent) => {
        dropdown
          .addOption("light", "浅色")
          .addOption("dark", "深色")
          .setValue(editedMode)
          .onChange(async (value) => {
            if (this.isStale(token)) return;
            if ((value !== "light" && value !== "dark") || value === editedMode) {
              return;
            }

            await this.plugin.setEditedProfileMode(value);
            if (this.isStale(token)) return;
            this.display();
          });
      });

    new Setting(containerEl)
      .setName("复制当前配置")
      .setDesc(
        `将 ${PROFILE_LABELS[editedMode]} 的所有值复制到 ${PROFILE_LABELS[otherMode]} 配置。`
      )
      .addButton((button) =>
        button.setButtonText(`复制到 ${PROFILE_LABELS[otherMode]}`).onClick(async () => {
          if (this.isStale(token)) return;
          await this.plugin.copyProfile(editedMode, otherMode);
          new Notice(`已将 ${PROFILE_LABELS[editedMode]} 配置复制到 ${PROFILE_LABELS[otherMode]}。`);
          if (this.isStale(token)) return;
          this.refreshDisplayPreserveScroll();
        })
      );

    new Setting(containerEl)
      .setName(`重置 ${PROFILE_LABELS[editedMode]} 配置`)
      .setDesc(`清除 ${PROFILE_LABELS[editedMode]} 配置中的所有覆盖。`)
      .addButton((button) =>
        button.setWarning().setButtonText("重置配置").onClick(async () => {
          if (this.isStale(token)) return;
          await this.plugin.resetProfile(editedMode);
          new Notice(`${PROFILE_LABELS[editedMode]} 配置已重置。`);
          if (this.isStale(token)) return;
          this.refreshDisplayPreserveScroll();
        })
      );

    new Setting(containerEl)
      .setName("重置两个配置")
      .setDesc("清除浅色与深色配置中的所有覆盖。")
      .addButton((button) =>
        button.setWarning().setButtonText("全部重置").onClick(async () => {
          if (this.isStale(token)) return;
          await this.plugin.resetAllSettings();
          if (this.isStale(token)) return;
          this.refreshDisplayPreserveScroll();
        })
      );

    // ── Import / Export ──────────────────────────────────────────────────
    const ioSection = this.createSection(
      containerEl,
      "导入 / 导出",
      "分享配置，或生成独立的 CSS 片段。"
    );

    new Setting(ioSection)
      .setName("导出设置")
      .setDesc("将当前设置下载为 JSON 文件，可稍后导入或分享给他人。")
      .addButton((button) =>
        button
          .setButtonText("导出 JSON")
          .setIcon("lucide-download")
          .onClick(() => {
            this.plugin.exportSettingsJson();
          })
      );

    new Setting(ioSection)
      .setName("导入设置")
      .setDesc("从之前导出的 JSON 文件加载设置，这会覆盖当前设置。")
      .addButton((button) =>
        button
          .setButtonText("导入 JSON")
          .setIcon("lucide-upload")
          .onClick(() => {
            this.plugin.importSettingsJson(() => {
              this.refreshDisplayPreserveScroll();
            });
          })
      );

    new Setting(ioSection)
      .setName("导出为 CSS 片段")
      .setDesc(
        `将当前样式覆盖保存到 ${this.app.vault.configDir}/snippets/xyblue135-theme.css。 ` +
        "随后可在「外观 → CSS 代码片段」中启用，无需插件即可使用。"
      )
      .addButton((button) =>
        button
          .setButtonText("导出片段")
          .setIcon("lucide-file-code")
          .onClick(async () => {
            await this.plugin.exportCssSnippet();
          })
      );

    // ── Base16 import ──────────────────────────────────────────────────
    const base16Section = this.createSection(
      containerEl,
      "导入 Base16 主题",
      `从 Base16 YAML 配色方案为 ${PROFILE_LABELS[editedMode]} 配置填充颜色。 ` +
      "16 种基础颜色会映射到背景、文字、链接、标题等。 " +
      "结果是近似值 —— 可作为起点，之后再微调各项数值。"
    );

    new Setting(base16Section)
      .setName("Base16 YAML")
      .setDesc(
        "在下方粘贴 Base16 .yaml 文件的完整内容。 " +
        "包含 base00–base0F 十六进制值的行会被自动识别，其余行会被忽略。"
      )
      .addTextArea((textarea) => {
        textarea
          .setPlaceholder(
            '在此粘贴 Base16 YAML。'
          )
          .setValue(this.base16Yaml)
          .onChange((value) => {
            this.base16Yaml = value;
          });
        textarea.inputEl.rows = 9;
        textarea.inputEl.addClass("xyblue135-theme-base16-textarea");
      });

    new Setting(base16Section).addButton((button) =>
      button
        .setButtonText(`应用到 ${PROFILE_LABELS[editedMode]} 配置`)
        .setCta()
        .onClick(async () => {
          if (this.isStale(token)) return;
          const yaml = this.base16Yaml;
          const result = await this.plugin.applyBase16Theme(yaml, editedMode);
          if (result.success) {
            new Notice(
              `已将 ${result.count} 个 Base16 颜色应用到 ${PROFILE_LABELS[editedMode]} 配置。`
            );
            if (this.isStale(token)) return;
            this.refreshDisplayPreserveScroll();
          } else {
            new Notice(
              '未找到 Base16 颜色。请确保 YAML 中包含类似 base00: "f8f8f8" 的行。'
            );
          }
        })
    );

    // ── Style settings ────────────────────────────────────────────────
    const backgroundsSection = this.createSection(
      containerEl,
      "背景",
      "应用界面、笔记表面与编辑器背景颜色。"
    );
    for (const option of [
      COLOR_OPTIONS_BY_KEY.backgroundPrimary,
      COLOR_OPTIONS_BY_KEY.backgroundSecondary,
      COLOR_OPTIONS_BY_KEY.backgroundPrimaryAlt,
      COLOR_OPTIONS_BY_KEY.backgroundSecondaryAlt,
    ]) {
      if (option) {
        this.addColorSetting(backgroundsSection, editedMode, option, token);
      }
    }

    const linksSection = this.createSection(
      containerEl,
      "链接与强调",
      "内部链接、外部链接、粗体、斜体与高亮文字；链接悬停色自动计算。"
    );
    this.addOptionalColorSetting(linksSection, editedMode, COLOR_OPTIONS_BY_KEY.linkColor, token);
    this.addOptionalColorSetting(linksSection, editedMode, COLOR_OPTIONS_BY_KEY.externalLinkColor, token);
    this.addOptionalColorSetting(linksSection, editedMode, COLOR_OPTIONS_BY_KEY.unresolvedLinkColor, token);
    this.addOptionalColorSetting(linksSection, editedMode, COLOR_OPTIONS_BY_KEY.boldColor, token);
    this.addOptionalColorSetting(linksSection, editedMode, COLOR_OPTIONS_BY_KEY.italicColor, token);
    this.addOptionalColorSetting(linksSection, editedMode, COLOR_OPTIONS_BY_KEY.highlightBackground, token);

    const typographySection = this.createSection(
      containerEl,
      "排版",
      "两种模式下笔记正文的基础字号与行距。"
    );
    for (const option of TYPOGRAPHY_COLOR_OPTIONS) {
      this.addColorSetting(typographySection, editedMode, option, token);
    }
    for (const option of TYPOGRAPHY_OPTIONS) {
      this.addSliderSetting(typographySection, editedMode, option, token);
    }

    const headingsSection = this.createSection(
      containerEl,
      "标题",
      "各级标题的颜色、字号、字重与行高。"
    );
    for (const level of HEADING_LEVELS) {
      this.addHeadingSetting(headingsSection, editedMode, level, token);
    }

    const advancedSection = this.createSection(
      containerEl,
      "高级",
      "默认主题笔记样式的更多控制项。"
    );

    this.addSubheading(
      advancedSection,
      "列表与分割线",
      "调整列表间距、缩进与分割线样式。"
    );
    for (const option of ADVANCED_LIST_OPTIONS) {
      this.addSliderSetting(advancedSection, editedMode, option, token);
    }
    for (const option of ADVANCED_LIST_COLOR_OPTIONS) {
      this.addColorSetting(advancedSection, editedMode, option, token);
    }

    this.addSubheading(
      advancedSection,
      "引用块",
      "自定义引用块的文字、背景与边框颜色。"
    );
    for (const option of ADVANCED_BLOCKQUOTE_OPTIONS) {
      this.addColorSetting(advancedSection, editedMode, option, token);
    }

    this.addSubheading(
      advancedSection,
      "代码",
      "控制行内代码与代码块的颜色和字号。"
    );
    for (const option of ADVANCED_CODE_COLOR_OPTIONS) {
      this.addColorSetting(advancedSection, editedMode, option, token);
    }
    for (const option of ADVANCED_CODE_SLIDER_OPTIONS) {
      this.addSliderSetting(advancedSection, editedMode, option, token);
    }

    this.addSubheading(advancedSection, "标签", "设置阅读模式与实时预览中的标签样式。");
    for (const option of ADVANCED_TAG_OPTIONS) {
      this.addColorSetting(advancedSection, editedMode, option, token);
    }
  }

  /**
   * Returns `true` when the given token no longer matches the live
   * {@link displayToken}, meaning the settings tab has been re-rendered and
   * any DOM references captured by the caller are stale.
   */
  private isStale(token: DisplayToken): boolean {
    return token !== this.displayToken;
  }

  private createSection(containerEl: HTMLElement, title: string, description: string): HTMLElement {
    const groupEl = containerEl.createDiv("setting-group");
    new Setting(groupEl).setName(title).setDesc(description).setHeading();
    return groupEl.createDiv("setting-items");
  }

  private addSubheading(containerEl: HTMLElement, title: string, description: string): void {
    new Setting(containerEl).setName(title).setDesc(description).setHeading();
  }

  private addOptionalColorSetting(
    containerEl: HTMLElement,
    mode: ProfileMode,
    option: ColorOption | undefined,
    token: DisplayToken
  ): void {
    if (option) {
      this.addColorSetting(containerEl, mode, option, token);
    }
  }

  private addColorSetting(
    containerEl: HTMLElement,
    mode: ProfileMode,
    option: ColorOption,
    token: DisplayToken
  ): void {
    let colorPickerComponent: ColorComponent | null = null;
    let resetButton: ExtraButtonComponent | null = null;
    const hasOverride = Boolean(this.plugin.getProfile(mode)[option.key]);
    let isSyncing = false;

    new Setting(containerEl)
      .setName(option.name)
      .setDesc(`${option.description} 重置以继承主题默认值。`)
      .addExtraButton((button) => {
        resetButton = button;
        button
          .setIcon("lucide-rotate-ccw")
          .setTooltip("重置为主题默认值")
          .setDisabled(!hasOverride)
          .onClick(async () => {
            if (this.isStale(token)) return;
            await this.plugin.resetProfileValue(mode, option.key);
            if (this.isStale(token)) return;
            resetButton?.setDisabled(true);
            const pickerHex = this.plugin.styleManager.getDefaultColorValue(
              mode,
              option.key,
              option.variableName
            );
            isSyncing = true;
            colorPickerComponent?.setValue(pickerHex);
            isSyncing = false;
          });
      })
      .addColorPicker((picker) => {
        colorPickerComponent = picker;
        picker
          .setValue(
            this.plugin.styleManager.getDefaultColorValue(mode, option.key, option.variableName)
          )
          .onChange(async (value) => {
            if (isSyncing || this.isStale(token)) return;
            await this.plugin.setProfileValue(mode, option.key, value);
            if (this.isStale(token)) return;
            resetButton?.setDisabled(false);
          });
      });
  }

  private addSliderSetting(
    containerEl: HTMLElement,
    mode: ProfileMode,
    option: SliderOption,
    token: DisplayToken
  ): void {
    let sliderComponent: SliderComponent | null = null;
    let resetButton: ExtraButtonComponent | null = null;
    const hasOverride = Boolean(this.plugin.getProfile(mode)[option.key]);
    let isSyncing = false;

    const fallbackValue = this.plugin.styleManager.getDefaultNumericValue(
      mode,
      option.key,
      option.variableName,
      option.defaultValue
    );

    new Setting(containerEl)
      .setName(option.name)
      .setDesc(`${option.description} 重置以继承主题默认值。`)
      .addExtraButton((button) => {
        resetButton = button;
        button
          .setIcon("lucide-rotate-ccw")
          .setTooltip("重置为主题默认值")
          .setDisabled(!hasOverride)
          .onClick(async () => {
            if (this.isStale(token)) return;
            await this.plugin.resetProfileValue(mode, option.key);
            if (this.isStale(token)) return;
            resetButton?.setDisabled(true);
            const resetValue = this.plugin.styleManager.getDefaultNumericValue(
              mode,
              option.key,
              option.variableName,
              option.defaultValue
            );
            isSyncing = true;
            sliderComponent?.setValue(
              this.plugin.styleManager.ensureWithinRange(
                resetValue,
                option.min,
                option.max,
                option.defaultValue
              )
            );
            isSyncing = false;
          });
      })
      .addSlider((slider) => {
        sliderComponent = slider;
        slider
          .setLimits(option.min, option.max, option.step)
          .setDynamicTooltip()
          .setValue(
            this.plugin.styleManager.ensureWithinRange(
              fallbackValue,
              option.min,
              option.max,
              option.defaultValue
            )
          )
          .onChange(async (value) => {
            if (isSyncing || this.isStale(token)) return;
            await this.plugin.setProfileValue(
              mode,
              option.key,
              `${formatNumber(value)}${option.unit}`
            );
            if (this.isStale(token)) return;
            resetButton?.setDisabled(false);
          });
      });
  }

  private addHeadingSetting(
    containerEl: HTMLElement,
    mode: ProfileMode,
    level: HeadingLevel,
    token: DisplayToken
  ): void {
    const defaults = HEADING_DEFAULTS[level];

    new Setting(containerEl).setName(`H${level}`).setHeading();

    this.addColorSetting(containerEl, mode, {
      key: `h${level}Color`,
      name: "颜色",
      description: `H${level} 标题的文字颜色。`,
      variableName: `--h${level}-color`,
    }, token);

    this.addSliderSetting(containerEl, mode, {
      key: `h${level}Size`,
      name: "字号",
      description: `H${level} 标题的字号。`,
      variableName: `--h${level}-size`,
      min: 0.8,
      max: 3,
      step: 0.01,
      unit: "em",
      defaultValue: defaults.size,
    }, token);

    this.addSliderSetting(containerEl, mode, {
      key: `h${level}Weight`,
      name: "字重",
      description: `H${level} 标题的字重。`,
      variableName: `--h${level}-weight`,
      min: 100,
      max: 900,
      step: 100,
      unit: "",
      defaultValue: defaults.weight,
    }, token);

    this.addSliderSetting(containerEl, mode, {
      key: `h${level}LineHeight`,
      name: "行高",
      description: `H${level} 标题的行高。`,
      variableName: `--h${level}-line-height`,
      min: 1,
      max: 2.2,
      step: 0.05,
      unit: "",
      defaultValue: defaults.lineHeight,
    }, token);
  }
}
