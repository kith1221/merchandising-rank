"use client";

import { useMemo } from "react";
import { MapPin, ShoppingBag, Store } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import { useData } from "@/lib/data-provider";
import { summarize } from "@/lib/analytics";
import { formatCompact, formatNumber, formatPercent, formatRupiah, formatRupiahCompact } from "@/lib/format";
import { dateRangeLabel } from "@/lib/format";

export default function StoreNetwork() {
  const { status, dataset, hasSales } = useData();

  const summary = useMemo(
    () => summarize(dataset.sales, dataset.stock, dataset.minDate, dataset.maxDate),
    [dataset],
  );

  if (status === "loading") {
    return <div className="feature-card glass-panel">Memuat data dari penyimpanan browser...</div>;
  }

  if (!hasSales) {
    return (
      <div className="mt-4">
        <EmptyState title="Store Network butuh data penjualan" />
      </div>
    );
  }

  const offlineStores = summary.storeStats.filter((store) => store.channel === "OFFLINE");
  const onlineStores = summary.storeStats.filter((store) => store.channel === "ONLINE");
  const totalOnHand = summary.storeStats.reduce((acc, store) => acc + store.onHand, 0);

  return (
    <section className="feature-section mt-4">
      <div className="feature-card glass-panel" style={{ gridColumn: "1 / -1" }}>
        <div className="feature-header">
          <h3>Jaringan Offline & Online Rank Sports</h3>
          <p>
            Outlet dan kanal yang muncul di file upload, diurutkan dari volume tertinggi. Periode data:{" "}
            {dateRangeLabel(dataset.minDate, dataset.maxDate)}.
          </p>
        </div>

        <div className="stat-row">
          <div className="mini-stat">
            <span>Outlet Fisik</span>
            <strong>{formatNumber(offlineStores.length)}</strong>
          </div>
          <div className="mini-stat">
            <span>Kanal Online</span>
            <strong>{formatNumber(onlineStores.length)}</strong>
          </div>
          <div className="mini-stat">
            <span>Unit Terjual</span>
            <strong>{formatCompact(summary.totalUnits)}</strong>
          </div>
          <div className="mini-stat">
            <span>Omzet</span>
            <strong>{formatRupiahCompact(summary.totalRevenue)}</strong>
          </div>
          <div className="mini-stat">
            <span>Stok On Hand</span>
            <strong>{summary.hasStock ? formatCompact(totalOnHand) : "-"}</strong>
          </div>
        </div>
      </div>

      <div className="feature-card glass-panel" style={{ gridColumn: "1 / -1" }}>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Outlet / Kanal</th>
                <th>Tipe</th>
                <th>Unit</th>
                <th>Omzet</th>
                <th>Share Unit</th>
                <th>Avg Price</th>
                <th>Stok</th>
                <th>Penjualan Terakhir</th>
              </tr>
            </thead>
            <tbody>
              {summary.storeStats.map((store) => (
                <tr key={store.store}>
                  <td style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                    {store.channel === "ONLINE" ? (
                      <ShoppingBag size={14} style={{ display: "inline", marginRight: 6, color: "var(--accent-primary)" }} />
                    ) : (
                      <MapPin size={14} style={{ display: "inline", marginRight: 6, color: "var(--text-secondary)" }} />
                    )}
                    {store.store}
                  </td>
                  <td>
                    <span
                      className="badge"
                      style={
                        store.channel === "ONLINE"
                          ? { background: "rgba(255,42,42,0.15)", color: "var(--accent-primary)" }
                          : { background: "rgba(255,255,255,0.08)", color: "var(--text-secondary)" }
                      }
                    >
                      {store.channel === "ONLINE" ? "Online" : "Offline"}
                    </span>
                  </td>
                  <td style={{ fontWeight: 700 }}>{formatNumber(store.units)}</td>
                  <td style={{ color: "var(--text-secondary)" }}>{formatRupiah(store.revenue)}</td>
                  <td style={{ color: "var(--accent-primary)", fontWeight: 700 }}>{formatPercent(store.share * 100)}</td>
                  <td style={{ color: "var(--text-secondary)" }}>
                    {formatRupiah(store.units > 0 ? store.revenue / store.units : 0)}
                  </td>
                  <td style={{ color: "var(--text-secondary)" }}>
                    {summary.hasStock ? `${formatNumber(store.onHand)} unit` : "-"}
                  </td>
                  <td style={{ color: "var(--text-secondary)" }}>{store.lastSale}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="toolbar">
          <Store size={16} style={{ color: "var(--text-secondary)" }} />
          <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
            Tambah outlet baru cukup dengan mengupload baris penjualan dengan nama toko yang berbeda - tidak perlu master terpisah.
          </span>
        </div>
      </div>
    </section>
  );
}
