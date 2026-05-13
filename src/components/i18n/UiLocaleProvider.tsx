"use client";

import { createContext, useContext, useEffect, useState } from "react";
import {
  DEFAULT_UI_LOCALE,
  getUiMessages,
  persistUiLocale,
  type UiLocale,
  type UiMessages,
} from "@/lib/ui-locale";

type UiLocaleContextValue = {
  locale: UiLocale;
  messages: UiMessages;
  setLocale: (locale: UiLocale) => void;
};

const UiLocaleContext = createContext<UiLocaleContextValue | null>(null);

export function UiLocaleProvider({
  initialLocale = DEFAULT_UI_LOCALE,
  children,
}: {
  initialLocale?: UiLocale;
  children: React.ReactNode;
}) {
  const [locale, setLocaleState] = useState<UiLocale>(initialLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return (
    <UiLocaleContext.Provider
      value={{
        locale,
        messages: getUiMessages(locale),
        setLocale: (nextLocale) => {
          setLocaleState(nextLocale);
          persistUiLocale(nextLocale);
        },
      }}
    >
      {children}
    </UiLocaleContext.Provider>
  );
}

export function useUiLocale() {
  const context = useContext(UiLocaleContext);
  if (!context) {
    throw new Error("UiLocaleProvider is missing.");
  }
  return context;
}
