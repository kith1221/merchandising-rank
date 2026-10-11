"use client";

import Link from "next/link";
import { Database, Upload } from "lucide-react";

export default function EmptyState({
  title = "Belum ada data penjualan",
  description = "Unggah file Excel atau CSV penjualan terlebih dahulu agar seluruh mesin analitik berjalan di atas data asli, bukan data contoh.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="feature-card glass-panel" style={{ alignItems: "center", textAlign: "center", padding: "48px 32px" }}>
      <Database size={44} style={{ color: "var(--accent-primary)" }} />
      <h3 style={{ marginTop: "16px" }}>{title}</h3>
      <p style={{ color: "var(--text-secondary)", maxWidth: "520px", lineHeight: 1.7 }}>{description}</p>
      <Link href="/upload" className="glow-btn" style={{ display: "inline-flex", alignItems: "center", gap: "8px", marginTop: "8px" }}>
        <Upload size={16} /> Upload Data Penjualan
      </Link>
    </div>
  );
}
