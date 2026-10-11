"use client";

import { AlertTriangle, X } from "lucide-react";
import { useData } from "@/lib/data-provider";

export default function PersistBanner() {
  const { error, persistError, dismissPersistError } = useData();
  const message = persistError ?? error;

  if (!message) return null;

  return (
    <div className="alert error" style={{ margin: "0 0 16px" }}>
      <AlertTriangle size={18} />
      <span style={{ flex: 1 }}>{message}</span>
      <button
        className="icon-btn"
        aria-label="Tutup pesan"
        onClick={dismissPersistError}
        style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 0 }}
      >
        <X size={16} />
      </button>
    </div>
  );
}