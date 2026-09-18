import type { DefaultThemeStyleTunerProfile, HslColor } from "./types";

const BLOCKED_CSS_PATTERNS = /url\s*\(|expression\s*\(|@import|behavior\s*:|\\00/gi;

export function sanitizeCssValue(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  const normalized = value.trim().replace(/\s+/g, " ").replace(/[;{}]/g, "");

  if (BLOCKED_CSS_PATTERNS.test(normalized)) {
    return "";
  }

  return normalized;
}

export function cloneProfile(
  profile: DefaultThemeStyleTunerProfile
): DefaultThemeStyleTunerProfile {
  return { ...profile };
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function formatNumber(value: number, maxDecimals = 3): string {
  if (!Number.isFinite(value)) {
    return "";
  }

  return value
    .toFixed(maxDecimals)
    .replace(/\.0+$/, "")
    .replace(/(\.\d*?)0+$/, "$1");
}

export function parseNumericValue(value: string): number | null {
  const numericValue = Number.parseFloat(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function rgbToHsl(r: number, g: number, b: number): HslColor {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let hue = 0;
  let saturation = 0;
  const lightness = (max + min) / 2;

  if (delta !== 0) {
    saturation = delta / (1 - Math.abs(2 * lightness - 1));

    switch (max) {
      case red:
        hue = 60 * ((((green - blue) / delta) % 6 + 6) % 6);
        break;
      case green:
        hue = 60 * ((blue - red) / delta + 2);
        break;
      default:
        hue = 60 * ((red - green) / delta + 4);
        break;
    }
  }

  if (hue < 0) {
    hue += 360;
  }

  return {
    h: hue,
    s: saturation * 100,
    l: lightness * 100,
  };
}
