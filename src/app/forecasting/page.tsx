"use client";

import { useMemo, useState } from "react";
import { Activity, Gauge, Sparkles, TrendingUp } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import EmptyState from "@/components/EmptyState";
import { useData } from "@/lib/data-provider";
import { forecastWeekly, summarize } from "@/lib/analytics";
import { formatCompact, formatNumber, formatPercent, formatRupiah } from "@/lib/format";

const TOOLTIP_STYLE = {
  backgroundColor: "var(--bg-secondary)",
  borderColor: "var(--glass-border)",
  borderRadius: "8px",
  color: "var(--text-primary)",
};

const PERIOD_MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

function formatAxisPeriod(iso: string): string {
  const year = Number(iso.slice(0, 4));
  const month = PERIOD_MONTHS[Number(iso.slice(5, 7)) - 1];
  const day = Number(iso.slice(8, 10));
  return `${day} ${month} ${String(year).slice(2)}`;
}

export default function Forecasting() {
  const { status, dataset, hasSales, settings, updateSettings } = useData();
  const [scope, setScope] = useState("ALL");
  const [horizon, setHorizon] = useState(12);
  const [uplift, setUplift] = useState(0);

  const summary = useMemo(
    () => summarize(dataset.sales, dataset.stock, dataset.minDate, dataset.maxDate),
    [dataset],
  );

  const scopedSales = useMemo(
    () => (scope === "ALL" ? dataset.sales : dataset.sales.filter((sale) => sale.parentSku === scope)),
    [dataset.sales, scope],
  );

  const result = useMemo(
    () =>
      forecastWeekly(
        scopedSales,
        settings.forecastAlpha,
        settings.forecastBeta,
        horizon,
        scope === "ALL" ? undefined : scope,
      ),
    [scopedSales, settings.forecastAlpha, settings.forecastBeta, horizon, scope],
  );

  const chartData = useMemo(() => {
    const lastActualIndex = result.points.reduce((last, point, index) => (point.actual !== null ? index : last), -1);
    return result.points.map((point, index) => ({
      period: point.period,
      imputed: point.imputed,
      label: formatAxisPeriod(point.period),
      actual: point.actual,
      fitted: point.fitted === null ? null : Number(point.fitted.toFixed(1)),
      forecast:
        point.forecast === null
          ? index === lastActualIndex
            ? Number((point.fitted ?? 0).toFixed(1))
            : null
          : Number((point.forecast * (1 + uplift / 100)).toFixed(1)),
    }));
  }, [result.points, uplift]);

  const baseForecastTotal = useMemo(
    () => result.points.reduce((acc, point) => acc + (point.forecast ?? 0), 0),
    [result.points],
  );

  const forecastTotal = useMemo(() => baseForecastTotal * (1 + uplift / 100), [baseForecastTotal, uplift]);

  const avgPrice = useMemo(() => {
    if (scopedSales.length === 0) return 0;
    return scopedSales.reduce((acc, sale) => acc + sale.revenue, 0) / scopedSales.reduce((acc, sale) => acc + sale.qty, 0);
  }, [scopedSales]);

  const leadTimeWeeks = settings.leadTimeDays / 7;
  const leadTimeDemand = result.level * leadTimeWeeks;
  const safetyStock = settings.serviceLevelZ * result.sigmaWeekly * Math.sqrt(leadTimeWeeks);

  if (status === "loading") {
    return <div className="feature-card glass-panel">Memuat data dari penyimpanan browser...</div>;
  }

  if (!hasSales) {
    return (
      <div className="mt-4">
        <EmptyState title="Forecasting butuh data penjualan" />
      </div>
    );
  }

  return (
    <section className="mt-4 animate-fade-in">
      <div className="feature-card glass-panel">
        <div className="feature-header">
          <h3>Event-Driven Forecasting (Holt Linear)</h3>
          <p>
            Tren mingguan dari data upload, diproyeksikan {horizon} minggu ke depan dengan lead time supplier {settings.leadTimeDays} hari.{" "}
            Garis merah adalah proyeksi dan memakai buffer mingguan ({uplift > 0 ? "+" : ""}
            {uplift}%) untuk skenario event. Akurasi historis dihitung dari minggu ke-3 ke atas, bukan dari 2 minggu inisialisasi model.
          </p>
        </div>

        <div className="toolbar">
          <label className="field-inline" style={{ minWidth: "240px" }}>
            Scope
            <select className="select-field" value={scope} onChange={(event) => setScope(event.target.value)}>
              <option value="ALL">Semua produk</option>
              {summary.parentStats.map((item) => (
                <option key={item.parent} value={item.parent}>
                  {item.parent}
                </option>
              ))}
            </select>
          </label>
          <label className="field-inline">
            Alpha
            <input
              type="number"
              step={0.05}
              min={0.05}
              max={1}
              className="input-field"
              style={{ width: "90px" }}
              value={settings.forecastAlpha}
              onChange={(event) => updateSettings({ forecastAlpha: Number(event.target.value) || 0.4 })}
            />
          </label>
          <label className="field-inline">
            Beta
            <input
              type="number"
              step={0.05}
              min={0}
              max={1}
              className="input-field"
              style={{ width: "90px" }}
              value={settings.forecastBeta}
              onChange={(event) => updateSettings({ forecastBeta: Number(event.target.value) || 0 })}
            />
          </label>
          <label className="field-inline">
            Horizon (mg)
            <input
              type="number"
              min={1}
              max={52}
              className="input-field"
              style={{ width: "90px" }}
              value={horizon}
              onChange={(event) => setHorizon(Math.max(1, Math.min(52, Number(event.target.value) || 12)))}
            />
          </label>
          <label className="field-inline">
            Uplift event (%)
            <input
              type="number"
              step={5}
              className="input-field"
              style={{ width: "90px" }}
              value={uplift}
              onChange={(event) => setUplift(Number(event.target.value) || 0)}
            />
          </label>
        </div>

        <div style={{ height: "360px", width: "100%" }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorForecast" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--accent-primary)" stopOpacity={0.7} />
                  <stop offset="95%" stopColor="var(--accent-primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" />
              <XAxis dataKey="label" stroke="var(--text-secondary)" tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={18} />
              <YAxis stroke="var(--text-secondary)" />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelFormatter={(_, payload) => {
                  const point = payload?.[0]?.payload as { period?: string; imputed?: boolean } | undefined;
                  if (!point?.period) return "";
                  return point.imputed ? `Minggu ${point.period} (tanpa data)` : `Minggu ${point.period}`;
                }}
                formatter={(value, name) => [`${formatNumber(Number(value), 1)} unit`, String(name)]}
              />
              <Area type="monotone" dataKey="actual" name="Aktual" stroke="var(--chart-alt)" strokeWidth={2} fillOpacity={0} />
              <Line type="monotone" dataKey="fitted" name="Fitted" stroke="var(--text-secondary)" strokeDasharray="4 4" dot={false} />
              <Area type="monotone" dataKey="forecast" name="Proyeksi" stroke="var(--accent-primary)" strokeWidth={2} fillOpacity={1} fill="url(#colorForecast)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="feature-card glass-panel">
        <div className="feature-header">
          <h3>Parameter & Dampak</h3>
          <p>Angka-angka ini otomatis berubah mengikuti data yang diupload dan slider di atas.</p>
        </div>

        <div className="stat-row">
          <div className="mini-stat">
            <span>Baseline / Minggu</span>
            <strong>{formatNumber(result.level, 1)}</strong>
          </div>
          <div className="mini-stat">
            <span>Tren / Minggu</span>
            <strong style={{ color: result.trend >= 0 ? "var(--success)" : "var(--danger)" }}>
              {result.trend >= 0 ? "+" : ""}
              {formatNumber(result.trend, 2)}
            </strong>
          </div>
          <div className="mini-stat">
            <span>MAPE Historis</span>
            <strong>{result.mape === null ? "-" : formatPercent(result.mape)}</strong>
          </div>
          <div className="mini-stat">
            <span>WAPE Historis</span>
            <strong>{result.wape === null ? "-" : formatPercent(result.wape)}</strong>
          </div>
          <div className="mini-stat">
            <span>Sigma Mingguan</span>
            <strong>{formatNumber(result.sigmaWeekly, 1)}</strong>
          </div>
          <div className="mini-stat">
            <span>Total Proyeksi {horizon} mg {uplift !== 0 ? `(uplift ${uplift > 0 ? "+" : ""}${uplift}%)` : ""}</span>
            <strong>{formatCompact(forecastTotal)}</strong>
          </div>
          <div className="mini-stat">
            <span>Proyeksi Omzet</span>
            <strong>{formatRupiah(forecastTotal * avgPrice)}</strong>
          </div>
        </div>

        <div className="stat-row">
          <div className="mini-stat">
            <span>
              <Activity size={12} style={{ marginRight: 4 }} /> Demand Lead Time
            </span>
            <strong>{formatNumber(leadTimeDemand)}</strong>
          </div>
          <div className="mini-stat">
            <span>
              <Gauge size={12} style={{ marginRight: 4 }} /> Safety Stock (z={settings.serviceLevelZ})
            </span>
            <strong>{formatNumber(safetyStock)}</strong>
          </div>
          <div className="mini-stat">
            <span>
              <TrendingUp size={12} style={{ marginRight: 4 }} /> Kebutuhan Lead Time + SS
            </span>
            <strong style={{ color: "var(--accent-primary)" }}>{formatNumber(Math.ceil(leadTimeDemand + safetyStock))}</strong>
          </div>
          <div className="mini-stat">
            <span>
              <Sparkles size={12} style={{ marginRight: 4 }} /> Skenario Event
            </span>
            <strong>
              {uplift >= 0 ? "+" : ""}
              {uplift}% ({formatCompact(forecastTotal)} dari {formatCompact(baseForecastTotal)})
            </strong>
          </div>
        </div>
      </div>
    </section>
  );
}
