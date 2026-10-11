"use client";

import { useMemo } from "react";
import { AlertCircle, Tags } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import { useData } from "@/lib/data-provider";
import { markdownPlan, summarize } from "@/lib/analytics";
import { formatNumber, formatPercent, formatRupiah, formatRupiahCompact } from "@/lib/format";
import { downloadCsv } from "@/lib/template";

export default function Markdown() {
  const { status, dataset, hasSales, settings } = useData();

  const summary = useMemo(
    () => summarize(dataset.sales, dataset.stock, dataset.minDate, dataset.maxDate),
    [dataset],
  );

  const candidates = useMemo(
    () => markdownPlan(dataset.sales, dataset.stock, settings, dataset.minDate, dataset.maxDate),
    [dataset, settings],
  );

  if (status === "loading") {
    return <div className="feature-card glass-panel">Memuat data dari penyimpanan browser...</div>;
  }

  if (!hasSales) {
    return (
      <div className="mt-4">
        <EmptyState title="Markdown Optimization butuh data penjualan" />
      </div>
    );
  }

  const valueAtRisk = candidates.reduce((acc, row) => acc + row.valueAtRisk, 0);

  return (
    <section className="mt-4 animate-fade-in">
      <div className="feature-card glass-panel" style={{ padding: "32px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "24px" }}>
          <Tags size={36} style={{ color: "var(--warning)" }} />
          <div>
            <h3 style={{ margin: 0, fontSize: "24px" }}>Markdown Optimization Engine</h3>
            <p style={{ margin: 0, color: "var(--text-secondary)" }}>
              Rekomendasi pemotongan harga dari sell-through, weeks of cover, dan umur stok.
            </p>
          </div>
        </div>

        <div className="alert info">
          <AlertCircle size={20} style={{ color: "var(--warning)", flexShrink: 0, marginTop: 2 }} />
          <p style={{ margin: 0, fontSize: "14px", lineHeight: 1.6 }}>
            Sistem menandai <strong>{candidates.length} parent SKU</strong> untuk tindakan markdown dengan estimasi nilai stok
            berisiko <strong>{formatRupiah(valueAtRisk)}</strong>.{" "}
            {summary.hasStock
              ? "Metode: weeks of cover = stok / (rata-rata unit harian x 7)."
              : "Belum ada sheet stok, jadi weeks of cover dihitung dari umur sejak penjualan terakhir. Upload sheet stok untuk angka yang lebih akurat."}
          </p>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Parent SKU</th>
                <th>Health Index</th>
                <th>Umur Stok</th>
                <th>Avg Price</th>
                <th>Rekomendasi</th>
                <th>Harga Baru</th>
                <th>Nilai Berisiko</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((row) => (
                <tr key={row.parent}>
                  <td>
                    <div style={{ fontWeight: 700, color: "var(--text-primary)", fontFamily: "monospace" }}>{row.parent}</div>
                    <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                      {formatNumber(row.unitsSold)} unit terjual | stok {formatNumber(row.onHand)}
                    </div>
                  </td>
                  <td>
                    <div style={{ color: row.sellThrough < 0.5 ? "var(--danger)" : "var(--warning)", fontWeight: 700 }}>
                      STR: {formatPercent(row.sellThrough * 100, 0)}
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                      Cover: {formatNumber(row.weeksCover, 1)} minggu
                    </div>
                  </td>
                  <td style={{ color: "var(--text-secondary)" }}>
                    {summary.hasStock ? `${row.daysSinceLastSale} hari (tanpa sales)` : `${row.daysSinceLastSale} hari sejak jual`}
                    <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                      {row.basis === "STOCK" ? "berbasis stok" : "berbasis sales"}
                    </div>
                  </td>
                  <td style={{ color: "var(--text-secondary)", textDecoration: "line-through" }}>{formatRupiah(row.currentPrice)}</td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span className="badge" style={{ background: "var(--danger)", color: "var(--text-primary)" }}>
                        -{row.discount}%
                      </span>
                      <strong style={{ color: "var(--success)" }}>{formatRupiah(row.newPrice)}</strong>
                    </div>
                  </td>
                  <td style={{ color: "var(--text-secondary)" }}>{formatRupiahCompact(row.valueAtRisk)}</td>
                </tr>
              ))}
              {candidates.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ color: "var(--text-secondary)" }}>
                    Tidak ada SKU yang lolos ambang markdown untuk periode ini.
                    {summary.hasStock
                      ? " Semua parent SKU masih punya weeks of cover di bawah ambang diskon atau baru saja terjual habis."
                      : " Tanpa sheet stok, ambang markdown memakai umur sejak penjualan terakhir (minimal 21 hari). Upload sheet stok agar rekomendasi berbasis weeks of cover."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="toolbar">
          <button
            className="glow-btn"
            style={{
              background: "var(--warning)",
              color: "#000",
              boxShadow: "0 4px 15px rgba(245,158,11,0.3)",
              opacity: candidates.length === 0 ? 0.4 : 1,
            }}
            disabled={candidates.length === 0}
            onClick={() =>
              downloadCsv("markdown-plan.csv", [
                ["Parent SKU", "Unit Terjual", "Stok", "Weeks Cover", "Sell Through (%)", "Harga Lama", "Diskon (%)", "Harga Baru"],
                ...candidates.map((row) => [
                  row.parent,
                  row.unitsSold,
                  row.onHand,
                  row.weeksCover.toFixed(1),
                  (row.sellThrough * 100).toFixed(1),
                  Math.round(row.currentPrice),
                  row.discount,
                  Math.round(row.newPrice),
                ]),
              ])
            }
          >
            Export Markdown Plan
          </button>
          <span className="badge primary">{candidates.length} kandidat</span>
        </div>
      </div>
    </section>
  );
}
