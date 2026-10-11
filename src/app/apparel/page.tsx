"use client";

import { useMemo } from "react";
import { Shirt, Sparkles } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import EmptyState from "@/components/EmptyState";
import { useData } from "@/lib/data-provider";
import { productAffinity, summarize } from "@/lib/analytics";
import { formatCompact, formatNumber, formatPercent, formatRupiah, formatRupiahCompact } from "@/lib/format";

const TOOLTIP_STYLE = {
  backgroundColor: "var(--bg-secondary)",
  borderColor: "var(--glass-border)",
  borderRadius: "8px",
  color: "var(--text-primary)",
};

export default function Apparel() {
  const { status, dataset, hasSales } = useData();

  const summary = useMemo(
    () => summarize(dataset.sales, dataset.stock, dataset.minDate, dataset.maxDate),
    [dataset],
  );

  const apparel = useMemo(() => summary.parentStats.filter((item) => item.apparelLike), [summary.parentStats]);
  const footwear = useMemo(() => summary.parentStats.filter((item) => !item.apparelLike), [summary.parentStats]);

  const affinity = useMemo(() => productAffinity(dataset.sales, 12), [dataset.sales]);

  if (status === "loading") {
    return <div className="feature-card glass-panel">Memuat data dari penyimpanan browser...</div>;
  }

  if (!hasSales) {
    return (
      <div className="mt-4">
        <EmptyState title="Analisis Apparel & Jersey butuh data penjualan" />
      </div>
    );
  }

  return (
    <section className="feature-section mt-4">
      <div className="feature-card glass-panel">
        <div className="feature-header">
          <h3>
            <Shirt size={20} style={{ display: "inline", marginRight: 8, color: "var(--accent-primary)" }} />
            Katalog Apparel, Jersey &amp; Aksesoris
          </h3>
          <p>
            Parent SKU diklasifikasikan otomatis: apparel bila seluruh ukuran bukan angka EU (S/M/L/XL/ONE SIZE), footwear bila ada
            ukuran numerik.
          </p>
        </div>

        <div className="stat-row">
          <div className="mini-stat">
            <span>Parent Apparel</span>
            <strong>{formatNumber(apparel.length)}</strong>
          </div>
          <div className="mini-stat">
            <span>Parent Footwear</span>
            <strong>{formatNumber(footwear.length)}</strong>
          </div>
          <div className="mini-stat">
            <span>Unit Apparel</span>
            <strong>{formatCompact(apparel.reduce((acc, item) => acc + item.units, 0))}</strong>
          </div>
          <div className="mini-stat">
            <span>Omzet Apparel</span>
            <strong>{formatRupiahCompact(apparel.reduce((acc, item) => acc + item.revenue, 0))}</strong>
          </div>
        </div>

        <div style={{ height: "280px", width: "100%" }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={apparel.slice(0, 10)}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" vertical={false} />
              <XAxis dataKey="parent" stroke="var(--text-secondary)" tick={{ fontSize: 11 }} />
              <YAxis stroke="var(--text-secondary)" />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => [`${formatNumber(Number(value))} unit`, "Terjual"]} />
              <Bar dataKey="units" fill="var(--accent-primary)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="feature-card glass-panel">
        <div className="feature-header">
          <h3>
            <Sparkles size={20} style={{ display: "inline", marginRight: 8, color: "var(--success)" }} />
            Product Affinity (Bundle Rekomendasi)
          </h3>
          <p>
            Dihitung dari item yang terjual bersama dalam satu toko pada bulan yang sama. Lift &gt; 1 berarti pasangan itu lebih sering
            dibeli daripada kebetulan.
          </p>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Item Apparel</th>
                <th>Pasangan</th>
                <th>Co-occurrence</th>
                <th>Support</th>
                <th>Confidence</th>
                <th>Lift</th>
              </tr>
            </thead>
            <tbody>
              {affinity.map((row, index) => (
                <tr key={`${row.anchor}-${row.partner}-${index}`}>
                  <td style={{ fontFamily: "monospace", fontWeight: 700 }}>{row.anchor}</td>
                  <td style={{ fontFamily: "monospace", color: "var(--text-secondary)" }}>{row.partner}</td>
                  <td>{formatNumber(row.cooccur)} periode</td>
                  <td style={{ color: "var(--text-secondary)" }}>{formatPercent(row.support * 100, 1)}</td>
                  <td style={{ color: "var(--text-secondary)" }}>{formatPercent(row.confidence * 100, 1)}</td>
                  <td>
                    <span
                      className="badge"
                      style={
                        row.lift >= 1.2
                          ? { background: "rgba(16,185,129,0.15)", color: "var(--success)" }
                          : { background: "rgba(255,255,255,0.08)", color: "var(--text-secondary)" }
                      }
                    >
                      {formatNumber(row.lift, 2)}x
                    </span>
                  </td>
                </tr>
              ))}
              {affinity.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ color: "var(--text-secondary)" }}>
                    Belum ada pasangan apparel + produk lain yang terjual bersamaan. Upload data lebih dari satu produk per toko agar
                    analitics afinitas bisa dihitung.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {apparel.length > 0 && (
          <span className="badge primary">
            Avg apparel:{" "}
            {formatRupiah(
              apparel.reduce((acc, item) => acc + item.revenue, 0) / Math.max(1, apparel.reduce((acc, item) => acc + item.units, 0)),
            )}
          </span>
        )}
        {footwear.length > 0 && (
          <span className="badge primary">
            Avg footwear:{" "}
            {formatRupiah(
              footwear.reduce((acc, item) => acc + item.revenue, 0) / Math.max(1, footwear.reduce((acc, item) => acc + item.units, 0)),
            )}
          </span>
        )}
      </div>
    </section>
  );
}
