export type ProfileMode = "light" | "dark";

export interface DefaultThemeStyleTunerProfile {
  backgroundPrimary: string;
  backgroundSecondary: string;
  backgroundPrimaryAlt: string;
  backgroundSecondaryAlt: string;
  textNormal: string;
  textMuted: string;
  textFaint: string;
  linkColor: string;
  linkHoverColor: string;
  externalLinkColor: string;
  externalLinkHoverColor: string;
  unresolvedLinkColor: string;
  boldColor: string;
  italicColor: string;
  highlightBackground: string;
  fontTextSize: string;
  lineHeightNormal: string;
  pSpacing: string;
  listIndent: string;
  listSpacing: string;
  hrColor: string;
  hrThickness: string;
  blockquoteColor: string;
  blockquoteBackgroundColor: string;
  blockquoteBorderColor: string;
  codeNormal: string;
  codeBackground: string;
  codeSize: string;
  tagColor: string;
  tagBackground: string;
  tagBorderColor: string;
  h1Color: string;
  h1Size: string;
  h1Weight: string;
  h1LineHeight: string;
  h2Color: string;
  h2Size: string;
  h2Weight: string;
  h2LineHeight: string;
  h3Color: string;
  h3Size: string;
  h3Weight: string;
  h3LineHeight: string;
  h4Color: string;
  h4Size: string;
  h4Weight: string;
  h4LineHeight: string;
  h5Color: string;
  h5Size: string;
  h5Weight: string;
  h5LineHeight: string;
  h6Color: string;
  h6Size: string;
  h6Weight: string;
  h6LineHeight: string;
}

export interface DefaultThemeStyleTunerSettings {
  version: number;
  uiProfile: ProfileMode;
  profiles: Record<ProfileMode, DefaultThemeStyleTunerProfile>;
}

export type StringProfileKey = {
  [Key in keyof DefaultThemeStyleTunerProfile]: DefaultThemeStyleTunerProfile[Key] extends string ? Key : never;
}[keyof DefaultThemeStyleTunerProfile];

export interface BaseProfileOption<Key extends StringProfileKey = StringProfileKey> {
  key: Key;
  name: string;
  description: string;
  variableName: string;
}

export type ColorOption<Key extends StringProfileKey = StringProfileKey> = BaseProfileOption<Key>;

export interface SliderOption<Key extends StringProfileKey = StringProfileKey>
  extends BaseProfileOption<Key> {
  min: number;
  max: number;
  step: number;
  unit: string;
  defaultValue: number;
}

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface HeadingDefaults {
  size: number;
  weight: number;
  lineHeight: number;
}

export interface HslColor {
  h: number;
  s: number;
  l: number;
}

export interface RgbColor {
  r: number;
  g: number;
  b: number;
  a: number;
}
