"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  applyUiPreferencesToDocument,
  DEFAULT_UI_PREFERENCES,
  persistUiPreferences,
  type UiContrastMode,
  type UiFontScale,
  type UiPreferences,
  type UiThemeMode,
} from "@/lib/ui-preferences";

type UiPreferencesContextValue = UiPreferences & {
  setTheme: (theme: UiThemeMode) => void;
  setFontScale: (fontScale: UiFontScale) => void;
  setContrast: (contrast: UiContrastMode) => void;
};

const UiPreferencesContext = createContext<UiPreferencesContextValue | null>(null);

export function UiPreferencesProvider({
  initialPreferences = DEFAULT_UI_PREFERENCES,
  children,
}: {
  initialPreferences?: UiPreferences;
  children: ReactNode;
}) {
  const [preferences, setPreferences] = useState<UiPreferences>(initialPreferences);

  useEffect(() => {
    applyUiPreferencesToDocument(preferences);
  }, [preferences]);

  const value = useMemo<UiPreferencesContextValue>(() => {
    const update = (patch: Partial<UiPreferences>) => {
      setPreferences((current) => {
        const next = { ...current, ...patch };
        persistUiPreferences(next);
        return next;
      });
    };

    return {
      ...preferences,
      setTheme: (theme) => update({ theme }),
      setFontScale: (fontScale) => update({ fontScale }),
      setContrast: (contrast) => update({ contrast }),
    };
  }, [preferences]);

  return (
    <UiPreferencesContext.Provider value={value}>
      {children}
    </UiPreferencesContext.Provider>
  );
}

export function useUiPreferences() {
  const context = useContext(UiPreferencesContext);
  if (!context) {
    throw new Error("UiPreferencesProvider is missing.");
  }
  return context;
}
