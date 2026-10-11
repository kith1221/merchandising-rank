"use client";

import { useMemo, useState } from "react";
import { Boxes, ShoppingBag, Store, TrendingUp, Warehouse } from "lucide-react";
import {
  AreaChart,
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import EmptyState from "@/components/EmptyState";
import { useData } from "@/lib/data-provider";
import { summarize } from "@/lib/analytics";
import { formatCompact, formatNumber, formatPercent, formatRupiah, formatRupiahCompact, monthLabel } from "@/lib/format";

type TrendMetric = "revenue" | "units";

const TOOLTIP_STYLE = {
  backgroundColor: "var(--bg-secondary)",
  borderColor: "var(--glass-border)",
  borderRadius: "8px",
  color: "var(--text-primary)",
};

export default function Overview() {
  const { status, dataset, hasSales } = useData();
  const [metric, setMetric] = useState<TrendMetric>("revenue");

  const summary = useMemo(
    () => summarize(dataset.sales, dataset.stock, dataset.minDate, dataset.maxDate),
    [dataset],
  );

  const trend = useMemo(
    () =>
      summary.monthly.map((point) => ({
        name: monthLabel(point.month),
        offline: Math.round(metric === "revenue" ? point.offline : point.offlineUnits),
        online: Math.round(metric === "revenue" ? point.online : point.onlineUnits),
      })),
    [summary.monthly, metric],
  );

  const channelSplit = useMemo(() => {
    const onlineUnits = summary.onlineUnits;
    const offlineUnits = Math.max(0, summary.totalUnits - onlineUnits);
    return [
      { name: "Offline (toko)", units: offlineUnits, value: offlineUnits },
      { name: "Online (marketplace)", units: onlineUnits, value: onlineUnits },
    ].filter((item) => item.units > 0);
  }, [summary]);

  const topParents = useMemo(() => summary.parentStats.slice(0, 8), [summary.parentStats]);
  const topStores = useMemo(() => summary.storeStats.slice(0, 8), [summary.storeStats]);

  if (status === "loading") {
    return <div className="feature-card glass-panel">Memuat data dari penyimpanan browser...</div>;
  }

  if (!hasSales) {
    return (
      <div className="mt-4">
        <EmptyState />
      </div>
    );
  }

  return (
    <>
      <div className="dashboard-grid mt-4">
        <div className="stat-card glass-panel delay-1 animate-fade-in">
          <div className="stat-title">Total Active SKUs</div>
          <div className="stat-value">
            {formatNumber(summary.skuCount)} <Boxes size={26} style={{ marginLeft: "auto", color: "var(--text-secondary)" }} />
          </div>
          <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "8px" }}>
            {formatNumber(summary.parentCount)} parent SKU dari {summary.days} hari data
          </div>
        </div>
        <div className="stat-card glass-panel delay-2 animate-fade-in">
          <div className="stat-title">Omzet Terupload</div>
          <div className="stat-value">
            {formatRupiah(summary.totalRevenue)} <TrendingUp size={26} style={{ marginLeft: "auto", color: "var(--accent-primary)" }} />
          </div>
          <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "8px" }}>
            {formatNumber(summary.totalUnits)} unit | {formatRupiah(summary.revenuePerDay)}/hari
          </div>
        </div>
        <div className="stat-card glass-panel delay-3 animate-fade-in">
          <div className="stat-title">Jaringan Outlet</div>
          <div className="stat-value">
            {formatNumber(summary.storeCount)} <Store size={26} style={{ marginLeft: "auto", color: "var(--text-secondary)" }} />
          </div>
          <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "8px" }}>
            {formatPercent(summary.onlineShareUnits * 100, 0)} contribution dari kanal online
          </div>
        </div>
      </div>

      <section className="animate-fade-in" style={{ marginTop: "32px" }}>
        <div className="feature-card glass-panel" style={{ padding: "32px" }}>
          <div className="feature-header" style={{ marginBottom: "24px" }}>
            <h3>Omnichannel Trend</h3>
            <p>Perbandingan{kindLabel(metric)} jaringan toko fisik (Offline) vs Marketplace (Online) dari data yang diupload.</p>
            <div className="toolbar" style={{ marginTop: "12px" }}>
              <button
                className={`ghost-btn ${metric === "revenue" ? "accent" : ""}`}
                onClick={() => setMetric("revenue")}
              >
                Omzet
              </button>
              <button
                className={`ghost-btn ${metric === "units" ? "accent" : ""}`}
                onClick={() => setMetric("units")}
              >
                Unit
              </button>
            </div>
          </div>
          <div style={{ height: "350px", width: "100%" }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend}>
                <defs>
                  <linearGradient id="colorOffline" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--accent-primary)" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="var(--accent-primary)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorOnline" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--chart-alt)" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="var(--chart-alt)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" />
                <XAxis dataKey="name" stroke="var(--text-secondary)" />
                <YAxis
                  stroke="var(--text-secondary)"
                  tickFormatter={metric === "revenue" ? (value: number) => formatCompact(value) : (value: number) => formatNumber(value)}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value) =>
                    metric === "revenue" ? formatRupiah(Number(value)) : [`${formatNumber(Number(value))} unit`, "Unit"]
                  }
                />
                <Area type="monotone" dataKey="offline" name="Offline Stores" stroke="var(--accent-primary)" fillOpacity={1} fill="url(#colorOffline)" />
                <Area type="monotone" dataKey="online" name="Online (Shopee/Tokped)" stroke="var(--chart-alt)" fillOpacity={1} fill="url(#colorOnline)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <section className="feature-section animate-fade-in" style={{ marginTop: "32px" }}>
        <div className="feature-card glass-panel">
          <div className="feature-header">
            <h3>Top Parent SKU</h3>
            <p>Produk dengan volume tertinggi - dasar perhitungan Size Curve di modul Purchasing.</p>
          </div>
          <div style={{ height: "300px", width: "100%" }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topParents} layout="vertical" margin={{ left: 12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" horizontal={false} />
                <XAxis type="number" stroke="var(--text-secondary)" />
                <YAxis type="category" dataKey="parent" stroke="var(--text-secondary)" width={110} tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => [`${formatNumber(Number(value))} unit`, "Terjual"]} />
                <Bar dataKey="units" fill="var(--accent-primary)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="feature-card glass-panel">
          <div className="feature-header">
            <h3>Komposisi Kanal</h3>
            <p>Porsi unit offline vs online - basis utama Smart Allocation.</p>
          </div>
          <div style={{ height: "220px", width: "100%" }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={channelSplit} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={4}>
                  {channelSplit.map((entry, index) => (
                    <Cell key={entry.name} fill={index === 0 ? "var(--accent-primary)" : "var(--chart-alt)"} />
                  ))}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => [`${formatNumber(Number(value))} unit`, "Unit"]} />
                <Legend wrapperStyle={{ color: "var(--text-secondary)", fontSize: "12px" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Outlet</th>
                  <th>Kanal</th>
                  <th>Unit</th>
                  <th>Share</th>
                </tr>
              </thead>
              <tbody>
                {topStores.map((store) => (
                  <tr key={store.store}>
                    <td style={{ fontWeight: 600, color: "var(--text-primary)" }}>{store.store}</td>
                    <td style={{ color: "var(--text-secondary)" }}>
                      {store.channel === "ONLINE" ? <ShoppingBag size={12} style={{ marginRight: 4 }} /> : <Store size={12} style={{ marginRight: 4 }} />}
                      {store.channel === "ONLINE" ? "Online" : "Offline"}
                    </td>
                    <td style={{ fontWeight: 700 }}>{formatNumber(store.units)}</td>
                    <td style={{ color: "var(--accent-primary)", fontWeight: 700 }}>{formatPercent(store.share * 100)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="feature-card glass-panel animate-fade-in" style={{ marginTop: "32px" }}>
        <div className="feature-header">
          <h3>Ringkasan Performa</h3>
          <p>Indikator yang dipakai semua modul: rata-rata harga jual, penjualan per hari, dan konsentrasi produk.</p>
        </div>
        <div className="stat-row">
          <div className="mini-stat">
            <span>Avg Unit Price</span>
            <strong>{formatRupiah(summary.avgUnitPrice)}</strong>
          </div>
          <div className="mini-stat">
            <span>Unit / Hari</span>
            <strong>{formatNumber(summary.unitsPerDay, 1)}</strong>
          </div>
          <div className="mini-stat">
            <span>Omzet Online</span>
            <strong>{formatRupiahCompact(summary.onlineRevenue)}</strong>
          </div>
          <div className="mini-stat">
            <span>Konsentrasi Top Product</span>
            <strong>{formatPercent(summary.topParentShare * 100, 0)}</strong>
          </div>
          <div className="mini-stat">
            <span>Total Stok Terupload</span>
            <strong>
              {summary.hasStock ? (
                <>
                  <Warehouse size={18} style={{ marginRight: 6, color: "var(--text-secondary)" }} />
                  {formatCompact(summary.parentStats.reduce((acc, item) => acc + item.onHand, 0))}
                </>
              ) : (
                "-"
              )}
            </strong>
          </div>
        </div>
      </section>
    </>
  );
}

function kindLabel(metric: TrendMetric): string {
  return metric === "revenue" ? " omzet" : " volume";
}
