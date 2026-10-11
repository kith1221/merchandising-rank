"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Check, MapPin, Package, Store, Warehouse } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import EmptyState from "@/components/EmptyState";
import { useData } from "@/lib/data-provider";
import { allocateByShare, summarize, type AllocationRow } from "@/lib/analytics";
import { formatNumber, formatPercent, formatRupiah } from "@/lib/format";
import { downloadCsv } from "@/lib/template";

const TOOLTIP_STYLE = {
  backgroundColor: "var(--bg-secondary)",
  borderColor: "var(--glass-border)",
  borderRadius: "8px",
  color: "var(--text-primary)",
};

const PALETTE = ["#ff2a2a", "#990000", "#ff5555", "#7f1d1d", "#e11d48", "#b45309", "#fb7185", "#431407"];

export default function Allocation() {
  const { status, dataset, hasSales, settings, updateSettings } = useData();
  const [inbound, setInbound] = useState(1000);
  const [scope, setScope] = useState<string>("ALL");
  const [copiedStore, setCopiedStore] = useState<string | null>(null);

  const summary = useMemo(
    () => summarize(dataset.sales, dataset.stock, dataset.minDate, dataset.maxDate),
    [dataset],
  );

  const plan = useMemo(
    () =>
      allocateByShare(
        dataset.sales,
        dataset.stock,
        inbound,
        settings,
        scope === "ALL" ? undefined : scope,
      ),
    [dataset.sales, dataset.stock, inbound, settings, scope],
  );

  if (status === "loading") {
    return <div className="feature-card glass-panel">Memuat data dari penyimpanan browser...</div>;
  }

  if (!hasSales) {
    return (
      <div className="mt-4">
        <EmptyState title="Smart Allocation butuh data penjualan" />
      </div>
    );
  }

  const reservable = Math.round(inbound * (1 - settings.allocationReservePct / 100));
  const distributed = plan.reduce((acc, row) => acc + row.suggested, 0);

  async function copyStorePlan(row: AllocationRow) {
    const text = [
      `Distribution Plan - ${row.store} (${row.channel})`,
      `Scope: ${scope === "ALL" ? "Semua produk" : scope}`,
      `Porsi: ${formatPercent(row.share * 100, 2)}`,
      `Alokasi: ${formatNumber(row.suggested)} unit`,
      `Stok on hand: ${summary.hasStock ? `${formatNumber(row.onHand)} unit` : "-"}`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      window.alert(text);
    }
    setCopiedStore(row.store);
    window.setTimeout(() => setCopiedStore((current) => (current === row.store ? null : current)), 2000);
  }

  return (
    <section className="feature-section mt-4">
      <div className="feature-card glass-panel">
        <div className="feature-header">
          <h3>Smart Allocation Engine</h3>
          <p>
            Porsi tiap outlet dihitung dari histori penjualan ({settings.allocationBasis === "units" ? "berdasarkan unit" : "berdasarkan omzet"}),
            lalu stok inbound dibagi proporsional dengan metode largest remainder.
          </p>
        </div>

        <div className="toolbar">
          <label className="field-inline">
            Total Inbound
            <input
              type="number"
              min={0}
              className="input-field"
              style={{ width: "140px" }}
              value={inbound}
              onChange={(event) => setInbound(Number(event.target.value) || 0)}
            />
          </label>
          <label className="field-inline">
            Scope produk
            <select className="select-field" style={{ width: "220px" }} value={scope} onChange={(event) => setScope(event.target.value)}>
              <option value="ALL">Semua produk</option>
              {summary.parentStats.map((item) => (
                <option key={item.parent} value={item.parent}>
                  {item.parent}
                </option>
              ))}
            </select>
          </label>
          <label className="field-inline">
            Basis
            <select
              className="select-field"
              style={{ width: "150px" }}
              value={settings.allocationBasis}
              onChange={(event) => updateSettings({ allocationBasis: event.target.value as "units" | "revenue" })}
            >
              <option value="units">Unit terjual</option>
              <option value="revenue">Omzet</option>
            </select>
          </label>
          <label className="field-inline">
            Reserve gudang
            <input
              type="number"
              min={0}
              max={50}
              className="input-field"
              style={{ width: "90px" }}
              value={settings.allocationReservePct}
              onChange={(event) => updateSettings({ allocationReservePct: Number(event.target.value) || 0 })}
            />
            <span style={{ textTransform: "none" }}>%</span>
          </label>
        </div>

        <div style={{ height: "300px", width: "100%" }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={plan} dataKey="suggested" nameKey="store" innerRadius={60} outerRadius={105} paddingAngle={3}>
                {plan.map((row, index) => (
                  <Cell key={row.store} fill={PALETTE[index % PALETTE.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                itemStyle={{ color: "var(--text-primary)", fontWeight: 700 }}
                formatter={(value) => [`${formatNumber(Number(value))} unit`, "Alokasi"]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="feature-card glass-panel">
        <div className="feature-header">
          <h3>Distribution Plan (Transfer Out)</h3>
          <p>
            Sisa {formatNumber(inbound - reservable)} unit ({settings.allocationReservePct}%) ditahan sebagai reserve gudang pusat.
          </p>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Cabang / Kanal</th>
                <th>Tipe</th>
                <th>Histori</th>
                <th>Share</th>
                <th>Stok Toko</th>
                <th>Alokasi</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {plan.map((row) => (
                <tr key={row.store}>
                  <td style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                    {row.channel === "ONLINE" ? (
                      <Package size={14} style={{ display: "inline", marginRight: 6, color: "var(--accent-primary)" }} />
                    ) : (
                      <MapPin size={14} style={{ display: "inline", marginRight: 6, color: "var(--text-secondary)" }} />
                    )}
                    {row.store}
                  </td>
                  <td style={{ color: "var(--text-secondary)" }}>{row.channel === "ONLINE" ? "Online" : "Offline"}</td>
                  <td style={{ color: "var(--text-secondary)" }}>
                    {formatNumber(row.units)} unit
                    <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>{formatRupiah(row.revenue)}</div>
                  </td>
                  <td style={{ color: "var(--accent-primary)", fontWeight: 700 }}>{formatPercent(row.share * 100)}</td>
                  <td style={{ color: "var(--text-secondary)" }}>
                    {summary.hasStock ? `${formatNumber(row.onHand)} unit` : "-"}
                  </td>
                  <td style={{ fontWeight: 800, color: "var(--accent-primary)", fontSize: "18px" }}>
                    {formatNumber(row.suggested)} <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>unit</span>
                  </td>
                  <td>
                    <button
                      className="ghost-btn"
                      style={{ color: "var(--success)", borderColor: "rgba(16,185,129,0.3)" }}
                      onClick={() => void copyStorePlan(row)}
                    >
                      {copiedStore === row.store ? (
                        <>
                          <Check size={14} /> Tersalin
                        </>
                      ) : (
                        <>
                          Kirim <ArrowRight size={14} />
                        </>
                      )}
                    </button>
                  </td>
                </tr>
              ))}
              <tr style={{ background: "var(--hover-bg)" }}>
                <td colSpan={3} style={{ textAlign: "right", fontWeight: 800 }}>
                  TOTAL DISTRIBUSI:
                </td>
                <td colSpan={3} style={{ fontWeight: 800, color: "var(--accent-primary)", fontSize: "20px" }}>
                  {formatNumber(distributed)} unit
                </td>
                <td />
              </tr>
              <tr>
                <td colSpan={3} style={{ textAlign: "right", color: "var(--text-secondary)" }}>
                  <Warehouse size={12} style={{ marginRight: 4 }} /> Reserve gudang pusat
                </td>
                <td colSpan={4} style={{ color: "var(--text-secondary)" }}>
                  {formatNumber(inbound - reservable)} unit
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="toolbar">
          <button
            className="glow-btn"
            style={{ display: "flex", alignItems: "center", gap: "8px" }}
            onClick={() =>
              downloadCsv("allocation-plan.csv", [
                ["Outlet", "Kanal", "Histori Unit", "Histori Omzet", "Share (%)", "Alokasi Unit"],
                ...plan.map((row) => [
                  row.store,
                  row.channel,
                  row.units,
                  row.revenue,
                  (row.share * 100).toFixed(2),
                  row.suggested,
                ]),
              ])
            }
          >
            <Store size={16} /> Export Distribution Plan
          </button>
          {plan.length === 0 && (
            <span className="badge" style={{ background: "rgba(245,158,11,0.15)", color: "var(--warning)" }}>
              Tidak ada outlet untuk scope ini
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
