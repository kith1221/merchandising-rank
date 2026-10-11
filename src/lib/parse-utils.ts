import type { ChannelKind } from "./types";

const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  mei: 4, may: 4, jun: 5, june: 5, jul: 6, july: 6, agu: 7, aug: 7, august: 7,
  sep: 8, sept: 8, september: 8, okt: 9, oct: 9, october: 9, nov: 10, november: 10,
  des: 11, dec: 11, december: 11,
};

const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);
const DAY_MS = 86_400_000;

export function normalizeText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function normalizeHeader(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = String(value).toLowerCase();
  text = text.replace(/[‘’“”]/g, " ");
  text = text.replace(/[^a-z0-9]+/g, "");
  text = text.replace(/(?:rp|idr|unit|ec|eu)$/g, "");
  text = text.replace(/^(?:no|nomor|kd|kode|col|kolom)/g, "");
  return text;
}

export function toText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

export function collapseText(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

export function slugSkuPart(value: unknown): string {
  return collapseText(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function parseNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value === null || value === undefined) return null;

  let text = String(value).trim();
  if (!text) return null;
  text = text.replace(/[^\d.,\-+eE]/g, "");
  if (!text) return null;

  const negative = /^-/.test(text);
  text = text.replace(/^-+/, "");

  const hasDot = text.includes(".");
  const hasComma = text.includes(",");

  if (hasDot && hasComma) {
    const decimalIndex = Math.max(text.lastIndexOf("."), text.lastIndexOf(","));
    const head = text.slice(0, decimalIndex).replace(/[.,]/g, "");
    const tail = text.slice(decimalIndex + 1);
    const parsed = Number(`${head}.${tail}`);
    return Number.isFinite(parsed) ? (negative ? -parsed : parsed) : null;
  }

  if (hasComma) {
    const tail = text.slice(text.lastIndexOf(",") + 1);
    const looksDecimal = tail.length !== 3;
    if (looksDecimal) {
      const parsed = Number(text.replace(/,/g, "."));
      return Number.isFinite(parsed) ? (negative ? -parsed : parsed) : null;
    }
    const parsed = Number(text.replace(/,/g, ""));
    return Number.isFinite(parsed) ? (negative ? -parsed : parsed) : null;
  }

  if (hasDot) {
    const tail = text.slice(text.lastIndexOf(".") + 1);
    const isThousandGrouped = tail.length === 3 && /^\d{1,3}(\.\d{3})+$/.test(text);
    const parsed = Number(isThousandGrouped ? text.replace(/\./g, "") : text);
    return Number.isFinite(parsed) ? (negative ? -parsed : parsed) : null;
  }

  const parsed = Number(text);
  return Number.isFinite(parsed) ? (negative ? -parsed : parsed) : null;
}

function fromExcelSerial(serial: number): string | null {
  if (serial < 1 || serial > 2_958_465) return null;
  const date = new Date(EXCEL_EPOCH_UTC + Math.floor(serial) * DAY_MS);
  return date.toISOString().slice(0, 10);
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function buildIso(year: number, month: number, day: number): string | null {
  if (year < 1990 || year > 2100) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function parseDate(value: unknown): string | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  if (typeof value === "number") return fromExcelSerial(value);

  const text = toText(value);
  if (!text) return null;

  const compact = text.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) return buildIso(Number(compact[1]), Number(compact[2]), Number(compact[3]));

  const iso = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (iso) return buildIso(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const slash = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (slash) {
    const first = Number(slash[1]);
    const second = Number(slash[2]);
    let year = Number(slash[3]);
    if (year < 100) year += year < 70 ? 2000 : 1900;
    const dayFirst = first > 12 || second <= 12;
    return dayFirst
      ? buildIso(year, second, first)
      : buildIso(year, first, second);
  }

  const monthName = text.toLowerCase().match(/(\d{1,2})[a-z\s-]*([a-z]{3,9})[a-z\s-]*(\d{4})/);
  if (monthName) {
    const month = MONTHS[monthName[2].slice(0, monthName[2].length)];
    if (month !== undefined) return buildIso(Number(monthName[3]), month + 1, Number(monthName[1]));
  }

  const monthFirstName = text.toLowerCase().match(/([a-z]{3,9})[a-z\s-]*(\d{1,2}),?[a-z\s-]*(\d{4})/);
  if (monthFirstName) {
    const month = MONTHS[monthFirstName[1].slice(0, monthFirstName[1].length)];
    if (month !== undefined) return buildIso(Number(monthFirstName[3]), month + 1, Number(monthFirstName[2]));
  }

  const fallback = new Date(text);
  if (!Number.isNaN(fallback.getTime())) {
    return `${fallback.getFullYear()}-${pad(fallback.getMonth() + 1)}-${pad(fallback.getDate())}`;
  }
  return null;
}

const SIZE_TOKEN =
  /[-_/\s]?((?:EU|US|UK)?\s?\d{1,3}(?:[.,]\d)?|XXS|XS|S|M|L|XL|XXL|XXXL|2XL|3XL|4XL|ALL[\s-]?SIZE|ONE[\s-]?SIZE|FREE[\s-]?SIZE|OS)$/i;

export function deriveParentAndSize(sku: string): { parent: string; size: string } {
  const cleaned = sku.trim();
  const match = cleaned.match(SIZE_TOKEN);
  if (!match || match.index === undefined || match.index === 0) {
    return { parent: cleaned.toUpperCase(), size: "" };
  }
  const parent = cleaned.slice(0, match.index).replace(/[-_/\s]+$/, "");
  const size = match[1].trim().toUpperCase().replace(/\s+/g, " ");
  return { parent: parent.toUpperCase(), size: size };
}

const ONLINE_HINTS = [
  "shopee", "tokped", "tokopedia", "tiktok", "lazada", "blibli", "bukalapak",
  "marketplace", "online", "web", "website", "ecommerce", "shop",
];

const OFFLINE_HINTS = [
  "toko", "store", "outlet", "cabang", "gerai", "pos", "offline", "gudang",
  "warehouse", "branch", "mall", "kios",
];

export function detectChannel(store: string, channelRaw: string): ChannelKind {
  const explicit = normalizeText(channelRaw);
  if (explicit) {
    if (ONLINE_HINTS.some((hint) => explicit.includes(hint))) return "ONLINE";
    if (OFFLINE_HINTS.some((hint) => explicit.includes(hint))) return "OFFLINE";
  }
  const haystack = normalizeText(store);
  if (ONLINE_HINTS.some((hint) => haystack.includes(hint))) return "ONLINE";
  return "OFFLINE";
}

export function looksNumericOnly(value: unknown): boolean {
  if (typeof value === "number") return true;
  const text = toText(value);
  return text.length > 0 && /^\d+([.,]\d+)?$/.test(text);
}
