import { autoMapColumns } from "../src/lib/ingest/schema";
import { detectHeaderRow, normalizeSheetRows, parseDelimitedText } from "../src/lib/ingest/tabular";
import { autoMapStockColumns, buildSales, buildStock, summarizeRange } from "../src/lib/ingest/dataset";
import { buildDemoSalesCsv, buildDemoStockCsv, toCsv } from "../src/lib/template";
import { summarize } from "../src/lib/analytics";
import { formatCompact, formatRupiah } from "../src/lib/format";

const rows = normalizeSheetRows(parseDelimitedText(toCsv(buildDemoSalesCsv()), ","));
const headerRow = detectHeaderRow(rows);
const sales = buildSales(rows, autoMapColumns(rows[headerRow]), headerRow).rows;
const stockRows = normalizeSheetRows(parseDelimitedText(toCsv(buildDemoStockCsv()), ","));
const stockHeader = detectHeaderRow(stockRows);
const stock = buildStock(stockRows, autoMapStockColumns(stockRows[stockHeader]), stockHeader).rows;
const range = summarizeRange(sales);
const summary = summarize(sales, stock, range.minDate, range.maxDate);

const raw = buildDemoSalesCsv();
console.log("== Audit file demo (CSV) ==");
console.log("baris data        :", raw.length - 1);
let csvRevenue = 0;
let csvUnits = 0;
let mismatch = 0;
for (const row of raw.slice(1)) {
  const qty = Number(row[6]);
  const price = Number(row[7]);
  const total = Number(row[8]);
  csvUnits += qty;
  csvRevenue += total;
  if (Math.abs(qty * price - total) > 1) mismatch += 1;
}
console.log("unit CSV          :", csvUnits);
console.log("omzet CSV         :", formatRupiah(csvRevenue), `(${csvRevenue})`);
console.log("baris qty*xharga != total:", mismatch);
console.log("harga unik        :", [...new Set(raw.slice(1).map((row) => row[7]))].join(", "));

console.log("\n== Audit setelah ingest ==");
const ingestRevenue = sales.reduce((a, r) => a + r.revenue, 0);
const ingestUnits = sales.reduce((a, r) => a + r.qty, 0);
console.log("unit ingest       :", ingestUnits, ingestUnits === csvUnits ? "(sama)" : "(BEDA)");
console.log("omzet ingest      :", formatRupiah(ingestRevenue), ingestRevenue === csvRevenue ? "(sama)" : "(BEDA)");
console.log("periode           :", range.minDate, "->", range.maxDate, `(${(new Date(range.maxDate!).getTime() - new Date(range.minDate!).getTime()) / 86400000 + 1} hari)`);
console.log("total omzet KPI   :", formatRupiah(summary.totalRevenue));
console.log("omzet compact     :", formatCompact(summary.totalRevenue));
console.log("omzet/hari        :", formatRupiah(summary.revenuePerDay));
console.log("unit/hari         :", summary.unitsPerDay.toFixed(1));
console.log("avg harga unit    :", formatRupiah(summary.avgUnitPrice));
console.log("online omzet      :", formatRupiah(summary.onlineRevenue), `(${(summary.onlineRevenue / summary.totalRevenue * 100).toFixed(1)}%)`);

console.log("\n== Konsistensi antar tampilan ==");
const byMonth = summary.monthly.reduce((a, m) => a + m.online + m.offline, 0);
const byStore = summary.storeStats.reduce((a, s) => a + s.revenue, 0);
const byParent = summary.parentStats.reduce((a, p) => a + p.revenue, 0);
console.log("total vs bulanan  :", byMonth === summary.totalRevenue ? "sama" : `BEDA ${byMonth - summary.totalRevenue}`);
console.log("total vs toko     :", byStore === summary.totalRevenue ? "sama" : `BEDA ${byStore - summary.totalRevenue}`);
console.log("total vs parent   :", byParent === summary.totalRevenue ? "sama" : `BEDA ${byParent - summary.totalRevenue}`);
console.log("harga x unit      :", Math.abs(summary.avgUnitPrice * summary.totalUnits - summary.totalRevenue) < 1 ? "sama" : "BEDA");

console.log("\n== Omzet per toko (2 tahun) ==");
for (const store of summary.storeStats) {
  console.log(`  ${store.store.padEnd(30)} ${String(store.units).padStart(7)} unit  ${formatRupiah(store.revenue).padStart(16)}  avg ${formatRupiah(store.revenue / store.units)}`);
}

console.log("\n== Omzet per parent SKU ==");
for (const parent of summary.parentStats) {
  console.log(`  ${parent.parent.padEnd(12)} ${String(parent.units).padStart(7)} unit  ${formatRupiah(parent.revenue).padStart(16)}  avg ${formatRupiah(parent.avgPrice)}  stok ${parent.onHand}`);
}

console.log("\n== Omzet per bulan (12 terakhir) ==");
for (const month of summary.monthly.slice(-12)) {
  const total = month.online + month.offline;
  console.log(`  ${month.month}  ${formatRupiah(total).padStart(16)}  (offline ${formatRupiah(month.offline).padStart(15)} | online ${formatRupiah(month.online).padStart(15)})`);
}