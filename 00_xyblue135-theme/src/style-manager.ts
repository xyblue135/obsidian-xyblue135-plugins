import { debounce } from "obsidian";

import { BODY_CLASS, CSS_VARIABLE_NAMES, CSS_VARIABLES } from "./constants";
import { clamp, formatNumber, rgbToHsl, sanitizeCssValue } from "./utils";

import type DefaultThemeStyleTunerPlugin from "./main";
import type { ProfileMode, RgbColor, StringProfileKey } from "./types";

const OFFSCREEN_CLASS = "xyblue135-theme-offscreen";

const CAPTURED_THEME_VARIABLE_NAMES = [
  ...CSS_VARIABLE_NAMES,
  "--tag-border-width",
] as const;

const APPLIED_STYLE_VARIABLE_NAMES = [
  ...CAPTURED_THEME_VARIABLE_NAMES,
  "--tag-color-hover",
  "--tag-background-hover",
  "--tag-border-color-hover",
] as const;

export class StyleManager {
  private appliedBody: HTMLElement | null = null;

  private themeDefaults: Record<ProfileMode, Record<string, string>> = {
    light: {},
    dark: {},
  };

  /** Color resolution cache — keyed by raw CSS value, maps to picker hex or null. */
  private pickerHexCache = new Map<string, string | null>();

  /** Auto-hover color cache — keyed by mode + base value. */
  private hoverColorCache = new Map<string, string>();

  /** Reused off-screen element for color resolution. */
  private colorProbe: HTMLDivElement | null = null;

  /** Debounced style application — coalesces rapid changes. */
  private debouncedApply = debounce(() => {
    const body = this.getManagedBody();
    body.classList.add(BODY_CLASS);
    this.clearCssVariables(body);
    const appliedMode = this.plugin.getAppliedProfileMode();
    body.setCssProps(this.buildCssPropertiesForMode(appliedMode));
  }, 16, true);

  constructor(private readonly plugin: DefaultThemeStyleTunerPlugin) { }

  private getWorkspaceBody(): HTMLElement {
    return this.plugin.app.workspace.containerEl.ownerDocument.body;
  }

  private getManagedBody(): HTMLElement {
    const body = this.getWorkspaceBody();

    if (this.appliedBody && this.appliedBody !== body) {
      this.appliedBody.classList.remove(BODY_CLASS);
      this.clearCssVariables(this.appliedBody);
    }

    this.appliedBody = body;
    return body;
  }

  private getDocumentWindow(doc: Document): Window {
    const docWindow = doc.defaultView;
    if (!docWindow) {
      throw new Error("Document is not attached to a window.");
    }

    return docWindow;
  }

  private getColorProbe(): HTMLDivElement {
    const body = this.getWorkspaceBody();

    if (this.colorProbe && this.colorProbe.ownerDocument !== body.ownerDocument) {
      this.colorProbe.remove();
      this.colorProbe = null;
    }

    if (!this.colorProbe) {
      this.colorProbe = body.createDiv({ cls: OFFSCREEN_CLASS });
    }

    return this.colorProbe;
  }

  cleanup(): void {
    this.debouncedApply.cancel();

    if (this.appliedBody) {
      this.appliedBody.classList.remove(BODY_CLASS);
      this.clearCssVariables(this.appliedBody);
      this.appliedBody = null;
    }

    this.colorProbe?.remove();
    this.colorProbe = null;
  }

  refreshThemeDefaults(): void {
    this.pickerHexCache.clear();
    this.hoverColorCache.clear();

    const body = this.getManagedBody();
    const hadPluginClass = body.classList.contains(BODY_CLASS);
    const previousInlineValues = this.captureInlineVariableValues(body, APPLIED_STYLE_VARIABLE_NAMES);

    if (hadPluginClass) {
      body.classList.remove(BODY_CLASS);
    }

    this.clearCssVariables(body);

    this.themeDefaults = {
      light: this.captureThemeDefaultsForMode("light"),
      dark: this.captureThemeDefaultsForMode("dark"),
    };

    this.restoreInlineVariableValues(body, previousInlineValues);

    if (hadPluginClass) {
      body.classList.add(BODY_CLASS);
    }
  }

  getThemeDefaultVariableValue(variableName: string, mode: ProfileMode): string {
    return this.themeDefaults[mode]?.[variableName] ?? "";
  }

  getDefaultNumericValue(
    mode: ProfileMode,
    key: StringProfileKey,
    variableName: string,
    fallbackNumber: number
  ): number {
    const explicitValue = this.plugin.getProfile(mode)[key];
    const parsedValue = Number.parseFloat(
      explicitValue || this.getThemeDefaultVariableValue(variableName, mode)
    );

    return Number.isFinite(parsedValue) ? parsedValue : fallbackNumber;
  }

  getDefaultColorValue(mode: ProfileMode, key: StringProfileKey, variableName: string): string {
    const pickerHex = this.tryToPickerHex(
      this.plugin.getProfile(mode)[key] || this.getThemeDefaultVariableValue(variableName, mode)
    );
    if (pickerHex) {
      return pickerHex;
    }

    // Some color variables (e.g. --h1-color, --bold-color) are not defined as
    // standalone custom properties by the theme.  The corresponding CSS rules
    // use `var(--h1-color)` without a fallback, which causes Obsidian to
    // treat the property as "invalid at computed-value time" and inherit from
    // the parent – effectively inheriting --text-normal.  Mirror that behaviour
    // in the picker so the swatch shows the correct inherited colour instead of
    // the hardcoded #000000 fallback.
    return this.tryToPickerHex(
      this.getThemeDefaultVariableValue("--text-normal", mode)
    ) ?? "#000000";
  }

  ensureWithinRange(value: number, min: number, max: number, fallback: number): number {
    if (!Number.isFinite(value)) {
      return fallback;
    }

    return clamp(value, min, max);
  }

  tryToPickerHex(value: string): string | null {
    const sanitizedValue = sanitizeCssValue(value);
    if (!sanitizedValue) {
      return null;
    }

    const cached = this.pickerHexCache.get(sanitizedValue);
    if (cached !== undefined) {
      return cached;
    }

    if (/^#[0-9a-f]{6}$/i.test(sanitizedValue)) {
      this.pickerHexCache.set(sanitizedValue, sanitizedValue);
      return sanitizedValue;
    }

    const rgb = this.resolveColor(sanitizedValue);
    if (!rgb) {
      this.pickerHexCache.set(sanitizedValue, null);
      return null;
    }

    const hex = `#${rgb.r.toString(16).padStart(2, "0")}${rgb.g.toString(16).padStart(2, "0")}${rgb.b.toString(16).padStart(2, "0")}`;
    this.pickerHexCache.set(sanitizedValue, hex);
    return hex;
  }

  buildCssPropertiesForMode(mode: ProfileMode): Record<string, string> {
    const profile = this.plugin.getProfile(mode);
    const effectiveProfile = {
      ...profile,
      linkHoverColor: profile.linkColor
        ? this.computeAutoHoverColor(mode, profile.linkColor)
        : "",
      externalLinkHoverColor: profile.externalLinkColor
        ? this.computeAutoHoverColor(mode, profile.externalLinkColor)
        : "",
    };

    const cssProps: Record<string, string> = Object.fromEntries(
      Object.entries(CSS_VARIABLES)
        .map(([key, variableName]) => [
          variableName,
          sanitizeCssValue(effectiveProfile[key as StringProfileKey]),
        ] as const)
        .filter(([, value]) => Boolean(value))
    );

    const tagColor = sanitizeCssValue(profile.tagColor);
    const tagBackground = sanitizeCssValue(profile.tagBackground);
    const tagBorderColor = sanitizeCssValue(profile.tagBorderColor);
    const tagHoverBackground = tagBackground
      ? this.computeAutoHoverColor(mode, tagBackground)
      : "";

    if (tagColor) {
      cssProps["--tag-color-hover"] = tagColor;
    }

    if (tagHoverBackground) {
      cssProps["--tag-background-hover"] = tagHoverBackground;
    }

    if (tagBorderColor) {
      cssProps["--tag-border-color-hover"] = tagBorderColor;

      const themeBorderWidth = Number.parseFloat(
        this.getThemeDefaultVariableValue("--tag-border-width", mode)
      );
      if (!Number.isFinite(themeBorderWidth) || themeBorderWidth <= 0) {
        cssProps["--tag-border-width"] = "1px";
      }
    }

    return cssProps;
  }

  applyStyles(): void {
    this.debouncedApply();
  }

  generateSnippetCss(): string {
    const timestamp = new Date().toISOString().split("T")[0];
    const lines: string[] = [
      `/* 由 xyblue135-theme 插件生成于 ${timestamp} */`,
      `/* 此片段应用与插件相同的 CSS 变量覆盖。 */`,
      `/* 停用插件并启用此片段，即可获得等效的独立样式。 */`,
      "",
    ];

    const addBlock = (selector: string, props: Record<string, string>): void => {
      const entries = Object.entries(props);
      if (entries.length === 0) return;
      lines.push(`${selector} {`);
      for (const [prop, value] of entries) {
        lines.push(`  ${prop}: ${value};`);
      }
      lines.push(`}`, ``);
    };

    addBlock("body.theme-light", this.buildCssPropertiesForMode("light"));
    addBlock("body.theme-dark", this.buildCssPropertiesForMode("dark"));

    // If both profiles were empty, note that in the file
    if (lines.length === 4) {
      lines.push(`/* 当前未设置任何覆盖 — 无可导出内容。 */`, ``);
    }

    return lines.join("\n").trimEnd() + "\n";
  }

  private clearCssVariables(body: HTMLElement): void {
    // setCssProps can only set values; removing a custom property requires
    // removeProperty so that theme defaults are restored rather than overridden
    // with an empty string.
    for (const variableName of APPLIED_STYLE_VARIABLE_NAMES) {
      body.style.removeProperty(variableName);
    }
  }

  private captureThemeDefaultsForMode(mode: ProfileMode): Record<string, string> {
    // Use an offscreen element to avoid toggling classes on the live body,
    // which would force a full document style recalculation.
    const offscreen = this.getWorkspaceBody().createDiv({
      cls: [OFFSCREEN_CLASS, mode === "light" ? "theme-light" : "theme-dark"],
    });

    const computedStyle = this.getDocumentWindow(offscreen.ownerDocument).getComputedStyle(offscreen);
    const defaults = Object.fromEntries(
      CAPTURED_THEME_VARIABLE_NAMES.map((variableName) => [
        variableName,
        computedStyle.getPropertyValue(variableName).trim(),
      ])
    );

    offscreen.remove();
    return defaults;
  }

  private captureInlineVariableValues(
    body: HTMLElement,
    variableNames: readonly string[]
  ): Record<string, string> {
    return Object.fromEntries(
      variableNames.map((variableName) => [variableName, body.style.getPropertyValue(variableName)])
    );
  }

  private restoreInlineVariableValues(body: HTMLElement, values: Record<string, string>): void {
    const toSet: Record<string, string> = {};
    for (const [variableName, value] of Object.entries(values)) {
      if (value) {
        toSet[variableName] = value;
      } else {
        body.style.removeProperty(variableName);
      }
    }

    body.setCssProps(toSet);
  }

  private resolveColor(value: string): RgbColor | null {
    const sanitizedValue = sanitizeCssValue(value);
    if (!sanitizedValue || !CSS.supports("color", sanitizedValue)) {
      return null;
    }

    const probe = this.getColorProbe();
    probe.setCssProps({ color: sanitizedValue });
    const resolvedColor = this.getDocumentWindow(probe.ownerDocument).getComputedStyle(probe).color;

    const match = resolvedColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/i);
    if (!match) {
      return null;
    }

    return {
      r: Number(match[1]),
      g: Number(match[2]),
      b: Number(match[3]),
      a: match[4] ? Number(match[4]) : 1,
    };
  }

  private computeAutoHoverColor(mode: ProfileMode, baseValue: string): string {
    const cacheKey = `${mode}:${baseValue}`;
    const cached = this.hoverColorCache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const rgbColor = this.resolveColor(baseValue);
    if (!rgbColor) {
      this.hoverColorCache.set(cacheKey, "");
      return "";
    }

    const hslColor = rgbToHsl(rgbColor.r, rgbColor.g, rgbColor.b);
    const hoverLightnessDelta = mode === "dark" ? 3.8 : 5;
    const hoverLightness = clamp(hslColor.l + hoverLightnessDelta, 0, 100);
    const result = `hsl(${formatNumber(hslColor.h, 1)}, ${formatNumber(hslColor.s, 1)}%, ${formatNumber(hoverLightness, 1)}%)`;
    this.hoverColorCache.set(cacheKey, result);
    return result;
  }
}
