"use client";

import Link from "next/link";
import { AlertCircle, Bell, CheckCircle2, Database } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useData } from "@/lib/data-provider";
import ThemeToggle from "./ThemeToggle";
import { dateRangeLabel, formatNumber } from "@/lib/format";

export default function Topbar() {
  const pathname = usePathname();
  const { status, dataset } = useData();
  const [panelOpen, setPanelOpen] = useState(false);

  let pageTitle = "Overview";
  let pageSubtitle = "Rank Sports Omnichannel ERP";

  if (pathname === "/upload") {
    pageTitle = "Upload Data";
    pageSubtitle = "Ingest File Penjualan Excel / CSV";
  } else if (pathname === "/purchasing") {
    pageTitle = "Purchasing";
    pageSubtitle = "Size Curve Optimization & PO Generation";
  } else if (pathname === "/allocation") {
    pageTitle = "Smart Allocation";
    pageSubtitle = "Multi-Warehouse Distribution Logic";
  } else if (pathname === "/forecasting") {
    pageTitle = "Forecasting";
    pageSubtitle = "Event-Driven Demand Prediction";
  } else if (pathname === "/markdown") {
    pageTitle = "Markdown Optimization";
    pageSubtitle = "Slow-Moving Inventory Clearance";
  } else if (pathname === "/store-network") {
    pageTitle = "Store Network";
    pageSubtitle = "Offline Outlets & Online Channel Management";
  } else if (pathname === "/ai-insights") {
    pageTitle = "AI Insights";
    pageSubtitle = "Analisa Merchandising Otomatis Berbasis AI";
  } else if (pathname === "/apparel") {
    pageTitle = "Apparel & Jersey";
    pageSubtitle = "Non-Footwear Inventory Matrix";
  } else if (pathname === "/about") {
    pageTitle = "About ERP System";
    pageSubtitle = "Dokumentasi & Alur Sistem Intelligence Merchandising";
  } else if (pathname === "/settings") {
    pageTitle = "Settings";
    pageSubtitle = "System Configuration";
  }

  const rows = dataset.sales.length;
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!panelOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) setPanelOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setPanelOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [panelOpen]);

  const warnings: string[] = [];
  if (status === "ready" && rows === 0) warnings.push("Belum ada data penjualan. Upload file .xlsx atau .csv untuk memulai.");
  if (rows > 0 && dataset.stock.length === 0) {
    warnings.push("Sheet stok belum diupload. Weeks of cover, safety stock, dan reorder memakai asumsi without stock.");
  }
  if (rows === 0 && status !== "loading") warnings.push("Modul analitik akan menampilkan halaman kosong sampai data diimport.");

  return (
    <header className="topbar">
      <div>
        <h1 className="page-title">{pageTitle}</h1>
        <p className="page-subtitle">{pageSubtitle}</p>
      </div>
      <div className="user-profile">
        {rows > 0 ? (
          <Link href="/upload" className="badge primary" title={dataset.sources.join(", ")}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <Database size={12} /> {formatNumber(rows)} baris | {dateRangeLabel(dataset.minDate, dataset.maxDate)}
            </span>
          </Link>
        ) : status === "ready" ? (
          <Link href="/upload" className="badge" style={{ background: "rgba(245, 158, 11, 0.15)", color: "var(--warning)" }}>
            Belum ada data
          </Link>
        ) : null}
        <div style={{ position: "relative" }} ref={panelRef}>
          <button
            className="icon-btn"
            aria-label="Status data"
            title="Status data"
            onClick={() => setPanelOpen((open) => !open)}
            style={{
              background: "none",
              border: "none",
              color: warnings.length > 0 && rows > 0 ? "var(--warning)" : "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            <Bell size={24} />
          </button>
          {panelOpen && (
            <div
              className="glass-panel"
              style={{
                position: "absolute",
                right: 0,
                top: "calc(100% + 10px)",
                width: "320px",
                padding: "16px",
                zIndex: 50,
                textAlign: "left",
              }}
            >
              <div className="stat-title" style={{ marginBottom: "10px" }}>
                Status Data
              </div>
              <div style={{ display: "grid", gap: "6px", fontSize: "13px", color: "var(--text-secondary)" }}>
                <div>Periode: {rows > 0 ? dateRangeLabel(dataset.minDate, dataset.maxDate) : "-"}</div>
                <div>Baris penjualan: {formatNumber(rows)}</div>
                <div>Baris stok: {formatNumber(dataset.stock.length)}</div>
                <div>Sumber: {dataset.sources.length > 0 ? dataset.sources.join(", ") : "-"}</div>
                <div>
                  Impor terakhir:{" "}
                  {dataset.importedAt ? new Date(dataset.importedAt).toLocaleString("id-ID") : "-"}
                </div>
              </div>
              {warnings.length > 0 ? (
                <div className="alert info" style={{ marginTop: "12px", marginBottom: 0 }}>
                  <AlertCircle size={16} />
                  <span>
                    {warnings.map((item) => (
                      <span key={item} style={{ display: "block", marginBottom: 4 }}>
                        {item}
                      </span>
                    ))}
                  </span>
                </div>
              ) : (
                <div className="alert success" style={{ marginTop: "12px", marginBottom: 0 }}>
                  <CheckCircle2 size={16} /> Data siap dipakai semua modul.
                </div>
              )}
              <Link href="/upload" className="ghost-btn accent" style={{ marginTop: "12px" }}>
                Kelola data
              </Link>
            </div>
          )}
        </div>
        <ThemeToggle />
        <div className="avatar">AD</div>
      </div>
    </header>
  );
}
