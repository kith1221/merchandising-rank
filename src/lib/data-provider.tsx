"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { idbDelete, idbGet, idbSet } from "./idb";
import { summarizeRange } from "./ingest/dataset";
import { sanitizeSettings } from "./settings-guard";
import type { Dataset, Settings } from "./types";
import { DEFAULT_SETTINGS, EMPTY_DATASET } from "./types";

const DATASET_KEY = "dataset:v1";
const SETTINGS_KEY = "settings:v1";

type Status = "loading" | "ready" | "error";

interface DataContextValue {
  status: Status;
  error: string | null;
  persistError: string | null;
  dataset: Dataset;
  settings: Settings;
  hasSales: boolean;
  saveDataset: (dataset: Dataset) => Promise<void>;
  clearDataset: () => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => void;
  dismissPersistError: () => void;
}

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [persistError, setPersistError] = useState<string | null>(null);
  const [dataset, setDataset] = useState<Dataset>(EMPTY_DATASET);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  useEffect(() => {
    let active = true;

    async function hydrate() {
      try {
        const [storedDataset, storedSettings] = await Promise.all([
          idbGet<Dataset>(DATASET_KEY),
          idbGet<Settings>(SETTINGS_KEY),
        ]);
        if (!active) return;
        if (storedDataset && Array.isArray(storedDataset.sales)) {
          const range = summarizeRange(storedDataset.sales);
          setDataset({
            sales: storedDataset.sales,
            stock: Array.isArray(storedDataset.stock) ? storedDataset.stock : [],
            importedAt: storedDataset.importedAt ?? "",
            sources: Array.isArray(storedDataset.sources) ? storedDataset.sources : [],
            minDate: storedDataset.minDate ?? range.minDate,
            maxDate: storedDataset.maxDate ?? range.maxDate,
          });
        }
        if (storedSettings) setSettings(sanitizeSettings(storedSettings));
      } catch (caught) {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : "Gagal membaca data tersimpan");
      } finally {
        if (active) setStatus("ready");
      }
    }

    void hydrate();
    return () => {
      active = false;
    };
  }, []);

  const saveDataset = useCallback(async (next: Dataset) => {
    const range = summarizeRange(next.sales);
    const enriched: Dataset = { ...next, minDate: range.minDate, maxDate: range.maxDate };
    setDataset(enriched);
    try {
      await idbSet(DATASET_KEY, enriched);
      setPersistError(null);
    } catch (caught) {
      setPersistError(
        `${caught instanceof Error ? caught.message : "Gagal menyimpan data"} - Data tampil di layar tapi tidak tersimpan permanen.`,
      );
      throw caught instanceof Error ? caught : new Error("Gagal menyimpan data");
    }
  }, []);

  const clearDataset = useCallback(async () => {
    try {
      await idbDelete(DATASET_KEY);
      setPersistError(null);
    } catch (caught) {
      setPersistError(
        `${caught instanceof Error ? caught.message : "Gagal menghapus data"} - Coba lagi atau kosongkan data browser.`,
      );
      throw caught instanceof Error ? caught : new Error("Gagal menghapus data");
    }
    setDataset(EMPTY_DATASET);
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((current) => {
      const next = sanitizeSettings({ ...current, ...patch });
      void idbSet(SETTINGS_KEY, next).catch((caught: unknown) => {
        setPersistError(
          `${caught instanceof Error ? caught.message : "Gagal menyimpan pengaturan"} - Pengaturan hanya berlaku di sesi ini.`,
        );
      });
      return next;
    });
  }, []);

  const dismissPersistError = useCallback(() => setPersistError(null), []);

  const value = useMemo<DataContextValue>(
    () => ({
      status,
      error,
      persistError,
      dataset,
      settings,
      hasSales: dataset.sales.length > 0,
      saveDataset,
      clearDataset,
      updateSettings,
      dismissPersistError,
    }),
    [status, error, persistError, dataset, settings, saveDataset, clearDataset, updateSettings, dismissPersistError],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const context = useContext(DataContext);
  if (!context) throw new Error("useData harus dipakai di dalam <DataProvider>");
  return context;
}

export function useSales(): Dataset["sales"] {
  return useData().dataset.sales;
}

export function useSettings(): Settings {
  return useData().settings;
}
