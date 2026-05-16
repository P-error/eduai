export const UI_VERSION_COOKIE_NAME = "eduai_ui_version";
export const UI_VERSION_STORAGE_KEY = "eduai.uiVersion";

export const UI_VERSIONS = ["classic", "v2"] as const;

export type UiVersion = (typeof UI_VERSIONS)[number];

export const DEFAULT_UI_VERSION: UiVersion = "classic";

export function isUiVersion(value: string | null | undefined): value is UiVersion {
  return value === "classic" || value === "v2";
}

export function normalizeUiVersion(value: string | null | undefined): UiVersion {
  return isUiVersion(value) ? value : DEFAULT_UI_VERSION;
}

function persistUiVersionCookie(value: UiVersion) {
  if (typeof document === "undefined") return;
  document.cookie = `${UI_VERSION_COOKIE_NAME}=${value}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

export function persistUiVersion(value: UiVersion) {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(UI_VERSION_STORAGE_KEY, value);
    } catch {
      // Ошибки хранилища не должны ломать интерфейс.
    }
  }
  persistUiVersionCookie(value);
}

export function readStoredUiVersion(fallback: UiVersion = DEFAULT_UI_VERSION): UiVersion {
  if (typeof window === "undefined") return fallback;
  try {
    const stored = window.localStorage.getItem(UI_VERSION_STORAGE_KEY);
    return isUiVersion(stored) ? stored : fallback;
  } catch {
    return DEFAULT_UI_VERSION;
  }
}

export function applyUiVersionToDocument(value: UiVersion) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.uiVersion = value;
}
