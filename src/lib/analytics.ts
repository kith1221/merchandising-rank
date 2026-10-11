import type { Sale, Settings, StockRecord } from "./types";
import { deriveParentAndSize } from "./parse-utils";
import { daysBetween } from "./format";

const DAY_MS = 86_400_000;

const APPAREL_SIZES = new Set(["XS", "S", "M", "L", "XL", "XXL", "XXXL", "2XL", "3XL", "4XL", "ONE SIZE", "ALL SIZE", "OS", "FREE SIZE"]);

const SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL", "2XL", "3XL", "4XL"];

export interface MonthlyPoint {
  month: string;
  offline: number;
  online: number;
  offlineUnits: number;
  onlineUnits: number;
}

export interface StoreStat {
  store: string;
  channel: Sale["channel"];
  units: number;
  revenue: number;
  share: number;
  lastSale: string;
  onHand: number;
}

export interface ParentStat {
  parent: string;
  units: number;
  revenue: number;
  skus: number;
  avgPrice: number;
  lastSale: string;
  onHand: number;
  apparelLike: boolean;
}

export interface Summary {
  totalUnits: number;
  totalRevenue: number;
  avgUnitPrice: number;
  skuCount: number;
  parentCount: number;
  storeCount: number;
  onlineUnits: number;
  onlineRevenue: number;
  onlineShareUnits: number;
  days: number;
  unitsPerDay: number;
  revenuePerDay: number;
  topParentShare: number;
  monthly: MonthlyPoint[];
  storeStats: StoreStat[];
  parentStats: ParentStat[];
  stockRecords: number;
  hasStock: boolean;
}

function buildSkuParentMap(sales: Sale[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const sale of sales) {
    if (!map.has(sale.sku)) map.set(sale.sku, sale.parentSku || deriveParentAndSize(sale.sku).parent);
  }
  return map;
}

export function stockParent(records: StockRecord[], skuParent: Map<string, string>): Map<string, number> {
  const byParent = new Map<string, number>();
  for (const record of records) {
    const parent = skuParent.get(record.sku) ?? deriveParentAndSize(record.sku).parent;
    byParent.set(parent, (byParent.get(parent) ?? 0) + record.qty);
  }
  return byParent;
}

export interface ParentStockAggregate {
  qty: number;
  safetyStock: number | null;
  reorderPoint: number | null;
}

export function aggregateStockByParent(
  records: StockRecord[],
  skuParent: Map<string, string>,
): Map<string, ParentStockAggregate> {
  const byParent = new Map<string, ParentStockAggregate>();
  for (const record of records) {
    const parent = skuParent.get(record.sku) ?? deriveParentAndSize(record.sku).parent;
    const entry = byParent.get(parent) ?? { qty: 0, safetyStock: null, reorderPoint: null };
    entry.qty += record.qty;
    if (typeof record.safetyStock === "number") entry.safetyStock = (entry.safetyStock ?? 0) + record.safetyStock;
    if (typeof record.reorderPoint === "number") entry.reorderPoint = (entry.reorderPoint ?? 0) + record.reorderPoint;
    byParent.set(parent, entry);
  }
  return byParent;
}

export function stockByStore(records: StockRecord[]): Map<string, number> {
  const byStore = new Map<string, number>();
  for (const record of records) {
    byStore.set(record.store, (byStore.get(record.store) ?? 0) + record.qty);
  }
  return byStore;
}

export function summarize(sales: Sale[], stock: StockRecord[], minDate: string | null, maxDate: string | null): Summary {
  const skuParent = buildSkuParentMap(sales);
  const onHandByParent = stockParent(stock, skuParent);
  const onHandByStore = stockByStore(stock);

  const skus = new Set<string>();
  const stores = new Map<string, { channel: Sale["channel"]; units: number; revenue: number; lastSale: string }>();
  const parents = new Map<string, { units: number; revenue: number; skus: Set<string>; sizes: Set<string>; lastSale: string }>();
  const monthly = new Map<string, MonthlyPoint>();

  let totalUnits = 0;
  let totalRevenue = 0;
  let onlineUnits = 0;
  let onlineRevenue = 0;

  for (const sale of sales) {
    skus.add(sale.sku);
    totalUnits += sale.qty;
    totalRevenue += sale.revenue;
    if (sale.channel === "ONLINE") {
      onlineUnits += sale.qty;
      onlineRevenue += sale.revenue;
    }

    const store = stores.get(sale.store);
    if (store) {
      store.units += sale.qty;
      store.revenue += sale.revenue;
      if (sale.date > store.lastSale) store.lastSale = sale.date;
    } else {
      stores.set(sale.store, { channel: sale.channel, units: sale.qty, revenue: sale.revenue, lastSale: sale.date });
    }

    const parent = parents.get(sale.parentSku);
    if (parent) {
      parent.units += sale.qty;
      parent.revenue += sale.revenue;
      parent.skus.add(sale.sku);
      parent.sizes.add(sale.size);
      if (sale.date > parent.lastSale) parent.lastSale = sale.date;
    } else {
      parents.set(sale.parentSku, {
        units: sale.qty,
        revenue: sale.revenue,
        skus: new Set([sale.sku]),
        sizes: new Set([sale.size]),
        lastSale: sale.date,
      });
    }

    const month = sale.date.slice(0, 7);
    const point = monthly.get(month);
    if (point) {
      if (sale.channel === "ONLINE") {
        point.online += sale.revenue;
        point.onlineUnits += sale.qty;
      } else {
        point.offline += sale.revenue;
        point.offlineUnits += sale.qty;
      }
    } else {
      monthly.set(month, {
        month,
        offline: sale.channel === "ONLINE" ? 0 : sale.revenue,
        online: sale.channel === "ONLINE" ? sale.revenue : 0,
        offlineUnits: sale.channel === "ONLINE" ? 0 : sale.qty,
        onlineUnits: sale.channel === "ONLINE" ? sale.qty : 0,
      });
    }
  }

  const days = daysBetween(minDate, maxDate);
  const parentStats: ParentStat[] = [...parents.entries()]
    .map(([parent, value]) => ({
      parent,
      units: value.units,
      revenue: value.revenue,
      skus: value.skus.size,
      avgPrice: value.units > 0 ? value.revenue / value.units : 0,
      lastSale: value.lastSale,
      onHand: onHandByParent.get(parent) ?? 0,
      apparelLike: isApparelLike([...value.sizes]),
    }))
    .sort((a, b) => b.units - a.units);

  const storeStats: StoreStat[] = [...stores.entries()]
    .map(([store, value]) => ({
      store,
      channel: value.channel,
      units: value.units,
      revenue: value.revenue,
      share: totalUnits > 0 ? value.units / totalUnits : 0,
      lastSale: value.lastSale,
      onHand: onHandByStore.get(store) ?? 0,
    }))
    .sort((a, b) => b.units - a.units);

  return {
    totalUnits,
    totalRevenue,
    avgUnitPrice: totalUnits > 0 ? totalRevenue / totalUnits : 0,
    skuCount: skus.size,
    parentCount: parents.size,
    storeCount: stores.size,
    onlineUnits,
    onlineRevenue,
    onlineShareUnits: totalUnits > 0 ? onlineUnits / totalUnits : 0,
    days,
    unitsPerDay: days > 0 ? totalUnits / days : 0,
    revenuePerDay: days > 0 ? totalRevenue / days : 0,
    topParentShare: totalUnits > 0 && parentStats.length > 0 ? parentStats[0].units / totalUnits : 0,
    monthly: [...monthly.values()].sort((a, b) => a.month.localeCompare(b.month)),
    storeStats,
    parentStats,
    stockRecords: stock.length,
    hasStock: stock.length > 0,
  };
}

export function isApparelLike(sizes: string[]): boolean {
  if (sizes.length === 0) return false;
  const meaningful = sizes.filter((size) => size && size !== "ONE SIZE" && size !== "ALL SIZE");
  if (meaningful.length === 0) return true;
  return meaningful.every((size) => APPAREL_SIZES.has(size));
}

export function sizeSortKey(size: string): number {
  const apparelIndex = SIZE_ORDER.indexOf(size);
  if (apparelIndex >= 0) return 1000 + apparelIndex;
  const numeric = Number(size.replace(/[^0-9.]/g, ""));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 5000;
}

export interface SizePoint {
  size: string;
  units: number;
  revenue: number;
  pct: number;
  sku: string;
}

export function sizeCurveFor(sales: Sale[], parentSku: string): SizePoint[] {
  const units = new Map<string, number>();
  const revenue = new Map<string, number>();
  const skuCount = new Map<string, Map<string, number>>();
  let total = 0;

  for (const sale of sales) {
    if (sale.parentSku !== parentSku) continue;
    units.set(sale.size, (units.get(sale.size) ?? 0) + sale.qty);
    revenue.set(sale.size, (revenue.get(sale.size) ?? 0) + sale.revenue);
    const skus = skuCount.get(sale.size);
    if (skus) skus.set(sale.sku, (skus.get(sale.sku) ?? 0) + sale.qty);
    else skuCount.set(sale.size, new Map([[sale.sku, sale.qty]]));
    total += sale.qty;
  }

  return [...units.entries()]
    .map(([size, value]) => ({
      size,
      units: value,
      revenue: revenue.get(size) ?? 0,
      pct: total > 0 ? (value / total) * 100 : 0,
      sku: dominantSku(skuCount.get(size), size),
    }))
    .sort((a, b) => sizeSortKey(a.size) - sizeSortKey(b.size));
}

function dominantSku(skuCounts: Map<string, number> | undefined, size: string): string {
  if (!skuCounts || skuCounts.size === 0) return size;
  return [...skuCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

export function largestRemainder(total: number, weights: number[]): number[] {
  const sum = weights.reduce((acc, value) => acc + Math.max(0, value), 0);
  if (total <= 0 || sum <= 0) return weights.map(() => 0);

  const raw = weights.map((weight) => (total * Math.max(0, weight)) / sum);
  const base = raw.map((value) => Math.floor(value));
  let remaining = total - base.reduce((acc, value) => acc + value, 0);

  const order = raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction);

  let cursor = 0;
  while (remaining > 0 && order.length > 0) {
    base[order[cursor % order.length].index] += 1;
    remaining -= 1;
    cursor += 1;
  }

  return base;
}

export interface PoRow {
  size: string;
  sku: string;
  sharePct: number;
  idealQty: number;
  orderQty: number;
  units: number;
}

export interface PoPlan {
  rows: PoRow[];
  target: number;
  total: number;
  overshoot: number;
  packSize: number;
  moq: number;
}

export function buildPoPlan(curve: SizePoint[], target: number, packSize: number, moq: number, respectRules: boolean): PoPlan {
  const weights = curve.map((point) => point.units);
  const ideal = largestRemainder(Math.max(0, Math.round(target)), weights);
  const step = packSize <= 1 ? 1 : packSize % 2 === 0 ? packSize : packSize * 2;

  const rows = curve.map((point, index) => {
    let orderQty = ideal[index];
    if (respectRules && orderQty > 0) {
      orderQty = Math.max(moq, Math.ceil(orderQty / step) * step);
    }
    return {
      size: point.size,
      sku: point.sku,
      sharePct: point.pct,
      idealQty: ideal[index],
      orderQty,
      units: point.units,
    };
  });

  const total = rows.reduce((acc, row) => acc + row.orderQty, 0);
  return { rows, target: Math.round(target), total, overshoot: total - Math.round(target), packSize, moq };
}

export interface AllocationRow {
  store: string;
  channel: Sale["channel"];
  units: number;
  revenue: number;
  share: number;
  onHand: number;
  suggested: number;
}

export function allocateByShare(
  sales: Sale[],
  stock: StockRecord[],
  poolQty: number,
  settings: Settings,
  parentSku?: string,
): AllocationRow[] {
  const relevant = parentSku ? sales.filter((sale) => sale.parentSku === parentSku) : sales;
  const basis = settings.allocationBasis === "revenue" ? "revenue" : "units";

  const aggregator = new Map<string, { channel: Sale["channel"]; units: number; revenue: number }>();
  for (const sale of relevant) {
    const entry = aggregator.get(sale.store);
    if (entry) {
      entry.units += sale.qty;
      entry.revenue += sale.revenue;
    } else {
      aggregator.set(sale.store, { channel: sale.channel, units: sale.qty, revenue: sale.revenue });
    }
  }

  const skuParent = buildSkuParentMap(sales);
  const relevantStock = parentSku
    ? stock.filter((record) => (skuParent.get(record.sku) ?? deriveParentAndSize(record.sku).parent) === parentSku)
    : stock;
  const onHand = stockByStore(relevantStock);
  const reservable = Math.round(poolQty * (1 - settings.allocationReservePct / 100));
  const entries = [...aggregator.entries()].sort((a, b) => b[1].units - a[1].units);
  const weights = entries.map(([, value]) => (basis === "revenue" ? value.revenue : value.units));
  const suggested = largestRemainder(reservable, weights);
  const weightSum = weights.reduce((acc, value) => acc + value, 0);

  return entries.map(([store, value], index) => ({
    store,
    channel: value.channel,
    units: value.units,
    revenue: value.revenue,
    share: weightSum > 0 ? weights[index] / weightSum : 0,
    onHand: onHand.get(store) ?? 0,
    suggested: suggested[index],
  }));
}

export interface ProductTrend {
  parent: string;
  /** unit terjual pada jendela terbaru (default 28 hari) */
  units: number;
  /** unit terjual pada jendela sebelumnya (periode pembanding) */
  priorUnits: number;
  /** pertumbuhan unit, dalam persen negatif bila turun */
  growthPct: number;
  /** rata-rata unit per hari pada jendela terbaru */
  avgDaily: number;
  /** jumlah SKU anak yang laku pada jendela terbaru */
  skus: number;
  lastSale: string;
}

/**
 * Menemukan produk yang "sedang trend" (momentum permintaan naik), pendekatan
 * CRM analitik: membandingkan unit terjual pada 28 hari terakhir vs 28 hari
 * sebelumnya. Bila umur data < 56 hari, jendela otomatis menjadi separuh durasi
 * data. Tidak ada jendela yang valid (< 7 hari) => hasil kosong.
 */
export function productTrends(
  sales: Sale[],
  options?: { minRecentUnits?: number; windowDays?: number; limit?: number },
): ProductTrend[] {
  const { minRecentUnits = 3, limit = 12 } = options ?? {};
  const windowDays = options?.windowDays ?? 28;
  if (sales.length === 0) return [];

  let recentStart = 0;
  let maxDate = "";
  let minDate = "";
  for (const sale of sales) {
    if (!minDate || sale.date < minDate) minDate = sale.date;
    if (!maxDate || sale.date > maxDate) maxDate = sale.date;
  }
  const totalDays = daysBetween(minDate, maxDate);
  const actualWindow = Math.min(windowDays, Math.floor(totalDays / 2));
  if (actualWindow < 7) return [];
  recentStart = new Date(`${maxDate}T00:00:00`).getTime() - (actualWindow - 1) * DAY_MS;
  const priorStart = recentStart - actualWindow * DAY_MS;

  const recent = new Map<string, number>();
  const prior = new Map<string, number>();
  const recentSkus = new Map<string, Set<string>>();
  const recentLast = new Map<string, string>();

  for (const sale of sales) {
    const time = new Date(`${sale.date}T00:00:00`).getTime();
    const bucket = time >= recentStart ? recent : time >= priorStart ? prior : null;
    if (!bucket) continue;
    bucket.set(sale.parentSku, (bucket.get(sale.parentSku) ?? 0) + sale.qty);
    if (bucket === recent) {
      if (!recentSkus.has(sale.parentSku)) recentSkus.set(sale.parentSku, new Set<string>());
      recentSkus.get(sale.parentSku)!.add(sale.sku);
      const last = recentLast.get(sale.parentSku);
      if (!last || sale.date > last) recentLast.set(sale.parentSku, sale.date);
    }
  }

  const rows: ProductTrend[] = [];
  for (const [parent, units] of recent) {
    if (units < minRecentUnits) continue;
    const priorUnits = prior.get(parent) ?? 0;
    if (priorUnits > 0 && units <= priorUnits) continue;
    const growthPct = priorUnits > 0 ? ((units - priorUnits) / priorUnits) * 100 : 100;
    rows.push({
      parent,
      units,
      priorUnits,
      growthPct: Math.round(growthPct * 10) / 10,
      avgDaily: Math.round((units / actualWindow) * 10) / 10,
      skus: recentSkus.get(parent)?.size ?? 1,
      lastSale: recentLast.get(parent) ?? "",
    });
  }
  rows.sort((a, b) => b.growthPct - a.growthPct || b.units - a.units);
  return rows.slice(0, limit);
}

export function weekStart(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  const day = date.getUTCDay();
  const diff = (day + 6) % 7;
  date.setUTCDate(date.getUTCDate() - diff);
  return date.toISOString().slice(0, 10);
}

export interface ForecastPoint {
  period: string;
  actual: number | null;
  fitted: number | null;
  forecast: number | null;
  imputed: boolean;
}

export interface ForecastResult {
  points: ForecastPoint[];
  level: number;
  trend: number;
  avgWeekly: number;
  sigmaWeekly: number;
  mape: number | null;
  wape: number | null;
  weeks: number;
  observedWeeks: number;
}

const HOLT_WARMUP = 2;
const MAX_HISTORY_WEEKS = 1040;

export function forecastWeekly(
  sales: Sale[],
  alpha: number,
  beta: number,
  horizon: number,
  parentSku?: string,
): ForecastResult {
  const buckets = new Map<string, number>();
  for (const sale of sales) {
    if (parentSku && sale.parentSku !== parentSku) continue;
    const key = weekStart(sale.date);
    buckets.set(key, (buckets.get(key) ?? 0) + sale.qty);
  }

  const rawPeriods = [...buckets.keys()].sort();
  const periods: string[] = [];
  const values: number[] = [];
  const observedFlags: boolean[] = [];

  for (const period of rawPeriods) {
    if (periods.length > 0) {
      const last = periods[periods.length - 1];
      let cursor = new Date(`${last}T00:00:00Z`).getTime();
      const target = new Date(`${period}T00:00:00Z`).getTime();
      while (cursor + 7 * DAY_MS < target && values.length < MAX_HISTORY_WEEKS) {
        cursor += 7 * DAY_MS;
        periods.push(new Date(cursor).toISOString().slice(0, 10));
        values.push(0);
        observedFlags.push(false);
      }
    }
    periods.push(period);
    values.push(buckets.get(period) ?? 0);
    observedFlags.push(true);
  }

  const observedCount = observedFlags.filter(Boolean).length;

  if (observedCount < 3) {
    const observedValues = values.filter((_, index) => observedFlags[index]);
    const avg = observedValues.length > 0 ? observedValues.reduce((a, b) => a + b, 0) / observedValues.length : 0;
    return {
      points: periods.map((period, index) => ({
        period,
        actual: values[index],
        fitted: null,
        forecast: null,
        imputed: !observedFlags[index],
      })),
      level: avg,
      trend: 0,
      avgWeekly: avg,
      sigmaWeekly: 0,
      mape: null,
      wape: null,
      weeks: periods.length,
      observedWeeks: observedCount,
    };
  }

  let level = values[0];
  let trend = values[1] - values[0];
  const points: ForecastPoint[] = [];
  const errors: number[] = [];
  const residuals: number[] = [];
  let absoluteError = 0;
  let evaluatedActual = 0;

  for (let index = 0; index < values.length; index += 1) {
    const isObserved = observedFlags[index];
    const predicted = index === 0 ? values[0] : index < HOLT_WARMUP ? null : level + trend;
    points.push({ period: periods[index], actual: values[index], fitted: predicted, forecast: null, imputed: !isObserved });

    if (index > 0 && isObserved) {
      const actual = values[index];
      if (index >= HOLT_WARMUP && predicted !== null) {
        const error = actual - predicted;
        residuals.push(error);
        absoluteError += Math.abs(error);
        evaluatedActual += actual;
        if (actual > 0) errors.push(Math.abs(error) / actual);
      }
      const previousLevel = level;
      level = alpha * actual + (1 - alpha) * (level + trend);
      trend = beta * (level - previousLevel) + (1 - beta) * trend;
    }
  }

  const observedValues = values.filter((_, index) => observedFlags[index]);
  const mean = observedValues.reduce((a, b) => a + b, 0) / observedValues.length;
  const variance =
    observedValues.length > 1
      ? observedValues.reduce((acc, value) => acc + (value - mean) ** 2, 0) / (observedValues.length - 1)
      : 0;
  const rawSigma = Math.sqrt(variance);
  const sigma =
    residuals.length >= 3 ? Math.sqrt(residuals.reduce((acc, value) => acc + value * value, 0) / (residuals.length - 1)) : rawSigma;

  let cursorDate = new Date(`${periods[periods.length - 1]}T00:00:00Z`);
  for (let step = 1; step <= horizon; step += 1) {
    cursorDate = new Date(cursorDate.getTime() + 7 * DAY_MS);
    points.push({
      period: cursorDate.toISOString().slice(0, 10),
      actual: null,
      fitted: null,
      forecast: Math.max(0, level + step * trend),
      imputed: false,
    });
  }

  return {
    points,
    level,
    trend,
    avgWeekly: mean,
    sigmaWeekly: sigma,
    mape: errors.length > 0 ? (errors.reduce((a, b) => a + b, 0) / errors.length) * 100 : null,
    wape: evaluatedActual > 0 ? (absoluteError / evaluatedActual) * 100 : null,
    weeks: periods.length,
    observedWeeks: observedCount,
  };
}

export interface ReorderRow {
  parent: string;
  unitsSold: number;
  days: number;
  avgDaily: number;
  leadTimeDays: number;
  leadTimeDemand: number;
  safetyStock: number;
  reorderPoint: number;
  reorderPointSource: "FILE" | "CALCULATED";
  onHand: number;
  weeksCover: number;
  suggestedOrder: number;
  status: "UNDERSTOCK" | "HEALTHY" | "OVERSTOCK";
}

export function reorderPlan(sales: Sale[], stock: StockRecord[], settings: Settings, minDate: string | null, maxDate: string | null): ReorderRow[] {
  const skuParent = buildSkuParentMap(sales);
  const stockAgg = aggregateStockByParent(stock, skuParent);
  const days = Math.max(1, daysBetween(minDate, maxDate));
  const leadTimeWeeks = settings.leadTimeDays / 7;

  const parentRows = new Map<string, { units: number; revenue: number }>();
  for (const sale of sales) {
    const entry = parentRows.get(sale.parentSku);
    if (entry) {
      entry.units += sale.qty;
      entry.revenue += sale.revenue;
    } else {
      parentRows.set(sale.parentSku, { units: sale.qty, revenue: sale.revenue });
    }
  }

  return [...parentRows.entries()]
    .map(([parent, value]) => {
      const result = forecastWeekly(
        sales.filter((sale) => sale.parentSku === parent),
        settings.forecastAlpha,
        settings.forecastBeta,
        0,
      );
      const avgDaily = value.units / days;
      const leadTimeDemand = avgDaily * settings.leadTimeDays;
      const computedSafetyStock = settings.serviceLevelZ * result.sigmaWeekly * Math.sqrt(leadTimeWeeks);
      const agg = stockAgg.get(parent);

      const safetyStock = agg?.safetyStock ?? Math.round(computedSafetyStock);
      const reorderPointSource: ReorderRow["reorderPointSource"] = agg?.reorderPoint === null || agg === undefined ? "CALCULATED" : "FILE";
      const reorderPoint = agg?.reorderPoint ?? Math.ceil(leadTimeDemand + safetyStock);
      const onHand = agg?.qty ?? 0;
      const weeksCover = avgDaily > 0 ? onHand / (avgDaily * 7) : onHand > 0 ? 99 : 0;
      const suggestedOrder =
        reorderPointSource === "FILE"
          ? Math.max(0, Math.ceil(reorderPoint + safetyStock - onHand))
          : Math.max(0, Math.ceil(leadTimeDemand + safetyStock - onHand));
      const status: ReorderRow["status"] = onHand <= reorderPoint ? "UNDERSTOCK" : weeksCover > 26 ? "OVERSTOCK" : "HEALTHY";
      return {
        parent,
        unitsSold: value.units,
        days,
        avgDaily,
        leadTimeDays: settings.leadTimeDays,
        leadTimeDemand,
        safetyStock,
        reorderPoint,
        reorderPointSource,
        onHand,
        weeksCover,
        suggestedOrder,
        status,
      };
    })
    .sort((a, b) => b.suggestedOrder - a.suggestedOrder);
}

export interface MarkdownRow {
  parent: string;
  unitsSold: number;
  onHand: number;
  avgDaily: number;
  weeksCover: number;
  sellThrough: number;
  lastSale: string;
  daysSinceLastSale: number;
  discount: number;
  currentPrice: number;
  newPrice: number;
  valueAtRisk: number;
  basis: "STOCK" | "SALES_ONLY";
}

export function markdownPlan(
  sales: Sale[],
  stock: StockRecord[],
  settings: Settings,
  minDate: string | null,
  maxDate: string | null,
): MarkdownRow[] {
  const skuParent = buildSkuParentMap(sales);
  const onHandByParent = stockParent(stock, skuParent);
  const days = Math.max(1, daysBetween(minDate, maxDate));
  const hasStock = stock.length > 0;

  const parents = new Map<string, { units: number; revenue: number; lastSale: string }>();
  for (const sale of sales) {
    const entry = parents.get(sale.parentSku);
    if (entry) {
      entry.units += sale.qty;
      entry.revenue += sale.revenue;
      if (sale.date > entry.lastSale) entry.lastSale = sale.date;
    } else {
      parents.set(sale.parentSku, { units: sale.qty, revenue: sale.revenue, lastSale: sale.date });
    }
  }

  return [...parents.entries()]
    .map(([parent, value]): MarkdownRow => {
      const onHand = onHandByParent.get(parent) ?? 0;
      const avgDaily = value.units / days;
      const currentPrice = value.units > 0 ? value.revenue / value.units : 0;
      const weeksCover = avgDaily > 0 ? onHand / (avgDaily * 7) : onHand > 0 ? 99 : 0;
      const sellThrough = value.units + onHand > 0 ? value.units / (value.units + onHand) : 1;
      const daysSinceLastSale = Math.round(
        (new Date(`${maxDate ?? value.lastSale}T00:00:00Z`).getTime() - new Date(`${value.lastSale}T00:00:00Z`).getTime()) / DAY_MS,
      );
      const discount = resolveDiscount(settings, weeksCover, daysSinceLastSale, hasStock);
      return {
        parent,
        unitsSold: value.units,
        onHand,
        avgDaily,
        weeksCover: hasStock ? weeksCover : daysSinceLastSale / 7,
        sellThrough,
        lastSale: value.lastSale,
        daysSinceLastSale,
        discount,
        currentPrice,
        newPrice: currentPrice * (1 - discount / 100),
        valueAtRisk: onHand * currentPrice,
        basis: hasStock ? "STOCK" : "SALES_ONLY",
      };
    })
    .filter((row) => row.discount > 0)
    .sort((a, b) => b.valueAtRisk - a.valueAtRisk || b.weeksCover - a.weeksCover);
}

function resolveDiscount(settings: Settings, weeksCover: number, daysSinceLastSale: number, hasStock: boolean): number {
  const ladder = settings.markdownLadder.filter((tier) => tier.discount > 0).sort((a, b) => a.minWeeksCover - b.minWeeksCover);
  const maxDiscount = ladder[0]?.discount ?? 40;
  const midDiscount = ladder[Math.floor(ladder.length / 2)]?.discount ?? 20;
  const minDiscount = ladder[ladder.length - 1]?.discount ?? 10;

  if (!hasStock) {
    if (daysSinceLastSale >= 90) return maxDiscount;
    if (daysSinceLastSale >= 45) return midDiscount;
    if (daysSinceLastSale >= 21) return minDiscount;
    return 0;
  }

  if (weeksCover <= 0) return daysSinceLastSale < 45 ? 0 : maxDiscount;
  const tier = settings.markdownLadder.find((item) => weeksCover >= item.minWeeksCover);
  return tier ? tier.discount : 0;
}

export interface AffinityRow {
  anchor: string;
  partner: string;
  cooccur: number;
  support: number;
  confidence: number;
  lift: number;
}

export function productAffinity(sales: Sale[], limit = 20): AffinityRow[] {
  const buckets = new Map<string, Set<string>>();
  const apparelParents = new Set<string>();
  const parentSizes = new Map<string, Set<string>>();

  for (const sale of sales) {
    const key = `${sale.store}|${sale.date.slice(0, 7)}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.add(sale.parentSku);
    else buckets.set(key, new Set([sale.parentSku]));

    const sizes = parentSizes.get(sale.parentSku);
    if (sizes) sizes.add(sale.size);
    else parentSizes.set(sale.parentSku, new Set([sale.size]));
  }

  for (const [parent, sizes] of parentSizes) {
    if (isApparelLike([...sizes])) apparelParents.add(parent);
  }

  const cooccur = new Map<string, number>();
  for (const bucket of buckets.values()) {
    const parents = [...bucket];
    if (parents.length < 2 || parents.length > 40) continue;
    for (let i = 0; i < parents.length; i += 1) {
      for (let j = i + 1; j < parents.length; j += 1) {
        const apparel = apparelParents.has(parents[i]) ? parents[i] : apparelParents.has(parents[j]) ? parents[j] : null;
        const other = parents[i] === apparel ? parents[j] : parents[i];
        if (!apparel || !other) continue;
        const key = `${apparel}||${other}`;
        cooccur.set(key, (cooccur.get(key) ?? 0) + 1);
      }
    }
  }

  const usableBuckets = [...buckets.values()].filter((bucket) => bucket.size > 1 && bucket.size <= 40);
  const totalBuckets = Math.max(1, usableBuckets.length);
  const presence = new Map<string, number>();
  for (const bucket of usableBuckets) {
    for (const parent of bucket) presence.set(parent, (presence.get(parent) ?? 0) + 1);
  }

  const rows: AffinityRow[] = [];
  for (const [key, count] of cooccur) {
    const [apparel, other] = key.split("||");
    const anchorBuckets = presence.get(apparel) ?? count;
    const partnerBuckets = presence.get(other) ?? count;
    const support = count / totalBuckets;
    const confidence = count / Math.max(1, anchorBuckets);
    const partnerRate = partnerBuckets / totalBuckets;
    const lift = partnerRate > 0 ? confidence / partnerRate : 0;
    rows.push({ anchor: apparel, partner: other, cooccur: count, support, confidence, lift });
  }

  const bestPerAnchor = new Map<string, AffinityRow>();
  for (const row of rows) {
    const current = bestPerAnchor.get(row.anchor);
    if (!current || row.lift > current.lift || (row.lift === current.lift && row.cooccur > current.cooccur)) {
      bestPerAnchor.set(row.anchor, row);
    }
  }

  return [...bestPerAnchor.values()]
    .sort((a, b) => b.lift - a.lift || b.cooccur - a.cooccur)
    .slice(0, limit);
}
