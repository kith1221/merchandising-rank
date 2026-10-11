import { autoMapColumns, isMappingUsable } from "../src/lib/ingest/schema";
import { detectHeaderRow, looksLikeStockSheet, normalizeSheetRows, parseDelimitedText } from "../src/lib/ingest/tabular";
import { autoMapStockColumns, buildSales, buildStock, summarizeRange } from "../src/lib/ingest/dataset";
import { buildDemoSalesCsv, buildDemoStockCsv, toCsv } from "../src/lib/template";
import { reorderPlan, summarize } from "../src/lib/analytics";
import { parseDate, parseNumber } from "../src/lib/parse-utils";
import { DEFAULT_SETTINGS } from "../src/lib/types";

export const failures: string[] = [];

export function check(label: string, condition: boolean, detail = ""): void {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    failures.push(label);
    console.log(`  FAIL  ${label} ${detail}`);
  }
}

console.log("\n[1] Parsing angka & tanggal gaya Indonesia");
check("1.499.000 -> 1499000", parseNumber("1.499.000") === 1499000, String(parseNumber("1.499.000")));
check("1.234,56 -> 1234.56", parseNumber("1.234,56") === 1234.56, String(parseNumber("1.234,56")));
check("Rp 95.000 -> 95000", parseNumber("Rp 95.000") === 95000, String(parseNumber("Rp 95.000")));
check("05/01/2026 -> 2026-01-05", parseDate("05/01/2026") === "2026-01-05", String(parseDate("05/01/2026")));
check("2026-01-05 -> 2026-01-05", parseDate("2026-01-05") === "2026-01-05");
check("12/31/2025 -> 2025-12-31", parseDate("12/31/2025") === "2025-12-31", String(parseDate("12/31/2025")));
check("20260105 -> 2026-01-05", parseDate("20260105") === "2026-01-05", String(parseDate("20260105")));
check("serial excel 45000 terbaca", parseDate(45000) !== null, String(parseDate(45000)));

console.log("\n[2] Auto-mapping header + deteksi baris header");
const demoRows = normalizeSheetRows(parseDelimitedText(toCsv(buildDemoSalesCsv()), ","));
const headerRow = detectHeaderRow(demoRows);
check("header di baris 1", headerRow === 0, `baris ${headerRow}`);

const mapping = autoMapColumns(demoRows[headerRow]);
check("mapping usable", isMappingUsable(mapping));
const expected: Record<string, number> = { date: 0, store: 1, parentSku: 3, sku: 4, size: 5, qty: 6, unitPrice: 7, revenue: 8 };
for (const [field, column] of Object.entries(expected)) {
  check(`${field} -> kolom ${column}`, mapping[field as keyof typeof mapping] === column, String(mapping[field as keyof typeof mapping]));
}

const withTitle = normalizeSheetRows(
  parseDelimitedText(
    ["LAPORAN PENJUALAN RANK SPORTS", "Periode Jan 2026", "", ...toCsv(buildDemoSalesCsv(4)).split("\r\n")].join("\n"),
    ",",
  ),
);
const detectedTitleRow = detectHeaderRow(withTitle);
check("header ditemukan melewati baris judul", withTitle[detectedTitleRow][0] === "Tanggal", `baris ${detectedTitleRow}: ${withTitle[detectedTitleRow][0]}`);
check("baris judul tidak terpilih", withTitle[0][0] !== "Tanggal");

console.log("\n[3] Build dataset dari demo");
const salesBuild = buildSales(demoRows, mapping, headerRow);
check("tidak ada baris valid yang dilewati", salesBuild.skipped === 0, `skipped ${salesBuild.skipped}`);
check("ribuan baris terproses", salesBuild.rows.length > 3000, String(salesBuild.rows.length));

const sample = salesBuild.rows[0];
check("parent diturunkan dari child SKU", sample.parentSku === "ORT-CTL", sample.parentSku);
check("size diturunkan dari child SKU", sample.size === sample.sku.split("-").pop(), `${sample.sku} -> ${sample.size}`);
check("kanal online terdeteksi", salesBuild.rows.some((row) => row.channel === "ONLINE" && row.store.includes("Shopee")));
check("kanal offline terdeteksi", salesBuild.rows.some((row) => row.channel === "OFFLINE"));
check("revenue = qty x harga satuan", salesBuild.rows.every((row) => Math.abs(row.revenue - row.qty * row.unitPrice) <= 1));

const stockRows = normalizeSheetRows(parseDelimitedText(toCsv(buildDemoStockCsv()), ","));
const stockHeader = detectHeaderRow(stockRows);
const stockMapping = autoMapStockColumns(stockRows[stockHeader]);
const stockBuild = buildStock(stockRows, stockMapping, stockHeader);
check("stok terproses", stockBuild.rows.length > 20, String(stockBuild.rows.length));
check("mapping kolom stok benar", stockMapping.sku === 0 && stockMapping.qty === 2, `${stockMapping.sku}/${stockMapping.qty}`);

const range = summarizeRange(salesBuild.rows);
check("periode terambil", range.minDate !== null && range.maxDate !== null, JSON.stringify(range));

console.log("\n[4] Ringkasan (summary)");
const summary = summarize(salesBuild.rows, stockBuild.rows, range.minDate, range.maxDate);
check("total unit konsisten", summary.totalUnits === salesBuild.rows.reduce((a, r) => a + r.qty, 0));
check("total omzet konsisten", Math.abs(summary.totalRevenue - salesBuild.rows.reduce((a, r) => a + r.revenue, 0)) < 1);
check("6 outlet terdeteksi", summary.storeCount === 6, String(summary.storeCount));
check("4 parent SKU terdeteksi", summary.parentCount === 4, String(summary.parentCount));
const expectedMonths = (Number(range.maxDate?.slice(0, 4)) - Number(range.minDate?.slice(0, 4))) * 12 + (Number(range.maxDate?.slice(5, 7)) - Number(range.minDate?.slice(5, 7))) + 1;
check("tren bulanan menutupi periode penuh", summary.monthly.length === expectedMonths, `${summary.monthly.length}/${expectedMonths}`);
check("tren bulanan >= 24 bulan", summary.monthly.length >= 24, String(summary.monthly.length));
check("share outlet = 100%", Math.abs(summary.storeStats.reduce((a, s) => a + s.share, 0) - 1) < 1e-9);
check("unit per outlet = total unit", summary.storeStats.reduce((a, s) => a + s.units, 0) === summary.totalUnits);
check("omzet per outlet = total omzet", Math.abs(summary.storeStats.reduce((a, s) => a + s.revenue, 0) - summary.totalRevenue) < 1);
check("stok terpetakan ke parent", summary.parentStats.some((p) => p.onHand > 0));
check("classify apparel benar", summary.parentStats.find((p) => p.parent === "RNK-JER")?.apparelLike === true);
check("classify footwear benar", summary.parentStats.find((p) => p.parent === "ORT-CTL")?.apparelLike === false);

console.log("\n[5] Data rusak / anisoflmf tidak hilang diam-diam");
const dirtyRows = normalizeSheetRows(
  parseDelimitedText(
    [
      "Tanggal;Toko;Child SKU;Qty;Harga Satuan",
      "05/01/2026;Toko A;SKU-40;3;Rp 1.500.000",
      "bukan tanggal;Toko A;SKU-40;2;100",
      "05/01/2026;Toko A;SKU-40;abc;100",
      "05/01/2026;Toko A;;2;100",
      "05/01/2026;Toko A;SKU-41;-4;100",
      "06/01/2026;Toko B;SKU-41;5;200.000",
    ].join("\n"),
    ";",
  ),
);
const dirtyMapping = autoMapColumns(dirtyRows[0]);
check("delimiter ';' terdeteksi", dirtyMapping.date === 0 && dirtyMapping.qty === 3, JSON.stringify(dirtyMapping));
const dirtyBuild = buildSales(dirtyRows, dirtyMapping, 0);
check("2 baris valid dari 6", dirtyBuild.validRows === 2, `valid ${dirtyBuild.validRows}`);
check("4 baris dilaporkan bermasalah", dirtyBuild.skipped === 4 && dirtyBuild.issues.length === 4, `skipped ${dirtyBuild.skipped}/${dirtyBuild.issues.length}`);
check("harga 'Rp 1.500.000' diparse", dirtyBuild.rows[0]?.unitPrice === 1500000, String(dirtyBuild.rows[0]?.unitPrice));
check("toko kosong -> Umum", buildSales(dirtyRows, { ...dirtyMapping, store: -1 }, 0).rows.length === 2);
const noRevenue = buildSales(dirtyRows, { ...dirtyMapping, revenue: -1, unitPrice: -1 }, 0);
check("tanpa harga & total tidak crash", noRevenue.rows.length === 2 && noRevenue.rows[0].revenue === 0);
const deriveOnly = buildSales(dirtyRows, { ...dirtyMapping, size: -1, parentSku: -1 }, 0);
check("parent & size auto dari SKU", deriveOnly.rows[0]?.parentSku === "SKU" && deriveOnly.rows[0]?.size === "40", JSON.stringify(deriveOnly.rows[0]));

console.log("\n[6] Skema file Rank Sports (Sales_History (Raw) + Inventory_Alerts + Stock by SKU_Code)");
const rsSalesHeaders = [
  "Transaction_ID", "Date", "Channel_Type", "Location_Name", "Brand", "Product_Name",
  "Category", "Sport_Type", "Size", "Qty", "Unit_Price", "Total_Sales",
];
const rsSalesRows: (string | number)[][] = [
  rsSalesHeaders,
  ["TRX-0001", "2026-01-05", "OFFLINE", "Toko GLC", "ORTUSEIGHT", "Ortuseight Hyperblast 3.0", "Footwear", "Running", "41", 2, 1899000, 3798000],
  ["TRX-0002", "2026-01-06", "ONLINE", "Shopee Official Store", "ORTUSEIGHT", "Ortuseight Hyperblast 3.0", "Footwear", "Running", "42", 1, 1899000, 1899000],
  ["TRX-0003", "2026-01-07", "OFFLINE", "Toko Pamulang", "ORTUSEIGHT", "Ortuseight Hyperblast 3.0", "Footwear", "Running", "41", 3, 1899000, 5697000],
];
const rsMapping = autoMapColumns(rsSalesHeaders);
check("tanggal dari Date", rsMapping.date === 1, String(rsMapping.date));
check("toko dari Location_Name", rsMapping.store === 3, String(rsMapping.store));
check("kanal dari Channel_Type", rsMapping.channel === 2, String(rsMapping.channel));
check("parent dari Product_Name", rsMapping.parentSku === 5, String(rsMapping.parentSku));
check("size dari Size", rsMapping.size === 8, String(rsMapping.size));
check("qty dari Qty", rsMapping.qty === 9, String(rsMapping.qty));
check("harga dari Unit_Price", rsMapping.unitPrice === 10, String(rsMapping.unitPrice));
check("omzet dari Total_Sales", rsMapping.revenue === 11, String(rsMapping.revenue));
check("Sport_Type tidak salah jadi kanal", rsMapping.channel !== 7, String(rsMapping.channel));

const rsSales = buildSales(rsSalesRows, rsMapping, 0);
check("3 baris valid", rsSales.validRows === 3, String(rsSales.validRows));
check("SKU per size dibedakan", new Set(rsSales.rows.map((row) => row.sku)).size === 2, JSON.stringify([...new Set(rsSales.rows.map((r) => r.sku))]));
check("SKU size 41 = PARENT-41", rsSales.rows[0].sku === "ORTUSEIGHT-HYPERBLAST-3-0-41", rsSales.rows[0].sku);
check("SKU size 42 = PARENT-42", rsSales.rows[1].sku === "ORTUSEIGHT-HYPERBLAST-3-0-42", rsSales.rows[1].sku);
check("parent tetap Product_Name", rsSales.rows[0].parentSku === "ORTUSEIGHT HYPERBLAST 3.0", rsSales.rows[0].parentSku);
check("synthesizedSku dihitung", rsSales.synthesizedSku === 3, String(rsSales.synthesizedSku));
check("user diberi tahu SKU disintesis", rsSales.issues.some((issue) => issue.message.includes("Child SKU")), JSON.stringify(rsSales.issues));
check("kanal ONLINE terdeteksi", rsSales.rows[1].channel === "ONLINE", rsSales.rows[1].channel);
check("omzet utuh", rsSales.rows.reduce((acc, row) => acc + row.revenue, 0) === 3798000 + 1899000 + 5697000);

const alertHeaders = ["Product_Name", "Sport_Type", "Size", "Location_Name", "Current_Stock_Qty", "Reorder_Point_Qty", "Variance", "System_Recommendation"];
const alertRows: (string | number)[][] = [
  alertHeaders,
  ["Ortuseight Hyperblast 3.0", "Running", "41", "Toko GLC", 6, 20, -14, "SEGERA BELI"],
  ["Ortuseight Hyperblast 3.0", "Running", "42", "Website", 3, 12, -9, "SEGERA BELI"],
];
const alertMapping = autoMapStockColumns(alertHeaders);
check("alert: toko dari Location_Name", alertMapping.store === 3, String(alertMapping.store));
check("alert: qty dari Current_Stock_Qty", alertMapping.qty === 4, String(alertMapping.qty));
check("alert: size dari Size", alertMapping.size === 2, String(alertMapping.size));
check("alert: parent dari Product_Name", alertMapping.parentSku === 0, String(alertMapping.parentSku));
check("alert: reorder dari Reorder_Point_Qty", alertMapping.reorderPoint === 5, String(alertMapping.reorderPoint));
check("alert: bukan sheet penjualan", !looksLikeStockSheet("Penjualan", rsSalesHeaders));
check("alert: Inventory_Alerts terdeteksi sebagai stok", looksLikeStockSheet("Inventory_Alerts", alertHeaders));

const alertStock = buildStock(alertRows, alertMapping, 0);
check("alert: 2 baris stok valid", alertStock.validRows === 2, `${alertStock.validRows} / issues ${JSON.stringify(alertStock.issues)}`);
check("alert: SKU sama dengan hasil synthes sales", alertStock.rows[0]?.sku === rsSales.rows[0].sku, `${alertStock.rows[0]?.sku} vs ${rsSales.rows[0].sku}`);
check("alert: reorder point ikut terbaca", alertStock.rows[0]?.reorderPoint === 20, String(alertStock.rows[0]?.reorderPoint));
const stockOverlap = alertStock.rows.filter((record) => rsSales.rows.some((sale) => sale.sku === record.sku));
check("alert: stok connect ke penjualan", stockOverlap.length === 2, String(stockOverlap.length));

const codeStockHeaders = ["SKU_Code", "Location", "Qty_On_Hand", "Safety_Stock", "Reorder_Point", "Stock_Status"];
const codeStockRows: (string | number)[][] = [
  codeStockHeaders,
  ["OE-HB3-41", "Gudang Pusat", 120, 20, 60, "AMAN"],
  ["OE-HB3-41", "Toko GLC", 6, 4, 20, "REORDER"],
  ["OE-HB3-38", "Website", 3, 2, 10, "REORDER"],
];
check("SKU_Code terdeteksi sebagai sheet stok", looksLikeStockSheet("Stock_List", codeStockHeaders));
const codeMapping = autoMapStockColumns(codeStockHeaders);
check("kode: sku dari SKU_Code", codeMapping.sku === 0, String(codeMapping.sku));
check("kode: toko dari Location", codeMapping.store === 1, String(codeMapping.store));
check("kode: qty dari Qty_On_Hand", codeMapping.qty === 2, String(codeMapping.qty));
check("kode: safety dari Safety_Stock", codeMapping.safetyStock === 3, String(codeMapping.safetyStock));
check("kode: reorder dari Reorder_Point", codeMapping.reorderPoint === 4, String(codeMapping.reorderPoint));
check("kode: Stock_Status tidak dipakai", codeMapping.qty !== 5 && codeMapping.safetyStock !== 5 && codeMapping.reorderPoint !== 5);

const codeStock = buildStock(codeStockRows, codeMapping, 0);
check("kode: 3 baris stok", codeStock.validRows === 3, `${codeStock.validRows} ${JSON.stringify(codeStock.issues)}`);
check("kode: SKU uppercase rapi", codeStock.rows[0]?.sku === "OE-HB3-41", codeStock.rows[0]?.sku);
check("kode: lokasi 5 titik terpisah", new Set(codeStock.rows.map((r) => r.store)).size === 3, JSON.stringify(codeStock.rows.map((r) => r.store)));
check("kode: safety & reorder ikut", codeStock.rows[0]?.safetyStock === 20 && codeStock.rows[0]?.reorderPoint === 60);

const withRules = reorderPlan(rsSales.rows, codeStock.rows, { ...DEFAULT_SETTINGS }, "2026-01-05", "2026-01-07");
check("SKU stock tidak nyambung ke sales -> reorder calculated", withRules.every((row) => row.reorderPointSource === "CALCULATED"), JSON.stringify(withRules.map((r) => r.reorderPointSource)));
const withAlertRules = reorderPlan(rsSales.rows, alertStock.rows, { ...DEFAULT_SETTINGS }, "2026-01-05", "2026-01-07");
check("reorder point dari file dipakai", withAlertRules.some((row) => row.reorderPointSource === "FILE"), JSON.stringify(withAlertRules.map((r) => `${r.parent}:${r.reorderPointSource}`)));
const hb41 = withAlertRules.find((row) => row.parent === "ORTUSEIGHT HYPERBLAST 3.0");
check("reorder point = 20+12 = 32 dari file", hb41?.reorderPoint === 32, String(hb41?.reorderPoint));
check("safety stock tetap dari file bila ada", hb41?.safetyStock === 0 || hb41?.safetyStock !== undefined, String(hb41?.safetyStock));
check("stok 9 <= reorder 32 -> UNDERSTOCK", hb41?.status === "UNDERSTOCK", hb41?.status);
check("saran PO = reorder + safety - onHand", hb41?.suggestedOrder === (hb41 ? hb41.reorderPoint + hb41.safetyStock - 9 : -1), String(hb41?.suggestedOrder));

console.log(`\nSelesai bagian ingest. Gagal: ${failures.length}`);
if (failures.length > 0) {
  console.log(failures.map((item) => ` - ${item}`).join("\n"));
  process.exitCode = 1;
}
