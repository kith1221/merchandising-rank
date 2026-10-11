"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "./ThemeProvider";

export default function ThemeToggle() {
  const { resolved, toggle } = useTheme();
  const nextLabel = resolved === "dark" ? "terang" : "gelap";

  return (
    <div className="theme-toggle" role="group" aria-label="Tema tampilan">
      <span className="theme-toggle-icon left">
        <Moon size={14} />
      </span>
      <span className="theme-toggle-icon right">
        <Sun size={14} />
      </span>
      <span className="theme-toggle-thumb" aria-hidden="true">
        {resolved === "dark" ? <Moon size={13} /> : <Sun size={13} />}
      </span>
      <button
        type="button"
        className="theme-toggle-hit"
        onClick={toggle}
        aria-label={`Ganti ke tema ${nextLabel}`}
        title={`Ganti ke tema ${nextLabel}`}
      />
    </div>
  );
}