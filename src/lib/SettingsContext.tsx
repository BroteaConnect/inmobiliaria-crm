// The React half of the settings store — provider, cache and useSetting().
// The rules and the defaults live in settings.ts, which has no React in it and
// is therefore unit-tested; this file only wires them to the app.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { loadSettings, saveSetting } from '../crm/api';
import {
  DEFAULTS,
  adapterOf,
  mergeSettings,
  moduleEnabled,
  readCache,
  writeCache,
  type SettingValue,
  type SettingsMap,
} from './settings';
import type { AdapterKind } from '../integrations/types';

interface SettingsContextValue {
  settings: SettingsMap;
  /** false until the first answer (or refusal) from the database. */
  ready: boolean;
  /**
   * Is the database actually holding these values? False means the collection
   * is missing or unreachable and the app is running on defaults plus whatever
   * this browser remembers — Configuration says so out loud instead of
   * pretending a choice was shared with the rest of the team.
   */
  remote: boolean;
  save: (key: string, value: SettingValue) => Promise<void>;
}

const Ctx = createContext<SettingsContextValue>({
  settings: DEFAULTS,
  ready: false,
  remote: false,
  save: async () => {},
});

export function SettingsProvider({ children }: { children: ReactNode }) {
  // First paint runs on the cache, so a slow round trip never shows an empty
  // nav that then fills in.
  const [settings, setSettings] = useState<SettingsMap>(() => readCache());
  const [ready, setReady] = useState(false);
  const [remote, setRemote] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const rows = await loadSettings();
        if (!alive) return;
        const merged = mergeSettings(rows);
        setSettings(merged);
        writeCache(merged);
        setRemote(true);
      } catch {
        if (alive) setRemote(false);
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => { alive = false; };
  }, []);

  const save = useCallback(async (key: string, value: SettingValue) => {
    // Optimistic on purpose: a toggle that waits for a round trip before moving
    // reads as broken, and the worst case here is a preference that did not
    // travel to the other device — which the screen then reports.
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      writeCache(next);
      return next;
    });
    try {
      await saveSetting(key, value);
      setRemote(true);
    } catch (err) {
      setRemote(false);
      throw err;
    }
  }, []);

  const value = useMemo(() => ({ settings, ready, remote, save }), [settings, ready, remote, save]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useSettings = () => useContext(Ctx);

/** The raw value of one key — always defined, because defaults cover every key. */
export const useSetting = (key: string): SettingValue | undefined => useSettings().settings[key];

/** Is this module switched on? Used to filter both the nav and the routes. */
export const useModuleEnabled = (key?: string): boolean => {
  const { settings } = useSettings();
  return key ? moduleEnabled(settings, key) : true;
};

/** Which adapter an integration is set to. */
export const useAdapterKind = (key: string): AdapterKind => adapterOf(useSettings().settings, key);
