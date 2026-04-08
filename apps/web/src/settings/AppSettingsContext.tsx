import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface AppSettingsValue {
  syncEnabled: boolean;
  ignoredKinds: string[];
  setSyncEnabled: (value: boolean) => void;
  addIgnoredKinds: (value: string) => void;
  removeIgnoredKind: (value: string) => void;
  isKindIgnored: (value?: string | null) => boolean;
}

const STORAGE_KEY = "dlq-organizer-settings-v1";

const AppSettingsContext = createContext<AppSettingsValue | null>(null);

function normalizeKind(value: string) {
  return value.trim().toUpperCase();
}

function parseIgnoredKinds(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[\n,]+/)
        .map(normalizeKind)
        .filter(Boolean),
    ),
  );
}

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const [syncEnabled, setSyncEnabledState] = useState(true);
  const [ignoredKinds, setIgnoredKinds] = useState<string[]>([]);

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as {
        syncEnabled?: boolean;
        ignoredKinds?: string[];
      };

      setSyncEnabledState(parsed.syncEnabled ?? true);
      setIgnoredKinds(
        Array.from(
          new Set((parsed.ignoredKinds ?? []).map(normalizeKind).filter(Boolean)),
        ),
      );
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        syncEnabled,
        ignoredKinds,
      }),
    );
  }, [ignoredKinds, syncEnabled]);

  const value = useMemo<AppSettingsValue>(
    () => ({
      syncEnabled,
      ignoredKinds,
      setSyncEnabled: setSyncEnabledState,
      addIgnoredKinds: (input) => {
        const values = parseIgnoredKinds(input);
        if (values.length === 0) {
          return;
        }

        setIgnoredKinds((current) => Array.from(new Set([...current, ...values])));
      },
      removeIgnoredKind: (input) => {
        const normalized = normalizeKind(input);
        setIgnoredKinds((current) => current.filter((item) => item !== normalized));
      },
      isKindIgnored: (input) => {
        if (!input) {
          return false;
        }

        return ignoredKinds.includes(normalizeKind(input));
      },
    }),
    [ignoredKinds, syncEnabled],
  );

  return (
    <AppSettingsContext.Provider value={value}>{children}</AppSettingsContext.Provider>
  );
}

export function useAppSettings() {
  const context = useContext(AppSettingsContext);

  if (!context) {
    throw new Error("useAppSettings must be used within AppSettingsProvider");
  }

  return context;
}
