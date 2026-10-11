"use client";

import { useMemo, useState } from "react";
import { BarChart3, Download, FileText, Package, ShoppingCart, TriangleAlert } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import EmptyState from "@/components/EmptyState";
import { useData } from "@/lib/data-provider";
import { buildPoPlan, reorderPlan, sizeCurveFor, summarize } from "@/lib/analytics";
import { formatNumber, formatPercent } from "@/lib/format";
import { downloadCsv } from "@/lib/template";
import { downloadPoPdf } from "@/lib/export-pdf";

const TOOLTIP_STYLE = {
  backgroundColor: "var(--bg-secondary)",
  borderColor: "var(--glass-border)",
  borderRadius: "8px",
  color: "var(--text-primary)",
};

export default function Purchasing() {
  const { status, dataset, hasSales, settings, updateSettings } = useData();
  const [target, setTarget] = useState(1000);
  const [respectRules, setRespectRules] = useState(true);
  const [selectedParent, setSelectedParent] = useState<string>("");

  const summary = useMemo(
    () => summarize(dataset.sales, dataset.stock, dataset.minDate, dataset.maxDate),
    [dataset],
  );

  const parentSku = selectedParent || summary.parentStats[0]?.parent || "";

  const curve = useMemo(
    () => (parentSku ? sizeCurveFor(dataset.sales, parentSku) : []),
    [dataset.sales, parentSku],
  );

  const plan = useMemo(
    () => buildPoPlan(curve, target, settings.poPackSize, settings.poMoq, respectRules),
    [curve, target, settings.poPackSize, settings.poMoq, respectRules],
  );

  const reorder = useMemo(
    () => reorderPlan(dataset.sales, dataset.stock, settings, dataset.minDate, dataset.maxDate),
    [dataset, settings],
  );

  if (status === "loading") {
    return <div className="feature-card glass-panel">Memuat data dari penyimpanan browser...</div>;
  }

  if (!hasSales) {
    return (
      <div className="mt-4">
        <EmptyState title="Size Curve butuh data penjualan" />
      </div>
    );
  }

  const activeParent = summary.parentStats.find((item) => item.parent === parentSku);

  return (
    <section className="feature-section mt-4">
      <div className="feature-card glass-panel">
        <div className="feature-header">
          <h3>Size Curve Engine</h3>
          <p>Distribusi ukuran dihitung dari histori penjualan nyata. Parent SKU dengan unit terbanyak dipakai sebagai default.</p>
        </div>

        <div className="toolbar">
          <label className="field-inline" style={{ flex: 1, minWidth: "260px" }}>
            Parent SKU
            <select className="select-field" value={parentSku} onChange={(event) => setSelectedParent(event.target.value)}>
              {summary.parentStats.map((item) => (
                <option key={item.parent} value={item.parent}>
                  {item.parent} ({formatNumber(item.units)} unit)
                </option>
              ))}
            </select>
          </label>
          {activeParent && (
            <span className="badge primary">
              {formatPercent(activeParent.units / Math.max(1, summary.totalUnits) * 100, 1)} dari total unit
            </span>
          )}
        </div>

        <div style={{ height: "260px", width: "100%" }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={curve}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" vertical={false} />
              <XAxis dataKey="size" stroke="var(--text-secondary)" />
              <YAxis stroke="var(--text-secondary)" unit="%" />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(value, _name, payload) => {
                  const units = (payload?.payload as { units?: number } | undefined)?.units ?? 0;
                  return [`${formatNumber(units)} unit (${formatPercent(Number(value))})`, "Porsi Size"];
                }}
              />
              <Bar dataKey="pct" radius={[4, 4, 0, 0]}>
                {curve.map((point) => (
                  <Cell key={point.size} fill="var(--accent-primary)" />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="toolbar">
          <label className="field-inline">
            Target PO
            <input
              type="number"
              min={0}
              className="input-field"
              style={{ width: "130px" }}
              value={target}
              onChange={(event) => setTarget(Number(event.target.value) || 0)}
            />
          </label>
          <label className="field-inline">
            Isi per karton
            <input
              type="number"
              min={1}
              className="input-field"
              style={{ width: "90px" }}
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
              style={{ width: "90px" }}
              value={settings.poMoq}
              onChange={(event) => updateSettings({ poMoq: Number(event.target.value) || 0 })}
            />
          </label>
          <label className="radio">
            <input type="checkbox" checked={respectRules} onChange={(event) => setRespectRules(event.target.checked)} />
            <span>Bulatkan ke isi karton &amp; MOQ</span>
          </label>
        </div>
      </div>

      <div className="feature-card glass-panel">
        <div className="feature-header">
          <h3>Purchase Order Breakdown (Draft)</h3>
          <p>Alokasi per Child SKU memakai metode largest remainder agar total persis sesuai target.</p>
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th>Size</th>
              <th>Child SKU</th>
              <th>Histori</th>
              <th>Porsi</th>
              <th>Order Qty</th>
            </tr>
          </thead>
          <tbody>
            {plan.rows.map((row) => (
              <tr key={row.size}>
                <td style={{ fontWeight: 700 }}>{row.size}</td>
<td style={{ fontFamily: "monospace", color: "var(--text-secondary)" }}>{row.sku}</td>
                <td style={{ color: "var(--text-secondary)" }}>{formatNumber(row.units)} unit</td>
                <td style={{ color: "var(--text-secondary)" }}>{formatPercent(row.sharePct)}</td>
                <td style={{ fontWeight: 800, color: "var(--text-primary)", fontSize: "18px" }}>
                  {formatNumber(row.orderQty)}
                </td>
              </tr>
            ))}
            <tr style={{ background: "var(--hover-bg)" }}>
              <td colSpan={4} style={{ textAlign: "right", fontWeight: 800 }}>
                TOTAL DRAFT PO:
              </td>
              <td style={{ fontWeight: 800, color: "var(--accent-primary)", fontSize: "20px" }}>
                {formatNumber(plan.total)} prs
              </td>
            </tr>
          </tbody>
        </table>

        {plan.overshoot !== 0 && (
          <div className="alert info">
            <TriangleAlert size={18} />
            <span>
              Pembulatan karton/MOQ membuat total {plan.total} unit, berbeda {plan.overshoot > 0 ? "+" : ""}
              {formatNumber(plan.overshoot)} dari target {formatNumber(plan.target)}. Nonaktifkan aturan pembulatan untuk hasil persis.
            </span>
          </div>
        )}

        <div className="toolbar">
          <button
            className="glow-btn"
            disabled={plan.rows.length === 0}
            onClick={() =>
              downloadCsv(`po-${parentSku || "parent"}.csv`, [
                ["Parent SKU", "Size", "Child SKU", "Order Qty", "Porsi (%)"],
                ...plan.rows.map((row) => [
                  parentSku,
                  row.size,
                  row.sku,
                  row.orderQty,
                  row.sharePct.toFixed(2),
                ]),
              ])
            }
            style={{ display: "flex", alignItems: "center", gap: "8px", opacity: plan.rows.length === 0 ? 0.4 : 1 }}
          >
            <Download size={16} /> Export PO CSV
          </button>
          <button
            className="ghost-btn"
            disabled={plan.rows.length === 0}
            onClick={() =>
              downloadPoPdf({
                parentSku,
                target,
                total: plan.total,
                rows: plan.rows,
                packSize: settings.poPackSize,
                moq: settings.poMoq,
                respectRules,
                overshoot: plan.overshoot,
              })
            }
            style={{ display: "flex", alignItems: "center", gap: "8px", opacity: plan.rows.length === 0 ? 0.4 : 1 }}
          >
            <FileText size={16} /> Export PO PDF
          </button>
          <span className="badge primary">
            <ShoppingCart size={12} style={{ marginRight: 6 }} /> {formatNumber(plan.total)} unit
          </span>
        </div>
      </div>

      <div className="feature-card glass-panel" style={{ gridColumn: "1 / -1" }}>
        <div className="feature-header">
          <h3>Reorder Recommendation (Safety Stock + Lead Time)</h3>
          <p>
            Permintaan lead time {settings.leadTimeDays} hari + safety stock (z={settings.serviceLevelZ}) dikurangi stok tersedia.
            {summary.hasStock ? "" : " Upload sheet stok agar kolom stok tersedia terisi."} Kalau file stok menyertakan kolom{" "}
            <strong>Safety_Stock</strong> dan <strong>Reorder_Point</strong>, angka itu dipakai langsung sebagai pemicu PO.
          </p>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Parent SKU</th>
                <th>Terjual</th>
                <th>Avg / Hari</th>
                <th>Needs LT</th>
                <th>Safety Stock</th>
                <th>Reorder Point</th>
                <th>Stok</th>
                <th>Weeks Cover</th>
                <th>Saran PO</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {reorder.slice(0, 15).map((row) => (
                <tr key={row.parent}>
                  <td style={{ fontWeight: 700, fontFamily: "monospace" }}>{row.parent}</td>
                  <td style={{ color: "var(--text-secondary)" }}>{formatNumber(row.unitsSold)}</td>
                  <td style={{ color: "var(--text-secondary)" }}>{formatNumber(row.avgDaily, 1)}</td>
                  <td style={{ color: "var(--text-secondary)" }}>{formatNumber(row.leadTimeDemand)}</td>
                  <td style={{ color: "var(--text-secondary)" }}>{formatNumber(row.safetyStock)}</td>
                  <td style={{ color: "var(--text-secondary)" }}>
                    {formatNumber(row.reorderPoint)}{" "}
                    {row.reorderPointSource === "FILE" && (
                      <span
                        title="Diambil dari kolom Reorder_Point di file stok"
                        style={{ fontSize: "9px", color: "var(--accent-primary)", marginLeft: 4 }}
                      >
                        FILE
                      </span>
                    )}
                  </td>
                  <td>{summary.hasStock ? formatNumber(row.onHand) : "-"}</td>
                  <td style={{ color: "var(--text-secondary)" }}>
                    {summary.hasStock ? `${formatNumber(row.weeksCover, 1)} mg` : "-"}
                  </td>
                  <td style={{ fontWeight: 800, color: row.suggestedOrder > 0 ? "var(--accent-primary)" : "var(--text-secondary)" }}>
                    {summary.hasStock ? formatNumber(row.suggestedOrder) : "-"}
                  </td>
                  <td>
                    {!summary.hasStock ? (
                      <span className="badge" style={{ background: "rgba(255,255,255,0.08)", color: "var(--text-secondary)" }}>
                        Perlu data stok
                      </span>
                    ) : row.status === "UNDERSTOCK" ? (
                      <span className="badge" style={{ background: "rgba(239, 68, 68, 0.15)", color: "var(--danger)" }}>
                        Butuh PO
                      </span>
                    ) : row.status === "OVERSTOCK" ? (
                      <span className="badge" style={{ background: "rgba(245, 158, 11, 0.15)", color: "var(--warning)" }}>
                        Overstock
                      </span>
                    ) : (
                      <span className="badge" style={{ background: "rgba(16, 185, 129, 0.15)", color: "var(--success)" }}>
                        Seimbang
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

<div className="toolbar">
            <span className="badge primary">
              <Package size={12} style={{ marginRight: 6 }} />
              {summary.hasStock
                ? `Total saran PO: ${formatNumber(reorder.reduce((acc, row) => acc + row.suggestedOrder, 0))} unit`
                : "Total saran PO butuh data stok per toko"}
            </span>
            <span className="badge primary">
              <BarChart3 size={12} style={{ marginRight: 6 }} />
              {reorder.filter((row) => row.status === "UNDERSTOCK").length} parent perlu PO,{" "}
              {reorder.filter((row) => row.status === "OVERSTOCK").length} overstock
            </span>
          </div>
      </div>
    </section>
  );
}
