"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Cpu,
  Flame,
  Info,
  Lightbulb,
  Loader,
  RefreshCw,
  Sparkles,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react";
import { useData } from "@/lib/data-provider";
import EmptyState from "@/components/EmptyState";
import type { ProductTrend } from "@/lib/analytics";
import type { AiAction, AiInsight, AiReport } from "@/lib/types";

type FetchStatus = "idle" | "loading" | "success" | "error";

interface AiState {
  status: FetchStatus;
  report: AiReport | null;
  error: string | null;
  promptTokens: number | null;
  salesRows: number;
  stockRows: number;
  elapsed: number | null;
  trends: ProductTrend[];
}

const SEVERITY_CONFIG: Record<
  AiInsight["severity"],
  { icon: typeof Flame; label: string; className: string }
> = {
  critical: { icon: Flame, label: "Kritis", className: "severity-critical" },
  warning: { icon: AlertTriangle, label: "Peringatan", className: "severity-warning" },
  opportunity: { icon: Lightbulb, label: "Peluang", className: "severity-opportunity" },
  info: { icon: Info, label: "Info", className: "severity-info" },
};

const PRIORITY_CONFIG: Record<
  AiAction["priority"],
  { icon: typeof Zap; label: string; className: string }
> = {
  high: { icon: Zap, label: "Prioritas Tinggi", className: "priority-high" },
  medium: { icon: Target, label: "Prioritas Sedang", className: "priority-medium" },
  low: { icon: Clock, label: "Prioritas Rendah", className: "priority-low" },
};

export default function AiInsightsPage() {
  const { status: dataStatus, dataset, settings, hasSales } = useData();
  const [state, setState] = useState<AiState>({
    status: "idle",
    report: null,
    error: null,
    promptTokens: null,
    salesRows: 0,
    stockRows: 0,
    elapsed: null,
    trends: [],
  });
  const [expandedInsight, setExpandedInsight] = useState<number | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [modelName, setModelName] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Cek apakah AI sudah dikonfigurasi
  useEffect(() => {
    async function check() {
      try {
        const res = await fetch("/api/ai/insights");
        const data = await res.json();
        setConfigured(data.envConfigured ?? data.configured ?? false);
        setModelName(data.envModel ?? data.model ?? null);
      } catch {
        setConfigured(false);
      }
    }
    void check();
  }, []);

  const generateReport = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState((prev) => ({
      ...prev,
      status: "loading",
      error: null,
      elapsed: null,
    }));

    const startTime = Date.now();

    try {
      const res = await fetch("/api/ai/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sales: dataset.sales,
          stock: dataset.stock,
          settings,
        }),
        signal: controller.signal,
      });

      const data = await res.json();
      const elapsed = (Date.now() - startTime) / 1000;

      if (!res.ok || !data.ok) {
        setState((prev) => ({
          ...prev,
          status: "error",
          error: data.error ?? `Error ${res.status}`,
          elapsed,
        }));
        return;
      }

      setState({
        status: "success",
        report: data.report,
        error: null,
        promptTokens: data.promptTokens ?? null,
        salesRows: data.salesRows ?? 0,
        stockRows: data.stockRows ?? 0,
        elapsed,
        trends: data.trends ?? [],
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setState((prev) => ({
        ...prev,
        status: "error",
        error: err instanceof Error ? err.message : "Gagal menghubungi server.",
        elapsed: (Date.now() - startTime) / 1000,
      }));
    }
  }, [dataset.sales, dataset.stock, settings]);

  const cancelRequest = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      setState((prev) => ({
        ...prev,
        status: "idle",
        error: null,
      }));
    }
  }, []);

  const storedKey = settings.ai.apiKey.trim();
  const activeModel = settings.ai.model || modelName || "";

  if (dataStatus === "loading") {
    return <div className="feature-card glass-panel">Memuat data dari penyimpanan browser...</div>;
  }

  if (!hasSales) {
    return (
      <div className="mt-4">
        <EmptyState />
      </div>
    );
  }

  if (configured === null) {
    return <div className="feature-card glass-panel">Memeriksa konfigurasi AI...</div>;
  }

  if (!configured && storedKey.length === 0) {
    return (
      <section className="animate-fade-in" style={{ marginTop: "16px" }}>
        <div className="feature-card glass-panel" style={{ padding: "40px", textAlign: "center" }}>
          <div className="ai-hero-icon" style={{ margin: "0 auto 24px" }}>
            <Brain size={48} />
          </div>
<h2 style={{ fontSize: "24px", marginBottom: "12px" }}>AI Belum Dikonfigurasi</h2>
          <p style={{ color: "var(--text-secondary)", maxWidth: "500px", margin: "0 auto 24px", lineHeight: "1.7" }}>
            Tambahkan API key di halaman{" "}
            <a href="/settings" style={{ color: "var(--accent-primary)" }}>
              Settings → AI
            </a>{" "}
            lalu tekan <strong>Deteksi Otomatis</strong>. Bisa juga mengatur <code style={{ background: "var(--surface-soft)", padding: "2px 8px", borderRadius: "4px" }}>GROQ_API_KEY</code> /{" "}
            <code style={{ background: "var(--surface-soft)", padding: "2px 8px", borderRadius: "4px" }}>GEMINI_API_KEY</code> di file{" "}
            <code style={{ background: "var(--surface-soft)", padding: "2px 8px", borderRadius: "4px" }}>.env.local</code> lalu restart dev server.
          </p>
          <div className="alert info" style={{ maxWidth: "500px", margin: "0 auto" }}>
            <Info size={16} />
            <span>Key Groq: console.groq.com. Key Gemini: aistudio.google.com (opsional, bicarakan jika perlu).</span>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="animate-fade-in" style={{ marginTop: "16px" }}>
      {/* Hero Card */}
      <div className="ai-hero-card glass-panel">
        <div className="ai-hero-content">
          <div className="ai-hero-icon">
            <Sparkles size={32} />
          </div>
          <div>
            <h2 style={{ fontSize: "24px", margin: 0, display: "flex", alignItems: "center", gap: "12px" }}>
              AI Insights
              {activeModel && (
                <span className="ai-model-badge">
                  <Cpu size={12} /> {activeModel}
                </span>
              )}
            </h2>
            <p style={{ color: "var(--text-secondary)", margin: "8px 0 0", fontSize: "14px", lineHeight: "1.6" }}>
              Analisa otomatis data merchandising oleh model AI.
              AI membaca ringkasan penjualan, stok, forecast, dan reorder plan untuk memberikan rekomendasi strategis.
            </p>
          </div>
        </div>

        <div className="ai-hero-actions">
          {state.status === "loading" ? (
            <>
              <button className="glow-btn ai-cancel-btn" onClick={cancelRequest}>
                Batalkan
              </button>
              <div className="ai-loading-indicator">
                <Loader size={18} className="spin" />
                <span>Menganalisa data...</span>
              </div>
            </>
          ) : (
            <button
              className="glow-btn ai-generate-btn"
              onClick={generateReport}
            >
              <Sparkles size={16} />
              {state.report ? "Generate Ulang" : "Generate AI Report"}
            </button>
          )}
        </div>
      </div>

      {/* Loading Animation */}
      {state.status === "loading" && (
        <div className="ai-loading-card glass-panel animate-fade-in">
          <div className="ai-loading-content">
            <div className="ai-pulse-ring">
              <Brain size={40} className="ai-brain-icon" />
            </div>
            <h3 style={{ marginTop: "24px", fontSize: "18px" }}>AI sedang menganalisa data Anda...</h3>
            <p style={{ color: "var(--text-secondary)", fontSize: "14px", marginTop: "8px" }}>
              Memproses {dataset.sales.length.toLocaleString("id-ID")} baris penjualan
              {dataset.stock.length > 0 && ` dan ${dataset.stock.length.toLocaleString("id-ID")} baris stok`}
            </p>
            <div className="ai-progress-steps">
              <div className="ai-step active">
                <CheckCircle2 size={14} /> Mengumpulkan data
              </div>
              <div className="ai-step active">
                <CheckCircle2 size={14} /> Menghitung analitik
              </div>
              <div className="ai-step processing">
                <Loader size={14} className="spin" /> Meminta insight AI
              </div>
              <div className="ai-step pending">
                <Clock size={14} /> Menyusun laporan
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error State */}
      {state.status === "error" && state.error && (
        <div className="alert error animate-fade-in" style={{ marginTop: "16px" }}>
          <AlertTriangle size={18} />
          <div>
            <strong>Gagal menghasilkan laporan AI</strong>
            <p style={{ margin: "4px 0 0", opacity: 0.85 }}>{state.error}</p>
            {state.elapsed !== null && (
              <p style={{ margin: "4px 0 0", fontSize: "12px", opacity: 0.6 }}>
                Gagal setelah {state.elapsed.toFixed(1)} detik
              </p>
            )}
          </div>
        </div>
      )}

      {/* Report */}
      {state.report && state.status === "success" && (
        <div className="ai-report animate-fade-in">
          {/* Headline */}
          <div className="ai-headline-card glass-panel">
            <div className="ai-headline-icon">
              <TrendingUp size={28} />
            </div>
            <div style={{ flex: 1 }}>
              <h3 className="ai-headline-text">{state.report.headline}</h3>
              <p className="ai-summary-text">{state.report.summary}</p>
            </div>
            {state.elapsed !== null && (
              <div className="ai-meta-badge">
                <Clock size={12} /> {state.elapsed.toFixed(1)}s
                {state.promptTokens && (
                  <>
                    {" "} · {state.promptTokens.toLocaleString("id-ID")} token
                  </>
                )}
              </div>
            )}
          </div>

          {/* Produk Sedang Trend */}
          {state.trends.length > 0 && (
            <div className="feature-card glass-panel animate-fade-in" style={{ marginTop: "16px", padding: "20px" }}>
              <div className="feature-header" style={{ marginBottom: "12px" }}>
                <h3 style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <TrendingUp size={18} style={{ color: "var(--success)" }} />
                  Produk Sedang Trend
                  <span className="ai-count-badge">{state.trends.length}</span>
                </h3>
                <p style={{ marginTop: "4px" }}>
                  Momentum naik pada 28 hari terakhir vs periode sebelumnya (28 hari). AI memakai daftar ini untuk rekomendasi.
                </p>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Produk</th>
                      <th>Unit (terakhir)</th>
                      <th>Sebelumnya</th>
                      <th>Naik</th>
                      <th>Unit / hari</th>
                      <th>SKU</th>
                      <th>Jual terakhir</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.trends.map((row) => (
                      <tr key={row.parent}>
                        <td style={{ fontWeight: 700, color: "var(--text-primary)" }}>{row.parent}</td>
                        <td style={{ fontWeight: 700 }}>{row.units.toLocaleString("id-ID")}</td>
                        <td style={{ color: "var(--text-secondary)" }}>{row.priorUnits.toLocaleString("id-ID")}</td>
                        <td style={{ color: "var(--success)", fontWeight: 700 }}>
                          +{row.growthPct.toLocaleString("id-ID")}%
                        </td>
                        <td>{row.avgDaily.toLocaleString("id-ID")}</td>
                        <td>{row.skus}</td>
                        <td style={{ color: "var(--text-secondary)" }}>{row.lastSale}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Insights Grid */}
          {state.report.insights.length > 0 && (
            <div className="ai-section">
              <h3 className="ai-section-title">
                <Lightbulb size={20} /> Insights
                <span className="ai-count-badge">{state.report.insights.length}</span>
              </h3>
              <div className="ai-insights-grid">
                {state.report.insights.map((insight, index) => {
                  const config = SEVERITY_CONFIG[insight.severity];
                  const Icon = config.icon;
                  const isExpanded = expandedInsight === index;
                  return (
                    <div
                      key={index}
                      className={`ai-insight-card glass-panel ${config.className} ${isExpanded ? "expanded" : ""}`}
                      onClick={() => setExpandedInsight(isExpanded ? null : index)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") setExpandedInsight(isExpanded ? null : index);
                      }}
                    >
                      <div className="ai-insight-header">
                        <div className="ai-insight-severity">
                          <Icon size={16} />
                          <span>{config.label}</span>
                        </div>
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </div>
                      <h4 className="ai-insight-title">{insight.title}</h4>
                      <p className="ai-insight-detail">{insight.detail}</p>
                      {isExpanded && insight.evidence && (
                        <div className="ai-insight-evidence animate-fade-in">
                          <div className="ai-evidence-label">
                            <Target size={12} /> Bukti Data
                          </div>
                          <p>{insight.evidence}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Actions */}
          {state.report.actions.length > 0 && (
            <div className="ai-section">
              <h3 className="ai-section-title">
                <Zap size={20} /> Rekomendasi Tindakan
                <span className="ai-count-badge">{state.report.actions.length}</span>
              </h3>
              <div className="ai-actions-list">
                {state.report.actions.map((action, index) => {
                  const config = PRIORITY_CONFIG[action.priority];
                  const Icon = config.icon;
                  return (
                    <div key={index} className={`ai-action-card glass-panel ${config.className}`}>
                      <div className="ai-action-number">{index + 1}</div>
                      <div className="ai-action-content">
                        <div className="ai-action-priority">
                          <Icon size={14} />
                          <span>{config.label}</span>
                        </div>
                        <h4 className="ai-action-step">{action.step}</h4>
                        {action.reason && (
                          <p className="ai-action-reason">{action.reason}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Risks */}
          {state.report.risks.length > 0 && (
            <div className="ai-section">
              <h3 className="ai-section-title">
                <AlertTriangle size={20} /> Risiko & Peringatan
                <span className="ai-count-badge">{state.report.risks.length}</span>
              </h3>
              <div className="ai-risks-list">
                {state.report.risks.map((risk, index) => (
                  <div key={index} className="ai-risk-item glass-panel">
                    <div className="ai-risk-icon">
                      <AlertTriangle size={16} />
                    </div>
                    <p>{risk}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footer Meta */}
          <div className="ai-report-footer glass-panel">
            <div className="ai-footer-meta">
              <span>
                <Cpu size={14} /> Model: <strong>{state.report.model}</strong>
              </span>
              <span>
                <Clock size={14} /> Generated: <strong>{new Date(state.report.generatedAt).toLocaleString("id-ID")}</strong>
              </span>
              <span>
                <TrendingUp size={14} /> Data: <strong>{state.salesRows.toLocaleString("id-ID")} sales</strong>
                {state.stockRows > 0 && <>, <strong>{state.stockRows.toLocaleString("id-ID")} stock</strong></>}
              </span>
              {state.promptTokens && (
                <span>
                  <Sparkles size={14} /> Tokens: <strong>{state.promptTokens.toLocaleString("id-ID")}</strong>
                </span>
              )}
            </div>
            <button className="ghost-btn accent" onClick={generateReport}>
              <RefreshCw size={14} /> Generate Ulang
            </button>
          </div>
        </div>
      )}

      {/* Idle state — no report yet */}
      {state.status === "idle" && !state.report && (
        <div className="ai-idle-card glass-panel animate-fade-in">
          <Brain size={56} style={{ color: "var(--text-secondary)", opacity: 0.3 }} />
          <h3 style={{ color: "var(--text-secondary)", fontWeight: 600, marginTop: "16px" }}>
            Belum Ada Laporan AI
          </h3>
          <p style={{ color: "var(--text-secondary)", fontSize: "14px", maxWidth: "400px", textAlign: "center", lineHeight: "1.6" }}>
            Klik tombol <strong>&quot;Generate AI Report&quot;</strong> untuk memulai analisa.
            AI akan memproses seluruh data yang sudah diupload dan memberikan rekomendasi merchandising.
          </p>
        </div>
      )}
    </section>
  );
}
