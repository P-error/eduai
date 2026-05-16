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
  applyUiVersionToDocument,
  DEFAULT_UI_VERSION,
  persistUiVersion,
  readStoredUiVersion,
  type UiVersion,
} from "@/lib/ui-version";

type UiVersionContextValue = {
  uiVersion: UiVersion;
  isV2: boolean;
  setUiVersion: (version: UiVersion) => void;
};

const UiVersionContext = createContext<UiVersionContextValue | null>(null);

export function UiVersionProvider({
  initialVersion = DEFAULT_UI_VERSION,
  children,
}: {
  initialVersion?: UiVersion;
  children: ReactNode;
}) {
  const [uiVersion, setUiVersionState] = useState<UiVersion>(initialVersion);

  useEffect(() => {
    let cancelled = false;
    window.setTimeout(() => {
      if (cancelled) return;
      const storedVersion = readStoredUiVersion(initialVersion);
      setUiVersionState(storedVersion);
      applyUiVersionToDocument(storedVersion);
    }, 0);
    return () => {
      cancelled = true;
    };
  }, [initialVersion]);

  useEffect(() => {
    applyUiVersionToDocument(uiVersion);
  }, [uiVersion]);

  const value = useMemo<UiVersionContextValue>(
    () => ({
      uiVersion,
      isV2: uiVersion === "v2",
      setUiVersion: (version) => {
        setUiVersionState(version);
        persistUiVersion(version);
        applyUiVersionToDocument(version);
      },
    }),
    [uiVersion],
  );

  return (
    <UiVersionContext.Provider value={value}>
      {children}
    </UiVersionContext.Provider>
  );
}

export function useUiVersion() {
  const context = useContext(UiVersionContext);
  if (!context) {
    throw new Error("UiVersionProvider is missing.");
  }
  return context;
}
