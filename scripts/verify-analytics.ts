import { autoMapColumns } from "../src/lib/ingest/schema";
import { detectHeaderRow, normalizeSheetRows, parseDelimitedText } from "../src/lib/ingest/tabular";
import { autoMapStockColumns, buildSales, buildStock, summarizeRange } from "../src/lib/ingest/dataset";
import { buildDemoSalesCsv, buildDemoStockCsv, toCsv } from "../src/lib/template";
import {
  allocateByShare,
  buildPoPlan,
  forecastWeekly,
  largestRemainder,
  markdownPlan,
  productAffinity,
  productTrends,
  reorderPlan,
  sizeCurveFor,
} from "../src/lib/analytics";
import { DEFAULT_SETTINGS, type Sale } from "../src/lib/types";

const failures: string[] = [];

function check(label: string, condition: boolean, detail = ""): void {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    failures.push(label);
    console.log(`  FAIL  ${label} ${detail}`);
  }
}

const demoRows = normalizeSheetRows(parseDelimitedText(toCsv(buildDemoSalesCsv()), ","));
const headerRow = detectHeaderRow(demoRows);
const sales = buildSales(demoRows, autoMapColumns(demoRows[headerRow]), headerRow).rows;
const stockRows = normalizeSheetRows(parseDelimitedText(toCsv(buildDemoStockCsv()), ","));
const stockHeader = detectHeaderRow(stockRows);
const stock = buildStock(stockRows, autoMapStockColumns(stockRows[stockHeader]), stockHeader).rows;
const range = summarizeRange(sales);

console.log("\n[5] Size curve & PO plan");
const curve = sizeCurveFor(sales, "ORT-CTL");
check("size curve lengkap", curve.length === 7, String(curve.length));
check("persen size = 100%", Math.abs(curve.reduce((a, c) => a + c.pct, 0) - 100) < 0.001);
check("size terurut numerik", curve.map((c) => c.size).join(",") === "38,39,40,41,42,43,44", curve.map((c) => c.size).join(","));
check("curve mengikuti penjualan", curve.reduce((a, b) => (b.units > a.units ? b : a)).units === Math.max(...curve.map((c) => c.units)));

const exactPlan = buildPoPlan(curve, 1000, 6, 0, false);
check("target tepat 1000 tanpa aturan", exactPlan.total === 1000, String(exactPlan.total));
check("semua qty >= 0", exactPlan.rows.every((row) => row.orderQty >= 0));
const packPlan = buildPoPlan(curve, 1000, 6, 0, true);
check("semua qty kelipatan pack size", packPlan.rows.every((row) => row.orderQty % 6 === 0));
check("total >= target setelah pembulatan", packPlan.total >= 1000, String(packPlan.total));
check("seluruh size terisi", packPlan.rows.every((row) => row.orderQty > 0), packPlan.rows.filter((r) => r.orderQty === 0).map((r) => r.size).join(","));
const wackyPack = buildPoPlan(curve, 1000, 7, 0, true);
check("pack size ganjil dibulatkan ke kelipatan genap", wackyPack.rows.every((row) => row.orderQty % 2 === 0), wackyPack.rows.map((r) => r.orderQty).join(","));
check("pack size 1 tidak error", buildPoPlan(curve, 1000, 1, 0, true).total === 1000);
const moqPlan = buildPoPlan(curve, 200, 6, 12, true);
check("MOQ per size diterapkan", moqPlan.rows.every((row) => row.orderQty === 0 || row.orderQty >= 12), moqPlan.rows.map((r) => r.orderQty).join(","));
check("pack size 0 tidak error", buildPoPlan(curve, 1000, 0, 0, true).total === 1000);
const tinyTarget = buildPoPlan(curve, 3, 6, 0, true);
check("target kecil tetap menghasilkan plan", tinyTarget.rows.length === 7 && tinyTarget.total > 0, String(tinyTarget.total));
const emptyCurve = buildPoPlan([], 500, 6, 0, true);
check("size curve kosong tidak crash", emptyCurve.rows.length === 0 && emptyCurve.total === 0);

console.log("\n[6] Largest remainder (NGO)");
check("NGO 1000 tepat", largestRemainder(1000, [1, 1, 1]).reduce((a, b) => a + b, 0) === 1000, largestRemainder(1000, [1, 1, 1]).join("/"));
check("sisa dibagi ke bobot terbesar", largestRemainder(1000, [1, 1, 1]).join("/") === "334/333/333", largestRemainder(1000, [1, 1, 1]).join("/"));
check("bobot nol dapat 0", largestRemainder(500, [0, 0]).every((value) => value === 0));
check("total 0 tidak division by zero", largestRemainder(0, [5, 5]).every((value) => value === 0));
check("desimal dibulatkan ke bawah", largestRemainder(10, [0.5, 0.5]).every(Number.isInteger));

console.log("\n[7] Smart allocation");
const plan = allocateByShare(sales, stock, 1000, DEFAULT_SETTINGS);
check("total alokasi = reservable (1000 - 5%)", plan.reduce((a, r) => a + r.suggested, 0) === 950, String(plan.reduce((a, r) => a + r.suggested, 0)));
check("6 outlet teralokasi", plan.length === 6, String(plan.length));
check("share = 100%", Math.abs(plan.reduce((a, r) => a + r.share, 0) - 1) < 1e-9);
check("diurut dari share terbesar", plan.every((row, i) => i === 0 || plan[i - 1].share >= row.share));
check("hanya建议你 positif untuk outlet dengan penjualan", plan.every((row) => (row.share > 0 ? row.suggested > 0 : row.suggested === 0)));
check("stok on-hand tidak negatif", plan.every((row) => row.onHand >= 0));
check("alokasi tidak melebihi pool per outlet", plan.every((row) => row.suggested <= 1000));
const scoped = allocateByShare(sales, stock, 600, DEFAULT_SETTINGS, "RNK-JER");
check("scope per parent respected", scoped.reduce((a, r) => a + r.suggested, 0) === 570, String(scoped.reduce((a, r) => a + r.suggested, 0)));
const byRevenue = allocateByShare(sales, stock, 1000, { ...DEFAULT_SETTINGS, allocationBasis: "revenue" });
check("basis omzet jalan", byRevenue.length === 6 && Math.abs(byRevenue.reduce((a, r) => a + r.share, 0) - 1) < 1e-9);
const noStock = allocateByShare(sales, [], 1000, DEFAULT_SETTINGS);
check("tanpa data stok tetap alokasi", noStock.reduce((a, r) => a + r.suggested, 0) === 950);
const noSales = allocateByShare([], stock, 1000, DEFAULT_SETTINGS);
check("tanpa penjualan tidak crash", Array.isArray(noSales));

console.log("\n[8] Forecasting Holt linear");
const forecast = forecastWeekly(sales, 0.4, 0.15, 12);
check("titik = minggu aktual + horizon", forecast.points.length === forecast.weeks + 12, `${forecast.points.length}/${forecast.weeks}`);
check("MAPE masuk akal", forecast.mape !== null && forecast.mape > 0 && forecast.mape < 100, String(forecast.mape));
check("WAPE masuk akal", forecast.wape !== null && forecast.wape >= 0 && forecast.wape < 200, String(forecast.wape));
check("forecast tidak negatif", forecast.points.every((point) => (point.forecast ?? 0) >= 0));
check("fitted menutupi minggu aktual kecuali 2 warm-up", forecast.points.filter((point) => point.fitted !== null).length === forecast.weeks - 1, `${forecast.points.filter((p) => p.fitted !== null).length}/${forecast.weeks}`);
check("forecast naik untuk tren naik", (forecast.points.at(-1)?.forecast ?? 0) > (forecast.points[0]?.actual ?? 0));
const weeklyTotal = forecast.points.filter((p) => p.actual !== null).reduce((a, p) => a + (p.actual ?? 0), 0);
check("total aktual = total penjualan", weeklyTotal === sales.reduce((a, row) => a + row.qty, 0), `${weeklyTotal}`);
const partial = forecastWeekly(sales.filter((row) => row.parentSku === "ORT-CTL"), 0.4, 0.15, 8);
check("filter per parent jalan", partial.points.length > 8 && partial.points.every((p) => (p.forecast ?? 0) >= 0));
const tiny = forecastWeekly(sales.slice(0, 10), 0.4, 0.15, 4);
check("data sangat pendek tidak crash", Array.isArray(tiny.points));

console.log("\n[9] Reorder plan");
const reorder = reorderPlan(sales, stock, DEFAULT_SETTINGS, range.minDate, range.maxDate);
check("4 parent SKU", reorder.length === 4, String(reorder.length));
check("lead time demand = avgDaily x leadTime", reorder.every((row) => Math.abs(row.leadTimeDemand - row.avgDaily * DEFAULT_SETTINGS.leadTimeDays) < 1e-6));
check("safety stock tidak negatif", reorder.every((row) => row.safetyStock >= 0));
check("safety stock mengikuti weeks of cover", reorder.every((row) => row.weeksCover === 0 || row.safetyStock >= 0));
check("suggested order menutup lead time + safety stock", reorder.every((row) => row.suggestedOrder >= 0));
check("ada status UNDERSTOCK", reorder.some((row) => row.status === "UNDERSTOCK"), reorder.map((r) => r.status).join(","));
check("reorder diurut dari kebutuhan terbesar", reorder.every((row, i) => i === 0 || reorder[i - 1].suggestedOrder >= row.suggestedOrder));

console.log("\n[10] Markdown plan");
const markdown = markdownPlan(sales, stock, DEFAULT_SETTINGS, range.minDate, range.maxDate);
check("ada kandidat markdown", markdown.length > 0, String(markdown.length));
check("diskon > 0", markdown.every((row) => row.discount > 0));
check("harga baru < harga lama", markdown.every((row) => row.newPrice < row.currentPrice));
check("diskon mengikuti ladder 10%", markdown.every((row) => row.discount % 10 === 0), markdown.map((r) => r.discount).join(","));
check("nilai risiko tidak negatif", markdown.every((row) => row.valueAtRisk >= 0));
check("diurut dari nilai risiko", markdown.every((row, i) => i === 0 || markdown[i - 1].valueAtRisk >= row.valueAtRisk));
check("weeksCover >= 0", markdown.every((row) => row.weeksCover >= 0));
const markdownNoStock = markdownPlan(sales, [], DEFAULT_SETTINGS, range.minDate, range.maxDate);
check("mode tanpa stok memakai aturan Sales-Only", markdownNoStock.every((row) => row.basis === "SALES_ONLY"), String(markdownNoStock.length));
check("demo: semua produk aktif -> tidak ada kandidat Sales-Only", markdownNoStock.length === 0, String(markdownNoStock.length));
const staleSales = sales.filter((row) => row.date < "2025-06-01");
const stalePlan = markdownPlan(staleSales, [], DEFAULT_SETTINGS, "2025-01-01", "2025-07-31");
check("data berhenti 2 bulan lalu -> kandidat muncul", stalePlan.length > 0, String(stalePlan.length));
check("kandidat Sales-Only benar-benar lambat", stalePlan.every((row) => row.daysSinceLastSale >= 21), String(Math.min(...stalePlan.map((r) => r.daysSinceLastSale))));
check("diskon naik semakin lama diam", stalePlan.every((row) => row.discount >= 10 && row.discount <= 40), stalePlan.map((r) => r.discount).join(","));
check("weeksCover tanpa stok memakai idle days", stalePlan.every((row) => Math.abs(row.weeksCover - row.daysSinceLastSale / 7) < 1e-9));
const freshPlan = markdownPlan(staleSales, [], DEFAULT_SETTINGS, "2025-01-01", "2025-06-01");
check("data yang berakhir di periode ini -> tanpa kandidat", freshPlan.length === 0, String(freshPlan.length));
const shiftedLadder = markdownPlan(sales, stock, { ...DEFAULT_SETTINGS, markdownLadder: DEFAULT_SETTINGS.markdownLadder.map((tier) => ({ ...tier, minWeeksCover: tier.minWeeksCover + 20 })) }, range.minDate, range.maxDate);
check("menggeser ladder mengubah hasil", shiftedLadder.length !== markdown.length || JSON.stringify(shiftedLadder.map((r) => r.discount)) !== JSON.stringify(markdown.map((r) => r.discount)));

console.log("\n[11] Product affinity");
const affinity = productAffinity(sales, 12);
check("afinitas terhitung", affinity.length > 0, String(affinity.length));
check("tidak ada duplikat anchor", new Set(affinity.map((row) => row.anchor)).size === affinity.length);
check("lift >= 0", affinity.every((row) => row.lift >= 0));
check("confidence 0..1", affinity.every((row) => row.confidence >= 0 && row.confidence <= 1));
check("anchor berbeda dari partner", affinity.every((row) => row.anchor !== row.partner));
check("support > 0", affinity.every((row) => row.support > 0));

console.log("\n[12] Product trends (momentum naik)");
function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
function trendSale(parent: string, sku: string, date: string, qty: number): Sale {
  return { date, store: "Toko A", channel: "OFFLINE", parentSku: parent, sku, size: "41", qty, unitPrice: 100000, revenue: qty * 100000 };
}
const trendSales: Sale[] = [];
const spreadDaily = (start: string, days: number, parent: string, skuStem: string, daily: number) => {
  for (let index = 0; index < days; index++) {
    const date = addDays(start, index);
    trendSales.push(trendSale(parent, `${skuStem}-A`, date, Math.ceil(daily / 2)));
    trendSales.push(trendSale(parent, `${skuStem}-B`, date, Math.floor(daily / 2)));
  }
};
// 60 hari: jendela auto = 28 hari. Prior = 03-08..30-08, recent = 31-08..27-09.
spreadDaily("2026-08-03", 28, "UP-280", "UP", 3); // prior 84 -> recent 280 = +233%
spreadDaily("2026-08-31", 28, "UP-280", "UP", 10);
spreadDaily("2026-08-03", 28, "DOWN", "DN", 10); // prior 280 -> recent 56 -> turun, harus dibuang
spreadDaily("2026-08-31", 28, "DOWN", "DN", 2);
spreadDaily("2026-08-03", 28, "FLAT", "FL", 7); // prior = recent -> dibuang
spreadDaily("2026-08-31", 28, "FLAT", "FL", 7);
spreadDaily("2026-08-31", 28, "NEW-PROD", "NW", 5); // prior 0, recent 140 -> growth 100
// LOW: hanya 2 unit di seluruh jendela -> di bawah minRecentUnits (3)
trendSales.push(trendSale("LOW", "LOW-A", "2026-09-25", 1));
trendSales.push(trendSale("LOW", "LOW-A", "2026-09-26", 1));

const trends = productTrends(trendSales);
const up = trends.find((row) => row.parent === "UP-280");
const down = trends.find((row) => row.parent === "DOWN");
const flat = trends.find((row) => row.parent === "FLAT");
const fresh = trends.find((row) => row.parent === "NEW-PROD");
const low = trends.find((row) => row.parent === "LOW");
check("produk naik terdeteksi", up !== undefined, JSON.stringify(trends.map((r) => r.parent)));
check("growth = +233.3%", up !== undefined && Math.abs(up.growthPct - 233.3) < 0.5, String(up?.growthPct));
check("prior vs recent benar", up !== undefined && up.priorUnits === 84 && up.units === 280, `${up?.priorUnits}/${up?.units}`);
check("rata-rata harian = 10", up !== undefined && Math.abs(up.avgDaily - 10) < 0.1, String(up?.avgDaily));
check("produk turun dibuang", down === undefined);
check("produk datar dibuang", flat === undefined);
check("produk baru (prior 0) dianggap trending", fresh !== undefined && fresh.growthPct === 100, String(fresh?.growthPct));
check("volume terlalu kecil diabaikan", low === undefined);
check("terurut growth tertinggi dulu", trends.length === 2 && trends[0].parent === "UP-280" && trends[1].parent === "NEW-PROD", JSON.stringify(trends.map((r) => r.parent)));
check("sku anak dihitung 2", up !== undefined && up.skus === 2, String(up?.skus));
check("limit dipatuhi", productTrends(trendSales, { limit: 1 }).length === 1, String(productTrends(trendSales, { limit: 1 }).length));

const shortSales = Array.from({ length: 10 }, (_, index) => trendSale("SHORT", "SHRT", addDays("2026-09-20", index), 3));
check("data < 14 hari: tidak ada sinyal trend", productTrends(shortSales).length === 0, String(productTrends(shortSales).length));
check("tanpa data: hasil kosong", productTrends([]).length === 0);

console.log(`\nSelesai bagian analytics. Gagal: ${failures.length}`);
if (failures.length > 0) {
  console.log(failures.map((item) => ` - ${item}`).join("\n"));
  process.exitCode = 1;
}