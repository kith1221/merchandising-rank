const rupiahFormatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

export function formatRupiah(value: number): string {
  if (!Number.isFinite(value)) return rupiahFormatter.format(0);
  return rupiahFormatter.format(Math.round(value));
}

const COMPACT_TIERS: { limit: number; suffix: string }[] = [
  { limit: 1e12, suffix: " T" },
  { limit: 1e9, suffix: " miliar" },
  { limit: 1e6, suffix: " jt" },
  { limit: 1e3, suffix: " rb" },
];

export function formatCompact(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const sign = value < 0 ? "-" : "";
  const rest = Math.abs(value);
  for (const tier of COMPACT_TIERS) {
    if (rest < tier.limit) continue;
    const scaled = rest / tier.limit;
    return `${sign}${scaled.toLocaleString("id-ID", { maximumFractionDigits: scaled >= 100 ? 0 : 1 })}${tier.suffix}`;
  }
  return `${sign}${Math.round(rest)}`;
}

export function formatRupiahCompact(value: number): string {
  if (!Number.isFinite(value)) return "Rp 0";
  return `Rp ${formatCompact(value)}`;
}

export function formatNumber(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return "0";
  return value.toLocaleString("id-ID", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatPercent(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "0%";
  return `${value.toFixed(digits)}%`;
}

export function formatDate(iso: string | null): string {
  if (!iso) return "-";
  const parsed = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function monthLabel(key: string): string {
  const [year, month] = key.split("-");
  const parsed = new Date(Number(year), Number(month) - 1, 1);
  if (Number.isNaN(parsed.getTime())) return key;
  return parsed.toLocaleDateString("id-ID", { month: "short", year: "2-digit" });
}

export function dateRangeLabel(min: string | null, max: string | null): string {
  if (!min || !max) return "-";
  return `${formatDate(min)} - ${formatDate(max)}`;
}

export function daysBetween(min: string | null, max: string | null): number {
  if (!min || !max) return 0;
  const start = new Date(`${min}T00:00:00`).getTime();
  const end = new Date(`${max}T00:00:00`).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.max(1, Math.round((end - start) / 86_400_000) + 1);
}
