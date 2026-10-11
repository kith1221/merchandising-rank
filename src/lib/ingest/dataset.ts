import type { Dataset, ImportIssue, Sale, StockRecord } from "../types";
import { detectChannel, deriveParentAndSize, normalizeHeader, parseDate, parseNumber, slugSkuPart, toText } from "../parse-utils";
import type { ColumnMapping } from "./schema";
import { CANONICAL_FIELDS, autoMapColumns } from "./schema";
import type { Row } from "./tabular";

const MAX_ISSUES = 60;

const STOCK_QTY_HINTS = ["stok", "stock", "onhand", "onhandstok", "qtystok", "stokakhir", "qty", "jumlah", "availableqty", "remainingqty"];

const STOCK_STORE_HINTS = ["toko", "store", "outlet", "cabang", "gudang", "warehouse", "lokasi", "location", "gerai", "branch"];

const STOCK_SKU_HINTS = ["sku", "skucode", "barcode", "childsku", "kodesku", "itemcode", "productcode", "kodebarang", "kodeproduk"];

const STOCK_SAFETY_HINTS = ["safetystock", "safety", "cadangan", "stokamin", "stokminimal", "minstock", "buffer"];

const STOCK_REORDER_HINTS = ["reorderpoint", "titikreorder", "titikpesan", "rop", "reorderqty", "reorder"];

function cell(row: Row, index: number): unknown {
  if (index < 0 || index >= row.length) return null;
  const value = row[index];
  return value === undefined ? null : value;
}

function collapse(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function tidySku(value: string): string {
  return collapse(value).toUpperCase();
}

export interface BuildResult<T> {
  rows: T[];
  issues: ImportIssue[];
  totalRows: number;
  validRows: number;
  skipped: number;
  synthesizedSku: number;
  hasSkuColumn: boolean;
}

function synthesizeSku(parent: string, size: string): string {
  const parentPart = slugSkuPart(parent);
  const sizePart = slugSkuPart(size);
  if (!parentPart) return "";
  return sizePart ? `${parentPart}-${sizePart}` : parentPart;
}

export function buildSales(
  rows: Row[],
  mapping: ColumnMapping,
  headerIndex: number,
): BuildResult<Sale> {
  const sales: Sale[] = [];
  const issues: ImportIssue[] = [];
  let totalRows = 0;
  let skipped = 0;
  let synthesizedSku = 0;
  let synthesisWarned = false;

  const hasRevenue = mapping.revenue >= 0;
  const hasUnitPrice = mapping.unitPrice >= 0;
  const hasSkuColumn = mapping.sku >= 0;

  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const row = rows[index];
    const rowNumber = index + 1;

    const isEmpty = row.every((value) => toText(value) === "");
    if (isEmpty) continue;
    totalRows += 1;

    const date = parseDate(cell(row, mapping.date));
    if (!date) {
      skipped += 1;
      if (issues.length < MAX_ISSUES) {
        issues.push({ row: rowNumber, message: `Tanggal tidak terbaca: "${toText(cell(row, mapping.date))}"` });
      }
      continue;
    }

    const qty = parseNumber(cell(row, mapping.qty));
    if (qty === null) {
      skipped += 1;
      if (issues.length < MAX_ISSUES) {
        issues.push({ row: rowNumber, message: `Qty tidak terbaca: "${toText(cell(row, mapping.qty))}"` });
      }
      continue;
    }
    if (qty <= 0) {
      skipped += 1;
      if (issues.length < MAX_ISSUES) {
        issues.push({ row: rowNumber, message: `Qty bukan angka positif (${qty}) - baris dilewati` });
      }
      continue;
    }

    const skuRaw = mapping.sku >= 0 ? toText(cell(row, mapping.sku)) : "";
    const parentRaw = mapping.parentSku >= 0 ? toText(cell(row, mapping.parentSku)) : "";
    const sizeRaw = toText(cell(row, mapping.size)).toUpperCase();

    let sku = tidySku(skuRaw);
    if (!sku) {
      sku = synthesizeSku(parentRaw, sizeRaw);
      if (sku) {
        synthesizedSku += 1;
        if (!synthesisWarned) {
          synthesisWarned = true;
          issues.push({
            row: rowNumber,
            message: `Tidak ada kolom Child SKU. SKU dibuat dari Parent + Size, contoh "${sku}". Tambahkan kolom SKU/Item Code agar cocok dengan sheet stok.`,
          });
        }
      }
    }

    const identity = sku || tidySku(parentRaw);
    if (!identity) {
      skipped += 1;
      if (issues.length < MAX_ISSUES) {
        issues.push({ row: rowNumber, message: "SKU kosong" });
      }
      continue;
    }

    const derived = deriveParentAndSize(sku);
    const size = sizeRaw || derived.size || "ONE SIZE";
    const parentSku = tidySku(parentRaw || derived.parent);
    const store = collapse(toText(cell(row, mapping.store))) || "Umum";
    const channel = detectChannel(store, toText(cell(row, mapping.channel)));

    let unitPrice = hasUnitPrice ? parseNumber(cell(row, mapping.unitPrice)) : null;
    let revenue = hasRevenue ? parseNumber(cell(row, mapping.revenue)) : null;

    if (unitPrice === null && revenue !== null) unitPrice = qty > 0 ? revenue / qty : 0;
    if (revenue === null && unitPrice !== null) revenue = unitPrice * qty;
    if (unitPrice === null) unitPrice = 0;
    if (revenue === null) revenue = 0;

    sales.push({
      date,
      store,
      channel,
      parentSku,
      sku,
      size,
      qty: Math.round(qty),
      unitPrice: Math.round(unitPrice),
      revenue: Math.round(revenue),
    });
  }

  return { rows: sales, issues, totalRows, validRows: sales.length, skipped, synthesizedSku, hasSkuColumn };
}

export function autoMapStockColumns(headers: unknown[]): ColumnMapping {
  const mapping = autoMapColumns(headers);
  const normalized = headers.map(normalizeHeader);
  const taken = new Set(CANONICAL_FIELDS.filter((field) => mapping[field] >= 0).map((field) => mapping[field]));

  const pick = (hints: string[]): number => {
    let best = -1;
    let bestLength = 0;
    hints.forEach((hint) => {
      normalized.forEach((column, index) => {
        if (!column || taken.has(index)) return;
        if (column === hint || column.includes(hint)) {
          const length = column === hint ? hint.length + 10 : hint.length;
          if (length > bestLength) {
            bestLength = length;
            best = index;
          }
        }
      });
    });
    if (best >= 0) taken.add(best);
    return best;
  };

  if (mapping.sku < 0) mapping.sku = pick(STOCK_SKU_HINTS);
  if (mapping.store < 0) mapping.store = pick(STOCK_STORE_HINTS);
  if (mapping.safetyStock < 0) mapping.safetyStock = pick(STOCK_SAFETY_HINTS);
  if (mapping.reorderPoint < 0) mapping.reorderPoint = pick(STOCK_REORDER_HINTS);
  if (mapping.qty < 0) mapping.qty = pick(STOCK_QTY_HINTS);

  return mapping;
}

export function buildStock(
  rows: Row[],
  mapping: ColumnMapping,
  headerIndex: number,
): BuildResult<StockRecord> {
  const stock: StockRecord[] = [];
  const issues: ImportIssue[] = [];
  let totalRows = 0;
  let skipped = 0;
  let synthesizedSku = 0;
  let synthesisWarned = false;
  const hasSkuColumn = mapping.sku >= 0;

  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const row = rows[index];
    const rowNumber = index + 1;
    if (row.every((value) => toText(value) === "")) continue;
    totalRows += 1;

    let sku = tidySku(toText(cell(row, mapping.sku)));
    if (!sku) {
      const parent = toText(cell(row, mapping.parentSku));
      const size = mapping.size >= 0 ? toText(cell(row, mapping.size)) : "";
      sku = synthesizeSku(parent, size);
      if (sku) {
        synthesizedSku += 1;
        if (!synthesisWarned) {
          synthesisWarned = true;
          issues.push({
            row: rowNumber,
            message: `Sheet stok tidak punya kolom SKU. SKU dibuat dari Product Name + Size, contoh "${sku}".`,
          });
        }
      }
    }

    const qty = parseNumber(cell(row, mapping.qty));
    const safetyStock = mapping.safetyStock >= 0 ? parseNumber(cell(row, mapping.safetyStock)) : null;
    const reorderPoint = mapping.reorderPoint >= 0 ? parseNumber(cell(row, mapping.reorderPoint)) : null;

    if (!sku || qty === null) {
      skipped += 1;
      if (issues.length < MAX_ISSUES) {
        issues.push({ row: rowNumber, message: `Stok tidak terbaca (SKU="${sku}", qty="${toText(cell(row, mapping.qty))}")` });
      }
      continue;
    }

    const record: StockRecord = {
      sku,
      store: collapse(toText(cell(row, mapping.store))) || "Umum",
      qty: Math.round(qty),
    };
    if (safetyStock !== null && safetyStock >= 0) record.safetyStock = Math.round(safetyStock);
    if (reorderPoint !== null && reorderPoint >= 0) record.reorderPoint = Math.round(reorderPoint);
    stock.push(record);
  }

  return { rows: stock, issues, totalRows, validRows: stock.length, skipped, synthesizedSku, hasSkuColumn };
}

export function summarizeRange(sales: Sale[]): { minDate: string | null; maxDate: string | null } {
  if (sales.length === 0) return { minDate: null, maxDate: null };
  let min = sales[0].date;
  let max = sales[0].date;
  for (const sale of sales) {
    if (sale.date < min) min = sale.date;
    if (sale.date > max) max = sale.date;
  }
  return { minDate: min, maxDate: max };
}

export function mergeDatasets(base: Dataset, incoming: Dataset): Dataset {
  const sales = [...base.sales, ...incoming.sales];
  const stockByKey = new Map<string, StockRecord>();

  for (const record of [...base.stock, ...incoming.stock]) {
    const key = `${record.sku}|${record.store}`;
    const existing = stockByKey.get(key);
    if (!existing) {
      stockByKey.set(key, record);
      continue;
    }
    const merged: StockRecord = { ...existing, qty: existing.qty + record.qty };
    const safety = [existing.safetyStock, record.safetyStock].filter((value): value is number => typeof value === "number");
    const reorder = [existing.reorderPoint, record.reorderPoint].filter((value): value is number => typeof value === "number");
    if (safety.length > 0) merged.safetyStock = Math.max(...safety);
    if (reorder.length > 0) merged.reorderPoint = Math.max(...reorder);
    stockByKey.set(key, merged);
  }

  const range = summarizeRange(sales);

  return {
    sales,
    stock: [...stockByKey.values()],
    importedAt: incoming.importedAt,
    sources: [...new Set([...base.sources, ...incoming.sources])],
    minDate: range.minDate,
    maxDate: range.maxDate,
  };
}
