import { autoMapColumns } from "../src/lib/ingest/schema";
import { detectHeaderRow, normalizeSheetRows, parseDelimitedText } from "../src/lib/ingest/tabular";
import { buildSales } from "../src/lib/ingest/dataset";
import { buildDemoSalesCsv, buildDemoStockCsv, toCsv } from "../src/lib/template";
import { allocateByShare, forecastWeekly, productAffinity, sizeCurveFor, weekStart } from "../src/lib/analytics";
import { DEFAULT_SETTINGS, type Sale, type StockRecord } from "../src/lib/types";
import {
  buildPrompt,
  buildReportContext,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GROQ_MODEL,
  detectProvider,
  extractGeminiText,
  MAX_ACTIONS,
  MAX_AFFINITY_ROWS,
  MAX_ALLOCATION_ROWS,
  MAX_INSIGHTS,
  MAX_MARKDOWN_ROWS,
  MAX_PARENT_ROWS,
  MAX_REORDER_ROWS,
  MAX_RISKS,
  MAX_SAMPLE_SALES,
  MAX_STORE_ROWS,
  parseGeminiJson,
  parseGeminiReport,
  resolveAiConfig,
} from "../src/lib/gemini";

const failures: string[] = [];

function check(label: string, condition: boolean, detail = ""): void {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    failures.push(label);
    console.log(`  FAIL  ${label} ${detail}`);
  }
}

const rows = normalizeSheetRows(parseDelimitedText(toCsv(buildDemoSalesCsv()), ","));
const headerRow = detectHeaderRow(rows);
const sales = buildSales(rows, autoMapColumns(rows[headerRow]), headerRow).rows;
const stockRows = normalizeSheetRows(parseDelimitedText(toCsv(buildDemoStockCsv()), ","));
const stockHeader = detectHeaderRow(stockRows);
const stock = buildSales(stockRows, autoMapColumns(stockRows[stockHeader]), stockHeader).rows;

function sale(over: Partial<Sale>): Sale {
  return {
    date: "2026-01-05",
    store: "Toko A",
    channel: "OFFLINE",
    parentSku: "P1",
    sku: "P1-40",
    size: "40",
    qty: 1,
    unitPrice: 100000,
    revenue: 100000,
    ...over,
  };
}

function stockRow(sku: string, store: string, qty: number): StockRecord {
  return { sku, store, qty };
}

console.log("\n[A] Size curve memakai child SKU asli, bukan tebakan parent-size");
const curve = sizeCurveFor(sales, "ORT-CTL");
check("setiap size punya SKU", curve.every((point) => point.sku.length > 0));
check("SKU demo cocok pola", curve.every((point) => point.sku.startsWith("ORT-CTL-")), curve[0]?.sku);
const customSku = [
  sale({ sku: "JKT-9001-BLK", size: "40" }),
  sale({ sku: "JKT-9001-WHT", size: "40" }),
  sale({ sku: "JKT-9002-BLK", size: "41" }),
];
const customCurve = sizeCurveFor(customSku, "P1");
check("SKU asli dipertahankan", customCurve[0].sku === "JKT-9001-BLK", customCurve[0].sku);
check("SKU per size berbeda", customCurve[1].sku === "JKT-9002-BLK", customCurve[1].sku);

console.log("\n[B] Alokasi: pemetaan stok ke parent memakai peta SKU, bukan prefix");
const prefixed = allocateByShare(sales, stock as StockRecord[], 1000, DEFAULT_SETTINGS, "ORT-CTL");
check("scope parent dengan SKU berprefix", prefixed.reduce((acc, row) => acc + row.suggested, 0) === 950, String(prefixed.reduce((a, r) => a + r.suggested, 0)));

const oddSales: Sale[] = [
  sale({ parentSku: "P1", sku: "JKT-9001", size: "40", store: "Toko A" }),
  sale({ parentSku: "P1X", sku: "JKT-9001", size: "40", store: "Toko A", qty: 9 }),
];
const oddStock = [stockRow("JKT-9001", "Toko A", 40)];
const oddScope = allocateByShare(oddSales, oddStock, 100, DEFAULT_SETTINGS, "P1");
check("SKU tanpa prefix parent tetap terhitung via peta SKU", oddScope.some((row) => row.onHand === 40), JSON.stringify(oddScope.map((r) => `${r.store}:${r.onHand}`)));
const oddShared = allocateByShare(oddSales, oddStock, 100, DEFAULT_SETTINGS);
check("SKU yang dipakai 2 parent tidak dobel hitung", oddShared.reduce((acc, row) => acc + row.onHand, 0) === 40, String(oddShared.reduce((a, r) => a + r.onHand, 0)));
const unknownStock = allocateByShare(oddSales, [stockRow("SKU-BARU-01", "Toko A", 500)], 100, DEFAULT_SETTINGS, "P1");
check("SKU tak dikenal tidak nebak parent", unknownStock.every((row) => row.onHand === 0), JSON.stringify(unknownStock.map((r) => r.onHand)));

console.log("\n[C] Forecasting: minggu kosong diisi nol, tidak memampatkan waktu");
function weeklySale(index: number, qty: number): Sale {
  const start = Date.UTC(2026, 0, 5);
  const date = new Date(start + index * 7 * 86_400_000).toISOString().slice(0, 10);
  return sale({ date, qty, parentSku: "P1", sku: "P1-40" });
}
const weekly = Array.from({ length: 8 }, (_, index) => weeklySale(index, (index + 1) * 10));
const dense = forecastWeekly(weekly, 0.4, 0.15, 4);
check("tanpa gap: jumlah minggu = jumlah data", dense.weeks === 8, `${dense.weeks}/8`);
check("points = 8 aktual + 4 proyeksi", dense.points.length === 12, String(dense.points.length));
const gapped = forecastWeekly([...weekly.slice(0, 4), ...weekly.slice(6)], 0.4, 0.15, 4);
check("gap 2 minggu diisi sebagai 2 titik", gapped.weeks === 8, `${gapped.weeks}/8`);
check("titik di dalam gap bernilai 0", gapped.points.filter((point) => point.actual === 0).length === 2, JSON.stringify(gapped.points.map((p) => `${p.period}:${p.actual}`)));
check("periode tetap berurutan 7 hari", (() => {
  for (let i = 1; i < gapped.points.length; i += 1) {
    const diff = new Date(`${gapped.points[i].period}T00:00:00Z`).getTime() - new Date(`${gapped.points[i - 1].period}T00:00:00Z`).getTime();
    if (diff !== 604_800_000) return false;
  }
  return true;
})(), gapped.points.map((p) => p.period).join(","));
check("total unit tetap sama setelah gap fill", gapped.points.reduce((acc, point) => acc + (point.actual ?? 0), 0) === 250, String(gapped.points.reduce((acc, p) => acc + (p.actual ?? 0), 0)));
check("MAPE tidak NaN", gapped.mape !== null && Number.isFinite(gapped.mape), String(gapped.mape));

console.log("\n[C2] Holt Linear: inisialisasi tidak bocor ke metrik akurasi");
const steady = Array.from({ length: 12 }, (_, index) => weeklySale(index, 100));
const flat = forecastWeekly(steady, 0.4, 0.15, 4);
check("data flat: tren = 0", Math.abs(flat.trend) < 1e-6, String(flat.trend));
check("data flat: MAPE 0 karena genuinely tepat", (flat.mape ?? -1) === 0, String(flat.mape));
check("data flat: WAPE 0", (flat.wape ?? -1) === 0, String(flat.wape));
check("data flat: sigma residual ~ 0", flat.sigmaWeekly < 1e-6, String(flat.sigmaWeekly));
const leap = [10, 40, 12, 45, 11, 48].map((qty, index) => weeklySale(index, qty));
const noisy = forecastWeekly(leap, 0.4, 0.15, 3);
check("2 minggu warm-up tidak punya fitted palsu", noisy.points[1].fitted === null, String(noisy.points[1].fitted));
check("fitted mulai dari minggu ke-3", noisy.points[2].fitted !== null, String(noisy.points[2].fitted));
check("fitted minggu ke-3 bukan salinan aktual", noisy.points[2].fitted !== noisy.points[2].actual, `fitted ${noisy.points[2].fitted} actual ${noisy.points[2].actual}`);
check("error hanya dihitung dari minggu ke-3", noisy.wape !== null && noisy.wape > 0, String(noisy.wape));
check("sigma finite & positif untuk data spiky", noisy.sigmaWeekly > 0 && Number.isFinite(noisy.sigmaWeekly), String(noisy.sigmaWeekly));
const enough = forecastWeekly(steady.slice(0, 2), 0.4, 0.15, 2);
check("history < 3 minggu: metrik null, tidak NaN", enough.mape === null && enough.wape === null, `${enough.mape}/${enough.wape}`);
check("history < 3 minggu: level = rata-rata", Math.abs(enough.level - 100) < 1e-6, String(enough.level));
check("forecast tidak negatif untuk tren turun", forecastWeekly([200, 100, 60, 40, 30].map((qty, index) => weeklySale(index, qty)), 0.4, 0.15, 8).points.every((point) => (point.forecast ?? 0) >= 0));
const hugeGap = forecastWeekly([weekly[0], weekly[7]], 0.4, 0.15, 4);
check("gap ekstrem tetap deret 7 hari", (() => {
  for (let i = 1; i < hugeGap.points.length; i += 1) {
    const diff = new Date(`${hugeGap.points[i].period}T00:00:00Z`).getTime() - new Date(`${hugeGap.points[i - 1].period}T00:00:00Z`).getTime();
    if (diff !== 604_800_000) return false;
  }
  return true;
})(), hugeGap.points.map((p) => p.period).join(","));
check("minggu pertama tetap jadi titik pertama", hugeGap.points[0].period === weekStart(weekly[0].date), hugeGap.points[0].period);

console.log("\n[C3] Minggu tanpa data tidak dihitung sebagai demand 0");
const denseWeekly = Array.from({ length: 12 }, (_, index) => weeklySale(index, 100));
const withHole = forecastWeekly([...denseWeekly.slice(0, 8), ...denseWeekly.slice(11)], 0.4, 0.15, 4);
check("3 minggu tanpa data ditandai imputed", withHole.points.filter((point) => point.imputed).length === 3, String(withHole.points.filter((p) => p.imputed).length));
check("weeks vs observedWeeks beda 3", withHole.weeks === 12 && withHole.observedWeeks === 9, `${withHole.weeks}/${withHole.observedWeeks}`);
check("avgWeekly hanya dari minggu observasi", Math.abs(withHole.avgWeekly - 100) < 1e-6, String(withHole.avgWeekly));
check("level tidak anjlok ke 0 karena gap", Math.abs(withHole.level - 100) < 1e-6, String(withHole.level));
check("sigma tidak meledak dari nol imitasi", withHole.sigmaWeekly < 1e-6, String(withHole.sigmaWeekly));
check("proyeksi sama dengan data tanpa gap", (() => {
  const clean = forecastWeekly(denseWeekly, 0.4, 0.15, 4);
  return clean.points.slice(-4).every((point, i) => Math.abs((point.forecast ?? 0) - (withHole.points.slice(-4)[i].forecast ?? 0)) < 1e-9);
})(), withHole.points.slice(-4).map((p) => p.forecast?.toFixed(2)).join(","));
check("titik horizon tidak ditandai imputed", withHole.points.slice(-4).every((point) => !point.imputed));
const mostlyHole = forecastWeekly([denseWeekly[0], denseWeekly[11]], 0.4, 0.15, 4);
check("observed < 3 -> metrik null", mostlyHole.mape === null && mostlyHole.wape === null, `${mostlyHole.mape}/${mostlyHole.wape}`);
check("observed < 3 -> level dari data observasi", Math.abs(mostlyHole.level - 100) < 1e-6, String(mostlyHole.level));

console.log("\n[D] Affinity: support/confidence/lift Apriori");
const affinitySales: Sale[] = [];
for (let month = 1; month <= 6; month += 1) {
  // JER selalu bersama SOCK
  affinitySales.push(sale({ date: `2026-0${month}-02`, parentSku: "RNK-JER", sku: "RNK-JER-M", size: "M" }));
  affinitySales.push(sale({ date: `2026-0${month}-03`, parentSku: "RNK-SOCK", sku: "RNK-SOCK-OS", size: "ONE SIZE" }));
  // ORT-CTL hanya muncul sendiri
  affinitySales.push(sale({ date: `2026-0${month}-04`, parentSku: "ORT-CTL", sku: "ORT-CTL-40", size: "40" }));
}
const aff = productAffinity(affinitySales, 10);
const jerSock = aff.find((row) => row.anchor === "RNK-JER" && row.partner === "RNK-SOCK");
check("pasangan apparel+socks terdeteksi", jerSock !== undefined, JSON.stringify(aff));
check("support = 6 bucket / 6 bucket", jerSock !== undefined && jerSock.support === 1, String(jerSock?.support));
check("confidence = 1", jerSock !== undefined && jerSock.confidence === 1, String(jerSock?.confidence));
check("lift = 1 (selalu berpasangan, bukanlifting)", jerSock !== undefined && Math.abs(jerSock.lift - 1) < 1e-9, String(jerSock?.lift));

// ORT-CTL sering muncul tanpa partner apparel -> lift tidak boleh blew up
const lonely = productAffinity(
  [
    ...affinitySales,
    ...Array.from({ length: 12 }, (_, index) =>
      sale({ date: `2026-07-${String((index % 28) + 1).padStart(2, "0")}`, parentSku: "ORT-CTL", sku: "ORT-CTL-41", size: "41" }),
    ),
  ],
  10,
);
const socksPartner = lonely.find((row) => row.partner === "RNK-SOCK");
check("partner yang jarang muncul tidak digoreng lift-nya", socksPartner === undefined || socksPartner.lift <= 2, String(socksPartner?.lift));
check("semua row punya anchor apparel", aff.every((row) => row.anchor.startsWith("RNK-")), JSON.stringify(aff.map((r) => r.anchor)));
check("cooccur > 0", aff.every((row) => row.cooccur > 0));
check("support/confidence dalam 0..1", aff.every((row) => row.support <= 1 && row.confidence <= 1 && row.support >= 0 && row.confidence >= 0));

console.log("\n[E] AI Insight: parsing & budget prompt Groq");

check("JSON polos terbaca", JSON.stringify(parseGeminiJson('{"a":1}')) === '{"a":1}');
check("JSON dalam code fence terbaca", JSON.stringify(parseGeminiJson('```json\n{"a":1}\n```')) === '{"a":1}');
check("JSON dengan sampah di sekitar terbaca", JSON.stringify(parseGeminiJson('tentang:\n{"a":1}\nselesai')) === '{"a":1}');
check("bukan JSON -> null", parseGeminiJson("bukan json sama sekali") === null);
check("kosong -> null", parseGeminiJson("") === null);

const groqText = extractGeminiText({
  choices: [{ message: { role: "assistant", content: '{"headline":"Judul"}' } }],
});
check("ekstrak teks format OpenAI", groqText === '{"headline":"Judul"}', groqText);
check("ekstrak teks format Gemini", extractGeminiText({ candidates: [{ content: { parts: [{ text: "isian uji" }] } }] }) === "isian uji");
check("tanpa choices -> string kosong", extractGeminiText({ choices: [] }) === "");
check("choices tanpa content -> string kosong", extractGeminiText({ choices: [{ message: {} }] }) === "");
check("payload aneh tidak crash", extractGeminiText(null) === "");

check("tebak provider dari bentuk key", detectProvider("AIza1234567890abcdefghij") === "gemini" && detectProvider("gsk_abc123") === "groq");
check("hint provider menang", detectProvider("gsk_abc", "gemini") === "gemini");
check("resolve: key browser saja -> groq + default", resolveAiConfig(null, { apiKey: "gsk_abc" })?.model === DEFAULT_GROQ_MODEL, String(resolveAiConfig(null, { apiKey: "gsk_abc" })?.model));
const geminiResolve = resolveAiConfig(null, { apiKey: "AIza1234567890abcdefghij" });
check("resolve: key AIza terdeteksi gemini", geminiResolve?.provider === "gemini" && geminiResolve?.model === DEFAULT_GEMINI_MODEL, JSON.stringify(geminiResolve));
const envCfg = { apiKey: "sk_env", provider: "groq" as const, model: "openai/gpt-oss-20b", models: ["openai/gpt-oss-20b"] };
const mixedResolve = resolveAiConfig(envCfg, { apiKey: "", provider: "gemini", model: "gemini-2.0-flash" });
check("resolve: env + override provider browser", mixedResolve?.apiKey === "sk_env" && mixedResolve?.provider === "gemini" && mixedResolve?.model === "gemini-2.0-flash", JSON.stringify(mixedResolve));
check("resolve: tanpa key -> null", resolveAiConfig(null, { apiKey: "   " }) === null);

const dirty = parseGeminiReport(
  {
    headline: "  Judul Laporan  ",
    summary: 42,
    insights: [
      { title: "Sah", detail: "Isi", severity: "critical", evidence: "9 unit" },
      { title: "Severity ngawur", detail: "Isi", severity: "CRITICAL!", evidence: "" },
      { title: "", detail: "", severity: "opportunity", evidence: "" },
      ...Array.from({ length: 20 }, (_, index) => ({ title: `I${index}`, detail: "x", severity: "info", evidence: "1" })),
    ],
    actions: [
      { step: "Buat pesanan", reason: "Stok 0", priority: "high" },
      { step: "Priority ngawur", reason: "x", priority: "URGENT" },
    ],
    risks: ["Risiko 1", "", "Risiko 2", "R3", "R4", "R5", "R6", "R7"],
  },
  "model-uji",
  "2026-10-06T00:00:00.000Z",
);
check("insight dibatasi", dirty.insights.length === MAX_INSIGHTS, String(dirty.insights.length));
check("action dibatasi", dirty.actions.length <= MAX_ACTIONS, String(dirty.actions.length));
check("risks dibatasi", dirty.risks.length === MAX_RISKS, String(dirty.risks.length));
check("risks kosong dibuang", dirty.risks.every((r) => r.length > 0), JSON.stringify(dirty.risks));
check("severity tidak valid jadi info", dirty.insights[1].severity === "info", dirty.insights[1].severity);
check("priority tidak valid jadi medium", dirty.actions[1].priority === "medium", dirty.actions[1].priority);
check("judul kosong diisi pengaman", dirty.insights[2].title.length > 0, dirty.insights[2].title);
check("summary angka jadi string kosong", dirty.summary === "", JSON.stringify(dirty.summary));
check("model & timestamp terbawa", dirty.model === "model-uji" && dirty.generatedAt === "2026-10-06T00:00:00.000Z");
check("badan kosong tidak crash", parseGeminiReport({}, "m", "t").headline.length > 0);

function aiSale(index: number, parent: string, sku: string): Sale {
  const month = 1 + (index % 9);
  const day = 1 + (index % 28);
  return sale({
    date: `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    parentSku: parent,
    sku,
    qty: 1 + (index % 4),
  });
}
const aiSales = Array.from({ length: 500 }, (_, index) => aiSale(index, "OE-HB3", "OE-HB3-41"));
const aiReorder = Array.from({ length: 60 }, (_, index) => ({
  parent: `SKU-${index}`,
  status: index % 3 === 0 ? "UNDERSTOCK" : index % 3 === 1 ? "HEALTHY" : "OVERSTOCK",
  unitsSold: 10,
  avgDaily: 1,
  onHand: 0,
  weeksCover: 0,
  safetyStock: 10,
  reorderPoint: 12,
  reorderPointSource: "FILE",
  suggestedOrder: 50,
  leadTimeDays: 45,
  leadTimeDemand: 45,
  days: 100,
}));
const aiContext = buildReportContext({
  summary: {
    totalUnits: 1234,
    totalRevenue: 5_500_000_000,
    avgUnitPrice: 450000,
    parentCount: 60,
    skuCount: 120,
    storeCount: 12,
    days: 272,
    unitsPerDay: 4.54,
    onlineShareUnits: 0.42,
    stockRecords: 240,
    hasStock: true,
  },
  storeStats: Array.from({ length: 40 }, (_, index) => ({ store: `Toko ${index}`, units: index, revenue: index, share: 0.02, onHand: index, lastSale: "2026-09-01", channel: "OFFLINE" })),
  parentStats: Array.from({ length: 60 }, (_, index) => ({ parent: `SKU-${index}`, units: index, revenue: index, skus: 2, avgPrice: 450000, onHand: index, lastSale: "2026-09-01" })),
  reorder: aiReorder,
  markdown: Array.from({ length: 60 }, (_, index) => ({ parent: `SKU-${index}`, unitsSold: index, onHand: index * 10, avgDaily: 1, weeksCover: index, sellThrough: 0.1, lastSale: "2026-09-01", daysSinceLastSale: index, discount: 40, currentPrice: 450000, newPrice: 270000, valueAtRisk: index, basis: "STOCK" })),
  allocation: Array.from({ length: 40 }, (_, index) => ({ store: `Toko ${index}`, channel: "OFFLINE", units: index, revenue: index, share: 0.02, onHand: index, suggested: index })),
  forecast: {
    level: 245, trend: 4.2, avgWeekly: 245, sigmaWeekly: 38.5, mape: 11.3, wape: 9.8,
    weeks: 40, observedWeeks: 38,
    recentActuals: Array.from({ length: 24 }, (_, index) => 200 + index),
    forecastPoints: Array.from({ length: 12 }, (_, index) => ({ period: `2026-${String(index + 1).padStart(2, "0")}-01`, value: 250 })),
  },
  affinity: Array.from({ length: 30 }, (_, index) => ({ anchor: `A${index}`, partner: `B${index}`, cooccur: 1, support: 0.5, confidence: 0.6, lift: 1.5 })),
  trends: [
    { parent: "TREND-1", units: 280, priorUnits: 84, growthPct: 233.3, avgDaily: 10, skus: 2, lastSale: "2026-09-27" },
    { parent: "TREND-2", units: 140, priorUnits: 0, growthPct: 100, avgDaily: 5, skus: 1, lastSale: "2026-09-25" },
    { parent: "TURUN", units: 56, priorUnits: 280, growthPct: -80, avgDaily: 2, skus: 1, lastSale: "2026-09-20" },
  ],
  settings: DEFAULT_SETTINGS,
  range: { minDate: "2026-01-01", maxDate: "2026-09-30" },
  sales: aiSales.map((row) => ({ date: row.date, store: row.store, channel: row.channel, parentSku: row.parentSku, sku: row.sku, size: row.size, qty: row.qty, unitPrice: row.unitPrice, revenue: row.revenue })),
});

check("sampel transaksi dibatasi", aiContext.sampleSales.length === MAX_SAMPLE_SALES, String(aiContext.sampleSales.length));
check("total baris tetap tercatat", aiContext.salesRowsTotal === 500, String(aiContext.salesRowsTotal));
check("store rows dibatasi", aiContext.storeStats.length === MAX_STORE_ROWS, String(aiContext.storeStats.length));
check("parent rows dibatasi", aiContext.parentStats.length === MAX_PARENT_ROWS, String(aiContext.parentStats.length));
check("reorder rows dibatasi", aiContext.reorder.length === MAX_REORDER_ROWS, String(aiContext.reorder.length));
check("markdown rows dibatasi", aiContext.markdown.length === MAX_MARKDOWN_ROWS, String(aiContext.markdown.length));
check("allocation rows dibatasi", aiContext.allocation.length === MAX_ALLOCATION_ROWS, String(aiContext.allocation.length));
check("affinity rows dibatasi", aiContext.affinity.length === MAX_AFFINITY_ROWS, String(aiContext.affinity.length));
check("trends dibatasi & growth negatif dibuang", aiContext.trends.length === 2, JSON.stringify(aiContext.trends.map((r) => r.parent)));
check("trends terurut growth tertinggi", aiContext.trends.length === 2 && aiContext.trends[0].parent === "TREND-1", JSON.stringify(aiContext.trends.map((r) => r.parent)));
check("UNDERSTOCK diprioritaskan di reorder", aiContext.reorder.every((row) => row.status !== "HEALTHY"), JSON.stringify(aiContext.reorder.map((r) => r.status)));

const aiPrompt = buildPrompt(aiContext);
check("prompt tidak mengandung NaN/undefined/null", !/\b(?:nan|undefined|null)\b/i.test(aiPrompt), aiPrompt.match(/.{0,40}(?:\bnan\b|undefined|\bnull\b).{0,40}/i)?.[0] ?? "");
check("prompt memuat semua seksi utama", ["RINGKASAN BISNIS", "PLAN REORDER", "KANDIDAT MARKDOWN", "ALOKASI STOK", "FORECAST HOLT", "PRODUK TERLARIS", "PRODUK TRENDING"].every((section) => aiPrompt.includes(section)));
check("prompt memuat instruksi angka dari data", aiPrompt.includes("5500000000") && aiPrompt.includes("MAPE 11.3%"));
check("prompt memuat produk trending", aiPrompt.includes("TREND-1") && aiPrompt.includes("naik 233.3%"), aiPrompt.match(/TREND-1[^\n]+/)?.[0] ?? "");
check("prompt tidak memuat produk turun", !aiPrompt.includes("TURUN"), "");
check(`prompt muat di kuota 8.000 TPM (${aiPrompt.length} char)`, aiPrompt.length < 22000, String(aiPrompt.length));
check("fmt angka forecast terbaca", aiPrompt.includes("Baseline 245") && aiPrompt.includes("tren +4.2"), aiPrompt.match(/Baseline \S+.{0,60}/)?.[0] ?? "");

console.log(`\nSelesai regresi algoritma. Gagal: ${failures.length}`);
if (failures.length > 0) {
  console.log(failures.map((item) => ` - ${item}`).join("\n"));
  process.exitCode = 1;
}