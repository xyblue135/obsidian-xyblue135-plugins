import type {
  ColorOption,
  DefaultThemeStyleTunerProfile,
  DefaultThemeStyleTunerSettings,
  HeadingDefaults,
  HeadingLevel,
  ProfileMode,
  SliderOption,
  StringProfileKey,
} from "./types";

export const BODY_CLASS = "xyblue135-theme-active";

export const PROFILE_LABELS: Record<ProfileMode, string> = {
  light: "浅色",
  dark: "深色",
};

export const DEFAULT_PROFILE: DefaultThemeStyleTunerProfile = {
  backgroundPrimary: "",
  backgroundSecondary: "",
  backgroundPrimaryAlt: "",
  backgroundSecondaryAlt: "",
  textNormal: "",
  textMuted: "",
  textFaint: "",
  linkColor: "",
  linkHoverColor: "",
  externalLinkColor: "",
  externalLinkHoverColor: "",
  unresolvedLinkColor: "",
  boldColor: "",
  italicColor: "",
  highlightBackground: "",
  fontTextSize: "",
  lineHeightNormal: "",
  pSpacing: "",
  listIndent: "",
  listSpacing: "",
  hrColor: "",
  hrThickness: "",
  blockquoteColor: "",
  blockquoteBackgroundColor: "",
  blockquoteBorderColor: "",
  codeNormal: "",
  codeBackground: "",
  codeSize: "",
  tagColor: "",
  tagBackground: "",
  tagBorderColor: "",
  h1Color: "",
  h1Size: "",
  h1Weight: "",
  h1LineHeight: "",
  h2Color: "",
  h2Size: "",
  h2Weight: "",
  h2LineHeight: "",
  h3Color: "",
  h3Size: "",
  h3Weight: "",
  h3LineHeight: "",
  h4Color: "",
  h4Size: "",
  h4Weight: "",
  h4LineHeight: "",
  h5Color: "",
  h5Size: "",
  h5Weight: "",
  h5LineHeight: "",
  h6Color: "",
  h6Size: "",
  h6Weight: "",
  h6LineHeight: "",
};

export const DEFAULT_SETTINGS: DefaultThemeStyleTunerSettings = {
  version: 2,
  uiProfile: "light",
  profiles: {
    light: { ...DEFAULT_PROFILE },
    dark: { ...DEFAULT_PROFILE },
  },
};

export const PROFILE_KEYS = Object.keys(DEFAULT_PROFILE) as Array<keyof DefaultThemeStyleTunerProfile>;

export const CSS_VARIABLES: Record<StringProfileKey, string> = {
  backgroundPrimary: "--background-primary",
  backgroundSecondary: "--background-secondary",
  backgroundPrimaryAlt: "--background-primary-alt",
  backgroundSecondaryAlt: "--background-secondary-alt",
  textNormal: "--text-normal",
  textMuted: "--text-muted",
  textFaint: "--text-faint",
  linkColor: "--link-color",
  linkHoverColor: "--link-color-hover",
  externalLinkColor: "--link-external-color",
  externalLinkHoverColor: "--link-external-color-hover",
  unresolvedLinkColor: "--link-unresolved-color",
  boldColor: "--bold-color",
  italicColor: "--italic-color",
  highlightBackground: "--text-highlight-bg",
  fontTextSize: "--font-text-size",
  lineHeightNormal: "--line-height-normal",
  pSpacing: "--p-spacing",
  listIndent: "--list-indent",
  listSpacing: "--list-spacing",
  hrColor: "--hr-color",
  hrThickness: "--hr-thickness",
  blockquoteColor: "--blockquote-color",
  blockquoteBackgroundColor: "--blockquote-background-color",
  blockquoteBorderColor: "--blockquote-border-color",
  codeNormal: "--code-normal",
  codeBackground: "--code-background",
  codeSize: "--code-size",
  tagColor: "--tag-color",
  tagBackground: "--tag-background",
  tagBorderColor: "--tag-border-color",
  h1Color: "--h1-color",
  h1Size: "--h1-size",
  h1Weight: "--h1-weight",
  h1LineHeight: "--h1-line-height",
  h2Color: "--h2-color",
  h2Size: "--h2-size",
  h2Weight: "--h2-weight",
  h2LineHeight: "--h2-line-height",
  h3Color: "--h3-color",
  h3Size: "--h3-size",
  h3Weight: "--h3-weight",
  h3LineHeight: "--h3-line-height",
  h4Color: "--h4-color",
  h4Size: "--h4-size",
  h4Weight: "--h4-weight",
  h4LineHeight: "--h4-line-height",
  h5Color: "--h5-color",
  h5Size: "--h5-size",
  h5Weight: "--h5-weight",
  h5LineHeight: "--h5-line-height",
  h6Color: "--h6-color",
  h6Size: "--h6-size",
  h6Weight: "--h6-weight",
  h6LineHeight: "--h6-line-height",
};

export const CSS_VARIABLE_NAMES = [...new Set(Object.values(CSS_VARIABLES))];

export const COLOR_OPTIONS: ColorOption[] = [
  {
    key: "backgroundPrimary",
    name: "主背景",
    description: "笔记主体与应用主背景颜色。",
    variableName: CSS_VARIABLES.backgroundPrimary,
  },
  {
    key: "backgroundSecondary",
    name: "次背景",
    description: "侧边栏与次要区域颜色。",
    variableName: CSS_VARIABLES.backgroundSecondary,
  },
  {
    key: "backgroundPrimaryAlt",
    name: "主背景（备用）",
    description: "主区域的备用颜色。",
    variableName: CSS_VARIABLES.backgroundPrimaryAlt,
  },
  {
    key: "backgroundSecondaryAlt",
    name: "次背景（备用）",
    description: "次要区域的备用颜色。",
    variableName: CSS_VARIABLES.backgroundSecondaryAlt,
  },
  {
    key: "linkColor",
    name: "内部链接颜色",
    description: "内部链接默认颜色，悬停色自动计算。",
    variableName: CSS_VARIABLES.linkColor,
  },
  {
    key: "linkHoverColor",
    name: "内部链接悬停颜色",
    description: "内部链接悬停时的颜色。",
    variableName: CSS_VARIABLES.linkHoverColor,
  },
  {
    key: "externalLinkColor",
    name: "外部链接颜色",
    description: "外部链接与原始 URL 的颜色，悬停色自动计算。",
    variableName: CSS_VARIABLES.externalLinkColor,
  },
  {
    key: "externalLinkHoverColor",
    name: "外部链接悬停颜色",
    description: "外部链接与原始 URL 悬停时的颜色。",
    variableName: CSS_VARIABLES.externalLinkHoverColor,
  },
  {
    key: "unresolvedLinkColor",
    name: "未解析链接颜色",
    description: "未解析内部链接的颜色。",
    variableName: CSS_VARIABLES.unresolvedLinkColor,
  },
  {
    key: "boldColor",
    name: "粗体颜色",
    description: "粗体文字的颜色。",
    variableName: CSS_VARIABLES.boldColor,
  },
  {
    key: "italicColor",
    name: "斜体颜色",
    description: "斜体文字的颜色。",
    variableName: CSS_VARIABLES.italicColor,
  },
  {
    key: "highlightBackground",
    name: "高亮背景",
    description: "==高亮==文字的背景色。如需透明度可输入 rgba() 或带 alpha 的值。",
    variableName: CSS_VARIABLES.highlightBackground,
  },
];

export const TYPOGRAPHY_COLOR_OPTIONS: ColorOption[] = [
  {
    key: "textNormal",
    name: "正文文字颜色",
    description: "笔记正文的主要文字颜色。",
    variableName: CSS_VARIABLES.textNormal,
  },
  {
    key: "textMuted",
    name: "次要文字颜色",
    description: "用于较低强调的次要文字颜色。",
    variableName: CSS_VARIABLES.textMuted,
  },
  {
    key: "textFaint",
    name: "淡色文字颜色",
    description: "UI 与 Markdown 语法的淡色文字颜色。",
    variableName: CSS_VARIABLES.textFaint,
  },
];

export const TYPOGRAPHY_OPTIONS: SliderOption[] = [
  {
    key: "fontTextSize",
    name: "基础字号",
    description: "阅读模式与实时预览的正文文字大小。",
    variableName: CSS_VARIABLES.fontTextSize,
    min: 12,
    max: 28,
    step: 1,
    unit: "px",
    defaultValue: 16,
  },
  {
    key: "lineHeightNormal",
    name: "行高",
    description: "笔记正文的行距。",
    variableName: CSS_VARIABLES.lineHeightNormal,
    min: 1.2,
    max: 2.2,
    step: 0.05,
    unit: "",
    defaultValue: 1.5,
  },
  {
    key: "pSpacing",
    name: "段落间距",
    description: "段落与标题的垂直间距。",
    variableName: CSS_VARIABLES.pSpacing,
    min: 0,
    max: 2.5,
    step: 0.05,
    unit: "rem",
    defaultValue: 1,
  },
];

export const ADVANCED_LIST_OPTIONS: SliderOption[] = [
  {
    key: "listIndent",
    name: "列表缩进",
    description: "列表内容的水平缩进。",
    variableName: CSS_VARIABLES.listIndent,
    min: 1,
    max: 4,
    step: 0.05,
    unit: "em",
    defaultValue: 2,
  },
  {
    key: "listSpacing",
    name: "列表间距",
    description: "列表项之间的垂直间距。",
    variableName: CSS_VARIABLES.listSpacing,
    min: 0,
    max: 0.5,
    step: 0.01,
    unit: "em",
    defaultValue: 0.075,
  },
  {
    key: "hrThickness",
    name: "分割线粗细",
    description: "水平分割线的粗细。",
    variableName: CSS_VARIABLES.hrThickness,
    min: 1,
    max: 8,
    step: 1,
    unit: "px",
    defaultValue: 2,
  },
];

export const ADVANCED_LIST_COLOR_OPTIONS: ColorOption[] = [
  {
    key: "hrColor",
    name: "分割线颜色",
    description: "水平分割线的颜色。",
    variableName: CSS_VARIABLES.hrColor,
  },
];

export const ADVANCED_BLOCKQUOTE_OPTIONS: ColorOption[] = [
  {
    key: "blockquoteColor",
    name: "引用文字颜色",
    description: "引用块的文字颜色。",
    variableName: CSS_VARIABLES.blockquoteColor,
  },
  {
    key: "blockquoteBackgroundColor",
    name: "引用背景",
    description: "引用块的背景颜色。",
    variableName: CSS_VARIABLES.blockquoteBackgroundColor,
  },
  {
    key: "blockquoteBorderColor",
    name: "引用边框颜色",
    description: "引用块左侧边框的颜色。",
    variableName: CSS_VARIABLES.blockquoteBorderColor,
  },
];

export const ADVANCED_CODE_COLOR_OPTIONS: ColorOption[] = [
  {
    key: "codeNormal",
    name: "代码文字颜色",
    description: "行内代码与代码块的文字颜色。",
    variableName: CSS_VARIABLES.codeNormal,
  },
  {
    key: "codeBackground",
    name: "代码背景",
    description: "行内代码与代码块的背景颜色。",
    variableName: CSS_VARIABLES.codeBackground,
  },
];

export const ADVANCED_CODE_SLIDER_OPTIONS: SliderOption[] = [
  {
    key: "codeSize",
    name: "代码字号",
    description: "行内代码与围栏代码块的字号。",
    variableName: CSS_VARIABLES.codeSize,
    min: 0.7,
    max: 1.3,
    step: 0.01,
    unit: "em",
    defaultValue: 0.875,
  },
];

export const ADVANCED_TAG_OPTIONS: ColorOption[] = [
  {
    key: "tagColor",
    name: "标签文字颜色",
    description: "标签的文字颜色。",
    variableName: CSS_VARIABLES.tagColor,
  },
  {
    key: "tagBackground",
    name: "标签背景",
    description: "标签的背景颜色。",
    variableName: CSS_VARIABLES.tagBackground,
  },
  {
    key: "tagBorderColor",
    name: "标签边框颜色",
    description: "标签的边框颜色。",
    variableName: CSS_VARIABLES.tagBorderColor,
  },
];

export const COLOR_OPTIONS_BY_KEY = Object.fromEntries(
  COLOR_OPTIONS.map((option) => [option.key, option])
) as Partial<Record<StringProfileKey, ColorOption>>;

export const HEADING_LEVELS: HeadingLevel[] = [1, 2, 3, 4, 5, 6];

export const HEADING_DEFAULTS: Record<HeadingLevel, HeadingDefaults> = {
  1: { size: 1.802, weight: 700, lineHeight: 1.2 },
  2: { size: 1.602, weight: 600, lineHeight: 1.2 },
  3: { size: 1.424, weight: 600, lineHeight: 1.3 },
  4: { size: 1.266, weight: 600, lineHeight: 1.4 },
  5: { size: 1.125, weight: 600, lineHeight: 1.5 },
  6: { size: 1, weight: 600, lineHeight: 1.5 },
};
