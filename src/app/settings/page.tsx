"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Eye,
  EyeOff,
  HardDrive,
  Key,
  MonitorSmartphone,
  Moon,
  Palette,
  Plus,
  RotateCcw,
  Save,
  Settings as SettingsIcon,
  Sparkles,
  Sun,
  Trash2,
} from "lucide-react";
import { useData } from "@/lib/data-provider";
import { estimateStorage } from "@/lib/idb";
import { summarize } from "@/lib/analytics";
import { useTheme } from "@/components/ThemeProvider";
import { formatNumber, formatRupiah } from "@/lib/format";
import { DEFAULT_SETTINGS, type AiProvider, type MarkdownTier } from "@/lib/types";

export default function SettingsPage() {
  const { dataset, settings, updateSettings, clearDataset, saveDataset } = useData();
  const { mode, resolved, setMode } = useTheme();
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [aiDraft, setAiDraft] = useState(settings.ai);
  const [keyEdited, setKeyEdited] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [detectedModels, setDetectedModels] = useState<string[]>([]);
  const [aiStatus, setAiStatus] = useState<{ kind: "ok" | "error" | "busy" | "idle"; text: string }>({ kind: "idle", text: "" });
  const [envConfig, setEnvConfig] = useState<{ provider: AiProvider; model: string } | null>(null);
  const [envConfigured, setEnvConfigured] = useState(false);

  // Nilai yang dipakai form: setelah user menyentuh (keyEdited) pakai draft,
  // sebelum itu langsung menampilkan settings yang tersimpan di browser.
  const effectiveAi = keyEdited ? aiDraft : settings.ai;

  useEffect(() => {
    void fetch("/api/ai/insights")
      .then((response) => response.json())
      .then((data) => {
        setEnvConfigured(Boolean(data.envConfigured));
        setEnvConfig(data.configFromEnv ?? null);
      })
      .catch(() => {
        setEnvConfigured(false);
      });
  }, []);

  useEffect(() => {
    void estimateStorage().then(setStorage);
  }, [dataset]);

  const summary = useMemo(
    () => summarize(dataset.sales, dataset.stock, dataset.minDate, dataset.maxDate),
    [dataset],
  );

  function updateTier(index: number, patch: Partial<MarkdownTier>) {
    updateSettings({
      markdownLadder: settings.markdownLadder.map((tier, position) => (position === index ? { ...tier, ...patch } : tier)),
    });
  }

  function addTier() {
    const lowest = settings.markdownLadder.reduce((acc, tier) => Math.min(acc, tier.minWeeksCover), 0);
    updateSettings({ markdownLadder: [...settings.markdownLadder, { minWeeksCover: Math.max(0, lowest - 4), discount: 10 }] });
  }

  function removeTier(index: number) {
    if (settings.markdownLadder.length <= 1) return;
    updateSettings({ markdownLadder: settings.markdownLadder.filter((_, position) => position !== index) });
  }

  async function runDetect() {
    const apiKey = effectiveAi.apiKey.trim();
    if (!apiKey) {
      setAiStatus({ kind: "error", text: "Masukkan API key terlebih dahulu." });
      return;
    }
    setDetecting(true);
    setAiStatus({ kind: "busy", text: "Menghubungi provider untuk mendeteksi model..." });
    try {
      const response = await fetch("/api/ai/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, provider: effectiveAi.provider || undefined }),
      });
      const data = await response.json();
      if (!data.ok) {
        setAiStatus({ kind: "error", text: data.error ?? "Deteksi gagal." });
        return;
      }
      const providerName = data.provider === "gemini" ? "Gemini" : "Groq";
      setDetectedModels(data.models ?? []);
      setKeyEdited(true);
      setAiDraft((current) => ({ ...current, provider: data.provider, model: data.suggestedModel ?? current.model }));
      setAiStatus({
        kind: "ok",
        text: `Terhubung ke ${providerName}: ${(data.models ?? []).length} model tersedia. Model "${data.suggestedModel ?? ""}" disarankan.`,
      });
    } catch {
      setAiStatus({ kind: "error", text: "Gagal menghubungi server. Pastikan dev server berjalan." });
    } finally {
      setDetecting(false);
    }
  }

  function saveAi() {
    const next = { provider: effectiveAi.provider, apiKey: effectiveAi.apiKey.trim(), model: effectiveAi.model.trim() };
    setAiDraft(next);
    setKeyEdited(false);
    updateSettings({ ai: next });
    setAiStatus({ kind: "ok", text: "Pengaturan AI disimpan di browser." });
  }

  function clearAi() {
    setAiDraft({ provider: "", apiKey: "", model: "" });
    setKeyEdited(false);
    setDetectedModels([]);
    updateSettings({ ai: { provider: "", apiKey: "", model: "" } });
    setAiStatus({ kind: "ok", text: "Key yang tersimpan dihapus; kini memakai key dari .env (bila ada)." });
  }

  return (
    <section className="feature-section mt-4">
      <div className="feature-card glass-panel" style={{ gridColumn: "1 / -1" }}>
        <div className="feature-header">
          <h3>
            <Palette size={20} style={{ display: "inline", marginRight: 8 }} />
            Tampilan
          </h3>
          <p>
            Tema gelap untuk ruang kerja, tema terang untuk presentasi atau proyektor. Pilihan disimpan di browser ini dan mengikuti
            pengaturan sistem bila memilih Otomatis.
          </p>
        </div>
        <div className="theme-segment">
          {(
            [
              { value: "dark", label: "Gelap", icon: Moon },
              { value: "light", label: "Terang", icon: Sun },
              { value: "system", label: "Otomatis", icon: MonitorSmartphone },
            ] as const
          ).map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.value}
                type="button"
                className={`theme-option${mode === option.value ? " active" : ""}`}
                onClick={() => setMode(option.value)}
                aria-pressed={mode === option.value}
              >
                <Icon size={15} />
                {option.label}
              </button>
            );
          })}
          <span className="badge primary">Aktif: {mode === "system" ? `Otomatis (${resolved})` : mode === "dark" ? "Gelap" : "Terang"}</span>
        </div>
      </div>

      <div className="feature-card glass-panel">
        <div className="feature-header">
          <h3>
            <SettingsIcon size={20} style={{ display: "inline", marginRight: 8 }} />
            Parameter Data Science
          </h3>
          <p>Nilai ini dipakai langsung oleh mesin forecasting, purchasing, allocation, dan markdown.</p>
        </div>

        <div className="toolbar">
          <label className="field-inline">
            Alpha (level smoothing)
            <input
              type="number"
              step={0.05}
              min={0.05}
              max={1}
              className="input-field"
              style={{ width: "100px" }}
              value={settings.forecastAlpha}
              onChange={(event) => updateSettings({ forecastAlpha: Number(event.target.value) || 0.4 })}
            />
          </label>
          <label className="field-inline">
            Beta (trend smoothing)
            <input
              type="number"
              step={0.05}
              min={0}
              max={1}
              className="input-field"
              style={{ width: "100px" }}
              value={settings.forecastBeta}
              onChange={(event) => updateSettings({ forecastBeta: Number(event.target.value) || 0 })}
            />
          </label>
          <label className="field-inline">
            Lead time (hari)
            <input
              type="number"
              min={1}
              className="input-field"
              style={{ width: "100px" }}
              value={settings.leadTimeDays}
              onChange={(event) => updateSettings({ leadTimeDays: Number(event.target.value) || 45 })}
            />
          </label>
          <label className="field-inline">
            Service level z
            <input
              type="number"
              step={0.05}
              min={0.5}
              max={3}
              className="input-field"
              style={{ width: "100px" }}
              value={settings.serviceLevelZ}
              onChange={(event) => updateSettings({ serviceLevelZ: Number(event.target.value) || 1.65 })}
            />
          </label>
          <label className="field-inline">
            Reserve alokasi (%)
            <input
              type="number"
              min={0}
              max={50}
              className="input-field"
              style={{ width: "100px" }}
              value={settings.allocationReservePct}
              onChange={(event) => updateSettings({ allocationReservePct: Number(event.target.value) || 0 })}
            />
          </label>
          <label className="field-inline">
            Isi karton PO
            <input
              type="number"
              min={1}
              className="input-field"
              style={{ width: "100px" }}
              value={settings.poPackSize}
              onChange={(event) => updateSettings({ poPackSize: Number(event.target.value) || 1 })}
            />
          </label>
          <label className="field-inline">
            MOQ per size
            <input
              type="number"
              min={0}
              className="input-field"
              style={{ width: "100px" }}
              value={settings.poMoq}
              onChange={(event) => updateSettings({ poMoq: Number(event.target.value) || 0 })}
            />
          </label>
          <button className="ghost-btn" onClick={() => updateSettings(DEFAULT_SETTINGS)}>
            <RotateCcw size={14} /> Reset Default
          </button>
        </div>

        <div>
          <div className="stat-title" style={{ marginBottom: "8px", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            Markdown Ladder (weeks cover minimum -&gt; diskon)
            <button className="ghost-btn" onClick={addTier}>
              <Plus size={14} /> Tambah Tier
            </button>
          </div>
          <div className="mapping-grid">
            {settings.markdownLadder.map((tier, index) => (
              <div key={index} className="mapping-item">
                <span className="mapping-label">Tier {index + 1}</span>
                <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                  <input
                    type="number"
                    min={0}
                    className="input-field"
                    style={{ width: "80px" }}
                    value={tier.minWeeksCover}
                    onChange={(event) => updateTier(index, { minWeeksCover: Math.max(0, Number(event.target.value) || 0) })}
                  />
                  <span style={{ fontSize: "12px", color: "var(--text-secondary)", textTransform: "none" }}>mg -&gt;</span>
                  <input
                    type="number"
                    min={0}
                    max={90}
                    className="input-field"
                    style={{ width: "80px" }}
                    value={tier.discount}
                    onChange={(event) => updateTier(index, { discount: Math.min(90, Math.max(0, Number(event.target.value) || 0)) })}
                  />
                  <span style={{ fontSize: "12px", color: "var(--text-secondary)", textTransform: "none" }}>%</span>
                  <button
                    className="icon-btn"
                    title="Hapus tier"
                    aria-label={`Hapus tier ${index + 1}`}
                    disabled={settings.markdownLadder.length <= 1}
                    onClick={() => removeTier(index)}
                    style={{ opacity: settings.markdownLadder.length <= 1 ? 0.4 : 1 }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <span className="mapping-hint">
                  {tier.discount > 0
                    ? `Diskon ${tier.discount}% saat weeks of cover >= ${tier.minWeeksCover}`
                    : "Diskon 0% - ambang tanpa markdown"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="feature-card glass-panel">
        <div className="feature-header">
          <h3>
            <Key size={20} style={{ display: "inline", marginRight: 8 }} />
            AI — API Key &amp; Model
          </h3>
          <p>
            Isi API key lalu tekan <strong>Deteksi Otomatis</strong> — aplikasi menentukan provider (Groq/Gemini) dan mengambil
            daftar model yang tersedia. Key disimpan di browser ini dan menimpa .env saat ada.
          </p>
        </div>

        <div className="alert info" style={{ marginBottom: "16px" }}>
          {envConfigured ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          <span>
            {envConfigured ? (
              <>
                Terhubung otomatis dari <strong>.env.local</strong> (
                {envConfig?.provider === "gemini" ? "Gemini" : "Groq"}
                {envConfig?.model ? ` · ${envConfig.model}` : ""}).
              </>
            ) : (
              <>
                Belum ada API key di <strong>.env.local</strong>. Ketik key di bawah lalu{" "}
                <strong>Deteksi Otomatis</strong> untuk menyimpannya di browser, atau set GROQ_API_KEY / GEMINI_API_KEY di .env.local.
              </>
            )}
          </span>
        </div>

        <div className="toolbar">
          <div className="field-inline">
            Provider
            <div style={{ display: "flex", gap: "6px" }}>
              {(
                [
                  { value: "" as AiProvider | "", label: "Otomatis" },
                  { value: "groq" as AiProvider | "", label: "Groq" },
                  { value: "gemini" as AiProvider | "", label: "Gemini" },
                ] as const
              ).map((option) => (
                <button
                  key={option.label}
                  type="button"
                  className={`ghost-btn${effectiveAi.provider === option.value ? " accent" : ""}`}
                  onClick={() => {
                    setKeyEdited(true);
                    setAiDraft((draft) => ({ ...draft, provider: option.value }));
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="toolbar" style={{ marginTop: "12px" }}>
          <label className="field-inline">
            API Key
            <div style={{ display: "flex", gap: "6px", width: "100%", maxWidth: "420px" }}>
              <input
                type={showKey ? "text" : "password"}
                className="input-field"
                style={{ flex: 1 }}
                autoComplete="off"
                spellCheck={false}
                placeholder={settings.ai.apiKey ? "•••••••• (key tersimpan — ketik untuk mengganti)" : "contoh: gsk_... atau AIza..."}
                value={keyEdited ? aiDraft.apiKey : ""}
                onChange={(event) => {
                  setKeyEdited(true);
                  setAiDraft((draft) => ({ ...draft, apiKey: event.target.value }));
                }}
              />
              <button
                className="icon-btn"
                type="button"
                title={showKey ? "Sembunyikan key" : "Tampilkan key"}
                onClick={() => setShowKey((visible) => !visible)}
              >
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>

          <label className="field-inline" style={{ flexDirection: "column", alignItems: "flex-start" }}>
            Model AI
            <input
              list="ai-model-list"
              className="input-field"
              style={{ width: "240px" }}
              placeholder="Isi manual atau pakai Deteksi Otomatis"
              value={effectiveAi.model}
              onChange={(event) => {
                setKeyEdited(true);
                setAiDraft((draft) => ({ ...draft, model: event.target.value }));
              }}
            />
            <datalist id="ai-model-list">
              {detectedModels.map((model) => (
                <option key={model} value={model} />
              ))}
            </datalist>
          </label>
        </div>

        {detectedModels.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" }}>
            {detectedModels.slice(0, 12).map((model) => (
              <button
                key={model}
                type="button"
                className={`ghost-btn${effectiveAi.model === model ? " accent" : ""}`}
                style={{ padding: "2px 8px" }}
                onClick={() => {
                  setKeyEdited(true);
                  setAiDraft((draft) => ({ ...draft, model }));
                }}
              >
                {model}
              </button>
            ))}
          </div>
        )}

        <div className="toolbar" style={{ marginTop: "12px" }}>
          <button className="glow-btn" type="button" disabled={detecting} onClick={() => void runDetect()}>
            <Sparkles size={16} /> {detecting ? "Mendeteksi..." : "Deteksi Otomatis"}
          </button>
          <button className="ghost-btn" type="button" onClick={saveAi}>
            <Save size={16} /> Simpan
          </button>
          <button className="ghost-btn danger" type="button" onClick={clearAi}>
            <Trash2 size={16} /> Hapus Key
          </button>
          {aiStatus.kind !== "idle" && (
            <span className={`alert ${aiStatus.kind === "error" ? "error" : "info"}`} style={{ margin: 0 }}>
              {aiStatus.kind === "error" ? (
                <AlertTriangle size={16} />
              ) : aiStatus.kind === "ok" ? (
                <CheckCircle2 size={16} />
              ) : (
                <Sparkles size={16} className="spin" />
              )}
              <span>{aiStatus.text}</span>
            </span>
          )}
        </div>
      </div>

      <div className="feature-card glass-panel">
        <div className="feature-header">
          <h3>
            <Database size={20} style={{ display: "inline", marginRight: 8 }} />
            Database &amp; Penyimpanan
          </h3>
          <p>
            Saat ini data disimpan di IndexedDB browser (mode lokal). Prisma schema untuk PostgreSQL sudah tersedia di folder prisma/
            dan bisa diaktifkan kapan saja tanpa mengubah halaman analitik.
          </p>
        </div>

        <div className="stat-row">
          <div className="mini-stat">
            <span>Baris Penjualan</span>
            <strong>{formatNumber(dataset.sales.length)}</strong>
          </div>
          <div className="mini-stat">
            <span>Baris Stok</span>
            <strong>{formatNumber(dataset.stock.length)}</strong>
          </div>
          <div className="mini-stat">
            <span>Omzet</span>
            <strong>{formatRupiah(summary.totalRevenue)}</strong>
          </div>
          <div className="mini-stat">
            <span>Sumber</span>
            <strong style={{ fontSize: "14px" }}>{dataset.sources.join(", ") || "-"}</strong>
          </div>
        </div>

        {storage && (
          <div className="alert info">
            <HardDrive size={18} />
            <span>
              Storage terpakai: {(storage.usage / 1_048_576).toFixed(2)} MB dari kuota {(storage.quota / 1_048_576).toFixed(0)} MB.
            </span>
          </div>
        )}

        <div className="toolbar">
          <button
            className="glow-btn"
            onClick={() => {
              setActionError(null);
              void saveDataset({ ...dataset })
                .then(() => setActionError(null))
                .catch((caught: unknown) => setActionError(caught instanceof Error ? caught.message : "Gagal menyimpan data."));
            }}
          >
            <Save size={16} /> Simpan Ulang ke Browser
          </button>
          <button
            className="ghost-btn danger"
            onClick={() => {
              if (!window.confirm("Hapus semua data penjualan dari browser ini?")) return;
              setActionError(null);
              void clearDataset()
                .then(() => setActionError(null))
                .catch((caught: unknown) => setActionError(caught instanceof Error ? caught.message : "Gagal menghapus data."));
            }}
          >
            Hapus Semua Data
          </button>
          {actionError && (
            <span className="alert error" style={{ margin: 0 }}>
              {actionError}
            </span>
          )}
        </div>

        <div className="alert info">
          <span>
            Impor terakhir: {dataset.importedAt ? new Date(dataset.importedAt).toLocaleString("id-ID") : "-"}
          </span>
        </div>
      </div>
    </section>
  );
}
