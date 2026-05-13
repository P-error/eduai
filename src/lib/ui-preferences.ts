export const UI_THEME_COOKIE_NAME = "eduai_ui_theme";
export const UI_FONT_SCALE_COOKIE_NAME = "eduai_ui_font_scale";
export const UI_CONTRAST_COOKIE_NAME = "eduai_ui_contrast";

export const UI_THEME_MODES = ["system", "light", "dark"] as const;
export const UI_FONT_SCALES = ["100", "110", "125", "140"] as const;
export const UI_CONTRAST_MODES = ["off", "high"] as const;

export type UiThemeMode = (typeof UI_THEME_MODES)[number];
export type UiFontScale = (typeof UI_FONT_SCALES)[number];
export type UiContrastMode = (typeof UI_CONTRAST_MODES)[number];

export type UiPreferences = {
  theme: UiThemeMode;
  fontScale: UiFontScale;
  contrast: UiContrastMode;
};

export const DEFAULT_UI_PREFERENCES: UiPreferences = {
  theme: "system",
  fontScale: "100",
  contrast: "off",
};

export function isUiThemeMode(value: string | null | undefined): value is UiThemeMode {
  return value === "system" || value === "light" || value === "dark";
}

export function isUiFontScale(value: string | null | undefined): value is UiFontScale {
  return value === "100" || value === "110" || value === "125" || value === "140";
}

export function isUiContrastMode(
  value: string | null | undefined,
): value is UiContrastMode {
  return value === "off" || value === "high";
}

export function normalizeUiThemeMode(value: string | null | undefined): UiThemeMode {
  return isUiThemeMode(value) ? value : DEFAULT_UI_PREFERENCES.theme;
}

export function normalizeUiFontScale(value: string | null | undefined): UiFontScale {
  return isUiFontScale(value) ? value : DEFAULT_UI_PREFERENCES.fontScale;
}

export function normalizeUiContrastMode(
  value: string | null | undefined,
): UiContrastMode {
  return isUiContrastMode(value) ? value : DEFAULT_UI_PREFERENCES.contrast;
}

export function normalizeUiPreferences(input?: Partial<Record<keyof UiPreferences, string>>) {
  return {
    theme: normalizeUiThemeMode(input?.theme),
    fontScale: normalizeUiFontScale(input?.fontScale),
    contrast: normalizeUiContrastMode(input?.contrast),
  } satisfies UiPreferences;
}

function persistCookie(name: string, value: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${value}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

export function persistUiPreferences(preferences: UiPreferences) {
  persistCookie(UI_THEME_COOKIE_NAME, preferences.theme);
  persistCookie(UI_FONT_SCALE_COOKIE_NAME, preferences.fontScale);
  persistCookie(UI_CONTRAST_COOKIE_NAME, preferences.contrast);
}

export function applyUiPreferencesToDocument(preferences: UiPreferences) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.uiTheme = preferences.theme;
  root.dataset.uiFontScale = preferences.fontScale;
  root.dataset.uiContrast = preferences.contrast;
}
