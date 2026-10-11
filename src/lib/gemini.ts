import type { AiAction, AiClientConfig, AiInsight, AiProvider, AiReport, AiSeverity, Dataset, Settings } from "./types";

export const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
export const GROQ_MODELS_ENDPOINT = "https://api.groq.com/openai/v1/models";
export const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";
export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

/**
 * Model cadangan per provider, dicoba otomatis jika model utama di-decommission
 * atau tidak ada di akun. Tidak memakai varian preview/eksperimental.
 */
export const FALLBACK_MODELS: Record<AiProvider, string[]> = {
  groq: ["openai/gpt-oss-20b", "llama-3.3-70b-versatile"],
  gemini: ["gemini-2.0-flash", "gemini-1.5-flash"],
};

const DEFAULT_MODEL_BY_PROVIDER: Record<AiProvider, string> = {
  groq: DEFAULT_GROQ_MODEL,
  gemini: DEFAULT_GEMINI_MODEL,
};

const MODEL_PREFERENCE: Record<AiProvider, string[]> = {
  groq: [DEFAULT_GROQ_MODEL, "openai/gpt-oss-20b", "llama-3.3-70b-versatile", "llama-3.1-8b-instant"],
  gemini: [DEFAULT_GEMINI_MODEL, "gemini-2.0-flash", "gemini-1.5-flash", "gemini-2.5-pro"],
};

/** Grup model non-chat yang tidak relevan untuk analisa teks/JSON. */
const NON_CHAT_MODEL = /whisper|speech|tts|guard|embedding|translation|vlm|1-54/i;

export const MAX_INSIGHTS = 8;
export const MAX_ACTIONS = 6;
export const MAX_RISKS = 5;

/**
 * Kuota akun Groq free tier hanya 8.000 token per menit, termasuk token
 * reasoning model. Karena itu prompt harus tetap ringkas: agregat analitik
 * yang memuat sinyal dikirim lebih dulu, sampel transaksi mentah hanya pelengkap.
 */
export const MAX_SAMPLE_SALES = 40;
export const MAX_STORE_ROWS = 12;
export const MAX_PARENT_ROWS = 15;
export const MAX_REORDER_ROWS = 20;
export const MAX_MARKDOWN_ROWS = 20;
export const MAX_ALLOCATION_ROWS = 12;
export const MAX_AFFINITY_ROWS = 10;
export const MAX_TREND_ROWS = 12;

const SEVERITIES: AiSeverity[] = ["critical", "warning", "opportunity", "info"];
const PRIORITIES: AiAction["priority"][] = ["high", "medium", "low"];

export const INSIGHT_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string" },
    summary: { type: "string" },
    insights: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          detail: { type: "string" },
          severity: { type: "string", enum: SEVERITIES },
          evidence: { type: "string" },
        },
        required: ["title", "detail", "severity", "evidence"],
      },
    },
    actions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          step: { type: "string" },
          reason: { type: "string" },
          priority: { type: "string", enum: PRIORITIES },
        },
        required: ["step", "reason", "priority"],
      },
    },
    risks: { type: "array", items: { type: "string" } },
  },
  required: ["headline", "summary", "insights", "actions", "risks"],
} as const;

export const SYSTEM_INSTRUCTION = [
  "Kamu adalah merchandise analyst senior untuk PT Rank Retailindo Atletik, distributor jersey dan apparel olahraga.",
  "Kamu menerima hasil mesin analitik (reorder plan, markdown plan, alokasi, forecast Holt, affinity) dari sistem internal.",
  "Tugasmu menerjemahkan angka-angka itu menjadi keputusan merchandising yang konkret dan bisa langsung ditindaklanjuti.",
  "BAHASA: Seluruh isi laporan WAJIB dalam Bahasa Indonesia. Ini berlaku untuk headline, summary, judul dan isi insights, steps dan reasons pada actions, serta risks. Tanpa kecuali, jangan ada satu pun kalimat berbahasa Inggris. Istilah teknis wajib diterjemahkan: use 'pesanan pembelian' bukan 'purchase order', 'turun harga' bukan 'markdown', 'kirim stok' bukan 'allocate', 'waspada' bukan 'risks'.",
  "Aturan wajib:",
  "- Tulis lugas, tanpa jargon teknis yang tidak perlu.",
  "- Setiap insight wajib menyertakan evidence berupa angka nyata dari data yang diberikan. Jangan mengarang angka.",
  "- Jika data tidak cukup untuk menyimpulkan sesuatu, katakan terus terang di bagian risks.",
  "- Fokus pada tindakan: pesan berapa, turun harga berapa, pindah stok ke outlet mana.",
  "- Jangan mengulang angka yang sama di beberapa insight.",
].join("\n");

export interface ReportContext {
  summary: {
    totalUnits: number;
    totalRevenue: number;
    avgUnitPrice: number;
    parentCount: number;
    skuCount: number;
    storeCount: number;
    days: number;
    unitsPerDay: number;
    onlineShareUnits: number;
    stockRecords: number;
    hasStock: boolean;
  };
  storeStats: Record<string, unknown>[];
  parentStats: Record<string, unknown>[];
  reorder: Record<string, unknown>[];
  markdown: Record<string, unknown>[];
  allocation: Record<string, unknown>[];
  forecast: {
    level: number;
    trend: number;
    avgWeekly: number;
    sigmaWeekly: number;
    mape: number | null;
    wape: number | null;
    weeks: number;
    observedWeeks: number;
    recentActuals: number[];
    forecastPoints: { period: string; value: number }[];
  };
  affinity: Record<string, unknown>[];
  trends: Record<string, unknown>[];
  settings: Settings;
  range: { minDate: string | null; maxDate: string | null };
  sampleSales: Record<string, unknown>[];
  salesRowsTotal: number;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function compact<T extends Record<string, unknown>>(rows: T[], limit: number): T[] {
  return rows.slice(0, limit);
}

/**
 * Membangun konteks yang dikirim ke Gemini. Angka agregat selalu penuh; hanya
 * baris mentah dan tabel panjang yang dipotong agar muat dalam context window.
 */
export function buildReportContext(input: {
  summary: ReportContext["summary"];
  storeStats: Record<string, unknown>[];
  parentStats: Record<string, unknown>[];
  reorder: Record<string, unknown>[];
  markdown: Record<string, unknown>[];
  allocation: Record<string, unknown>[];
  forecast: ReportContext["forecast"];
  affinity: Record<string, unknown>[];
  trends: Record<string, unknown>[];
  settings: Settings;
  range: ReportContext["range"];
  sales: { date: string; store: string; channel: string; parentSku: string; sku: string; size: string; qty: number; unitPrice: number; revenue: number }[];
}): ReportContext {
  const { sales } = input;
  const understock = input.reorder.filter((row) => row.status === "UNDERSTOCK");
  const overstock = input.reorder.filter((row) => row.status === "OVERSTOCK");

  return {
    summary: input.summary,
    storeStats: compact(input.storeStats, MAX_STORE_ROWS),
    parentStats: compact(
      [...input.parentStats].sort(
        (a, b) => Number(b.units ?? 0) - Number(a.units ?? 0),
      ),
      MAX_PARENT_ROWS,
    ),
    reorder: compact([...understock, ...overstock].slice(0, MAX_REORDER_ROWS), MAX_REORDER_ROWS),
    markdown: compact(input.markdown, MAX_MARKDOWN_ROWS),
    allocation: compact(input.allocation, MAX_ALLOCATION_ROWS),
    forecast: {
      ...input.forecast,
      level: round(input.forecast.level),
      trend: round(input.forecast.trend),
      avgWeekly: round(input.forecast.avgWeekly),
      sigmaWeekly: round(input.forecast.sigmaWeekly),
      recentActuals: input.forecast.recentActuals.slice(-16),
      forecastPoints: input.forecast.forecastPoints.slice(0, 12),
    },
    affinity: compact(input.affinity, MAX_AFFINITY_ROWS),
    trends: compact(
      input.trends.filter((row) => Number(row.growthPct ?? 0) > 0),
      MAX_TREND_ROWS,
    ),
    settings: input.settings,
    range: input.range,
    sampleSales: sales.slice(0, MAX_SAMPLE_SALES),
    salesRowsTotal: sales.length,
  };
}

export function buildPrompt(context: ReportContext): string {
  const lines: string[] = [];

  lines.push("Berikut hasil mesin analitik internal Rank Sports Intelligence. Analisa dan berikan rekomendasi merchandising.");
  lines.push("");
  lines.push("== RINGKASAN BISNIS ==");
  lines.push(
    `Periode: ${context.range.minDate ?? "-"} s/d ${context.range.maxDate ?? "-"} (${context.summary.days} hari)`,
  );
  lines.push(
    `Total: ${context.summary.totalUnits} unit / Rp ${context.summary.totalRevenue} / ${context.summary.unitsPerDay.toFixed(2)} unit per hari`,
  );
  lines.push(
    `Katalog: ${context.summary.parentCount} produk induk, ${context.summary.skuCount} SKU, ${context.summary.storeCount} outlet. Harga rata-rata Rp ${Math.round(context.summary.avgUnitPrice)}.`,
  );
  lines.push(
    `Porsi online: ${(context.summary.onlineShareUnits * 100).toFixed(1)}%. Data stok: ${context.summary.hasStock ? `${context.summary.stockRecords} baris` : "TIDAK ADA"}.`,
  );
  lines.push("");
  lines.push("== PENGATURAN SISTEM ==");
  lines.push(
    `Lead time supplier ${context.settings.leadTimeDays} hari, service level Z ${context.settings.serviceLevelZ}, alpha ${context.settings.forecastAlpha}, beta ${context.settings.forecastBeta}, alokasi berdasarkan ${context.settings.allocationBasis}, reserve ${context.settings.allocationReservePct}%.`,
  );
  lines.push(
    `Ladder markdown: ${context.settings.markdownLadder.map((tier) => `${tier.discount}% mulai ${tier.minWeeksCover} minggu cover`).join(", ")}.`,
  );
  lines.push("");

  if (context.storeStats.length > 0) {
    lines.push("== PERFORMA OUTLET ==");
    for (const row of context.storeStats) {
      lines.push(
        `${row.store} (${row.channel}): ${row.units} unit, Rp ${row.revenue}, share ${(Number(row.share ?? 0) * 100).toFixed(1)}%, stok ${row.onHand}, penjualan terakhir ${row.lastSale}`,
      );
    }
    lines.push("");
  }

  lines.push("== PLAN REORDER (produk yang UNDERSTOCK lalu OVERSTOCK) ==");
  if (context.reorder.length === 0) {
    lines.push("(tidak ada produk di status UNDERSTOCK atau OVERSTOCK)");
  } else {
    for (const row of context.reorder) {
      lines.push(
        `${row.parent} | ${row.status} | jual ${row.unitsSold} unit | avg/hari ${Number(row.avgDaily ?? 0).toFixed(2)} | on hand ${row.onHand} | cover ${Number(row.weeksCover ?? 0).toFixed(1)} mg | safety ${row.safetyStock} | ROP ${row.reorderPoint} (${row.reorderPointSource}) | saran order ${row.suggestedOrder}`,
      );
    }
  }
  lines.push("");

  lines.push("== KANDIDAT MARKDOWN ==");
  if (context.markdown.length === 0) {
    lines.push("(tidak ada kandidat markdown)");
  } else {
    for (const row of context.markdown) {
      lines.push(
        `${row.parent} | cover ${Number(row.weeksCover ?? 0).toFixed(1)} mg | ${row.unitsSold} unit | diskon ${row.discount}% (Rp ${row.currentPrice} -> Rp ${row.newPrice}) | nilai berisiko Rp ${row.valueAtRisk} | ${row.basis} | diam ${row.daysSinceLastSale} hari`,
      );
    }
  }
  lines.push("");

  lines.push("== ALOKASI STOK KE OUTLET ==");
  if (context.allocation.length === 0) {
    lines.push("(belum ada alokasi)");
  } else {
    for (const row of context.allocation) {
      lines.push(`${row.store} | histori ${row.units} unit | share ${(Number(row.share ?? 0) * 100).toFixed(1)}% | on hand ${row.onHand} | saran kirim ${row.suggested}`);
    }
  }
  lines.push("");

  lines.push("== FORECAST HOLT LINEAR ==");
  lines.push(
    `Baseline ${context.forecast.level} unit/minggu, tren ${context.forecast.trend >= 0 ? "+" : ""}${context.forecast.trend} unit/minggu, rata-rata ${context.forecast.avgWeekly} unit/minggu, deviasi ${context.forecast.sigmaWeekly}.`,
  );
  lines.push(
    `Akurasi historis: MAPE ${context.forecast.mape === null ? "tidak dihitung" : `${context.forecast.mape.toFixed(1)}%`}, WAPE ${context.forecast.wape === null ? "tidak dihitung" : `${context.forecast.wape.toFixed(1)}%`}. Terhitung dari ${context.forecast.observedWeeks} minggu observasi (${context.forecast.weeks} minggu kalender).`,
  );
  if (context.forecast.recentActuals.length > 0) {
    lines.push(`12 minggu terakhir: ${context.forecast.recentActuals.join(", ")}`);
  }
  if (context.forecast.forecastPoints.length > 0) {
    lines.push(
      `Proyeksi: ${context.forecast.forecastPoints.map((point) => `${point.period}=${point.value}`).join(", ")}`,
    );
  }
  lines.push("");

  if (context.affinity.length > 0) {
    lines.push("== AFINITAS PRODUK (bundling) ==");
    for (const row of context.affinity) {
      lines.push(`${row.anchor} + ${row.partner}: support ${row.support}, confidence ${(Number(row.confidence ?? 0) * 100).toFixed(0)}%, lift ${row.lift}`);
    }
    lines.push("");
  }

  lines.push("== PRODUK TERLARIS ==");
  for (const row of context.parentStats.slice(0, 20)) {
    lines.push(
      `${row.parent}: ${row.units} unit, Rp ${row.revenue}, ${row.skus} SKU, avg Rp ${row.avgPrice}, stok ${row.onHand}, penjualan terakhir ${row.lastSale}`,
    );
  }
  lines.push("");

  lines.push("== PRODUK TRENDING (momentum permintaan naik) ==");
  if (context.trends.length === 0) {
    lines.push("(tidak ada produk dengan momentum naik yang signifikan pada periode ini)");
  } else {
    for (const row of context.trends) {
      lines.push(
        `${row.parent}: ${row.units} unit periode terakhir (sebelumnya ${row.priorUnits}), naik ${row.growthPct}%, rata-rata ${row.avgDaily} unit/hari, ${row.skus} SKU, terakhir jual ${row.lastSale}`,
      );
    }
    lines.push(
      "Tips: produk dengan growthPct tinggi biasanya membutuhkan penambahan stok pengaman agar tidak understock, dan kandidat kuat untuk promosi bundling/afinitas.",
    );
  }
  lines.push("");

  if (context.sampleSales.length > 0) {
    lines.push(
      `== CUPLIKAN TRANSAKSI MENTAH (${context.sampleSales.length} dari ${context.salesRowsTotal} baris, agregat di atas sudah dihitung dari seluruh data) ==`,
    );
    for (const row of context.sampleSales) {
      lines.push(
        `${row.date} | ${row.store} | ${row.parentSku} | ${row.sku} | size ${row.size} | ${row.qty} x Rp ${row.unitPrice}`,
      );
    }
  }

  lines.push("");
  lines.push(
    "Balas dengan: headline (1 kalimat), summary (2-3 kalimat), insights (maks 6, urut dari paling penting), actions (maks 5 langkah konkret), risks (maks 4 hal yang perlu diwaspadai).",
  );
  lines.push(
    "Jika ada produk di seksi PRODUK TRENDING, wajib sertakan insight khusus tentang produk yang sedang menanjak tersebut lengkap dengan angka pertumbuhannya, agar tim merchandising tahu mana yang perlu stok tambahan/promosi.",
  );

  return lines.join("\n");
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/**
 * Membersihkan keluaran Gemini: membuang entri kosong, membatasi jumlah, dan
 * memaksa field wajib terisi supaya UI tidak pernah render undefined.
 */
export function parseGeminiReport(raw: unknown, model: string, generatedAt: string): AiReport {
  const root = asRecord(raw);

  const insights: AiInsight[] = Array.isArray(root.insights)
    ? root.insights.slice(0, MAX_INSIGHTS).map((entry) => {
        const row = asRecord(entry);
        const severity = SEVERITIES.includes(row.severity as AiSeverity) ? (row.severity as AiSeverity) : "info";
        return {
          title: asText(row.title) || "Insight tanpa judul",
          detail: asText(row.detail),
          severity,
          evidence: asText(row.evidence),
        };
      })
    : [];

  const actions: AiAction[] = Array.isArray(root.actions)
    ? root.actions.slice(0, MAX_ACTIONS).map((entry) => {
        const row = asRecord(entry);
        const priority = PRIORITIES.includes(row.priority as AiAction["priority"])
          ? (row.priority as AiAction["priority"])
          : "medium";
        return {
          step: asText(row.step) || "Tindakan tanpa deskripsi",
          reason: asText(row.reason),
          priority,
        };
      })
    : [];

  const risks = Array.isArray(root.risks)
    ? root.risks.map((entry) => asText(entry)).filter((entry) => entry.length > 0).slice(0, MAX_RISKS)
    : [];

  return {
    headline: asText(root.headline) || "Analisa merchandising selesai",
    summary: asText(root.summary),
    insights,
    actions,
    risks,
    model,
    generatedAt,
  };
}

/** Mengambil teks dari payload respons model (OpenAI/Groq maupun Gemini). */
export function extractGeminiText(payload: unknown): string {
  const root = asRecord(payload);
  const choices = Array.isArray(root.choices) ? root.choices : [];
  if (choices.length > 0) {
    const content = asRecord(asRecord(choices[0]).message).content;
    if (typeof content === "string" && content.length > 0) return content;
  }
  const candidates = Array.isArray(root.candidates) ? root.candidates : [];
  if (candidates.length > 0) {
    const parts = asRecord(asRecord(candidates[0]).content).parts;
    if (Array.isArray(parts)) {
      for (const part of parts) {
        const text = asRecord(part).text;
        if (typeof text === "string" && text.length > 0) return text;
      }
    }
  }
  return "";
}

export function parseGeminiJson(text: string): unknown {
  const trimmed = text.trim();
  const withoutFence = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(withoutFence);
  } catch {
    const start = withoutFence.indexOf("{");
    const end = withoutFence.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(withoutFence.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

export class GeminiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "GeminiError";
    this.status = status;
    this.code = code;
  }
}

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Menebak provider dari bentuk API key (AIza... => Gemini, selain itu Groq). */
export function detectProvider(apiKey: string, hint?: AiProvider): AiProvider {
  if (hint === "groq" || hint === "gemini") return hint;
  if (/^AIza[0-9A-Za-z_-]{20,}$/.test(apiKey)) return "gemini";
  return "groq";
}

function modelsFor(provider: AiProvider, model: string): string[] {
  return [model, ...FALLBACK_MODELS[provider].filter((candidate) => candidate !== model)];
}

export type AiModelList = { apiKey: string; provider: AiProvider; model: string; models: string[] };

export function readGeminiConfig(): AiModelList | null {
  const groqKey = (process.env.GROQ_API_KEY ?? "").trim();
  const geminiKey = (process.env.GEMINI_API_KEY ?? "").trim();
  const apiKey = groqKey || geminiKey;
  if (!apiKey) return null;
  const provider: AiProvider = groqKey ? "groq" : "gemini";
  const model = trimText(process.env.GROQ_MODEL) || trimText(process.env.GEMINI_MODEL) || DEFAULT_MODEL_BY_PROVIDER[provider];
  return { apiKey, provider, model, models: modelsFor(provider, model) };
}

/**
 * Menggabungkan konfigurasi dari .env (server) dengan yang tersimpan di
 * pengaturan browser (klien). Key/browser menang atas env bila keduanya ada,
 * supaya user bisa menimpa tanpa mengubah file .env.local.
 */
export function resolveAiConfig(
  server: AiModelList | null,
  client: Partial<AiClientConfig> | null | undefined,
): AiModelList | null {
  const clientKey = trimText(client?.apiKey);
  const apiKey = clientKey || server?.apiKey || "";
  if (!apiKey) return null;
  const hint: AiProvider | undefined =
    (client?.provider === "groq" || client?.provider === "gemini" ? client.provider : undefined) ?? server?.provider;
  const provider = detectProvider(apiKey, hint);
  const model = trimText(client?.model) || server?.model || DEFAULT_MODEL_BY_PROVIDER[provider];
  return { apiKey, provider, model, models: modelsFor(provider, model) };
}

/**
 * Groq dan Gemini mengembalikan 400/404 ketika model tidak ada atau dicabut.
 * Dipakai untuk membedakan "ganti model" dari error yang benar-benar fatal.
 */
function isModelUnavailable(status: number, detail: string): boolean {
  if (status !== 400 && status !== 404) return false;
  const text = detail.toLowerCase();
  return (
    text.includes("model") &&
    (text.includes("not found") ||
      text.includes("does not exist") ||
      text.includes("no longer supported") ||
      text.includes("decommission") ||
      text.includes("deprecat") ||
      text.includes("invalid") ||
      text.includes("unavailable"))
  );
}

function mapChatError(status: number, detail: string, providerName: AiProvider, model: string): GeminiError {
  if (isModelUnavailable(status, detail)) {
    return new GeminiError(
      `Model "${model}" sudah tidak tersedia di ${providerName === "groq" ? "Groq" : "Gemini"}. Pilih model lain di pengaturan atau gunakan deteksi otomatis.`,
      400,
      "MODEL_UNAVAILABLE",
    );
  }
  if (status === 401 || status === 403 || (status === 400 && /api key not valid/i.test(detail))) {
    return new GeminiError(
      `API key ${providerName === "groq" ? "Groq" : "Gemini"} ditolak. Periksa kembali key di pengaturan.`,
      502,
      "UNAUTHORIZED",
    );
  }
  // Groq memakai 413 (bukan hanya 429) ketika kuota token per menit terlampaui.
  const isRateLimited =
    status === 429 ||
    (status === 413 && /tokens per minute|rate limit|too large for model/i.test(detail));
  if (isRateLimited) {
    return new GeminiError(
      `Kuota token per menit ${providerName === "groq" ? "Groq" : "Gemini"} terlampaui. Tunggu sekitar satu menit lalu coba lagi, atau pangkas data.`,
      429,
      "QUOTA_EXCEEDED",
    );
  }
  return new GeminiError(
    `${providerName === "groq" ? "Groq" : "Gemini"} error ${status}: ${detail.slice(0, 200) || "tanpa keterangan"}`,
    502,
    "UPSTREAM_ERROR",
  );
}

function readPromptTokens(payload: unknown, providerName: AiProvider): number | null {
  if (providerName === "groq") {
    const usage = asRecord(asRecord(payload).usage);
    return typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : null;
  }
  const meta = asRecord(asRecord(payload).usageMetadata);
  return typeof meta.promptTokenCount === "number" ? meta.promptTokenCount : null;
}

interface GeminiResponse {
  report: AiReport;
  promptTokens: number | null;
  candidatesUsed: number;
}

export function requestGeminiReport(
  context: ReportContext,
  config: { apiKey: string; provider: AiProvider; model: string; models?: string[] },
  signal?: AbortSignal,
): Promise<GeminiResponse> {
  const prompt = buildPrompt(context);
  const candidates = config.models?.length ? config.models : [config.model];
  const providerName = config.provider;
  const attempt =
    providerName === "gemini"
      ? (apiKey: string, model: string) => attemptGeminiModel(apiKey, model, prompt, signal)
      : (apiKey: string, model: string) => attemptGroqModel(apiKey, model, prompt, signal);

  return fallbackModels(providerName, config.apiKey, candidates, attempt);
}

async function fallbackModels(
  providerName: AiProvider,
  apiKey: string,
  candidates: string[],
  attempt: (apiKey: string, model: string) => Promise<GeminiResponse>,
): Promise<GeminiResponse> {
  let lastError: GeminiError | null = null;
  for (const model of candidates) {
    try {
      return await attempt(apiKey, model);
    } catch (error) {
      if (!(error instanceof GeminiError)) throw error;
      lastError = error;
      // MODEL_UNAVAILABLE = model dicabut/tidak ada; coba kandidat berikutnya.
      if (error.code !== "MODEL_UNAVAILABLE") throw error;
    }
  }
  if (lastError) throw lastError;
  throw new GeminiError(`Tidak ada model AI yang tersedia untuk ${providerName}.`, 502, "NO_MODEL");
}

async function attemptGroqModel(
  apiKey: string,
  model: string,
  prompt: string,
  signal?: AbortSignal,
): Promise<GeminiResponse> {
  let response: Response;
  try {
    response = await fetch(GROQ_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              SYSTEM_INSTRUCTION +
              "\n\nPastikan format balasan murni JSON sesuai struktur ini:\n" +
              JSON.stringify(INSIGHT_RESPONSE_SCHEMA),
          },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.4,
        // Akun free tier dibatasi 8.000 token/menit dan token reasoning ikut
        // dihitung, jadi reasoning dijaga tetap ringan.
        reasoning_effort: "low",
        max_tokens: 3000,
      }),
      signal,
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    throw new GeminiError(
      aborted ? "Permintaan dibatalkan." : "Tidak bisa menghubungi server Groq. Periksa koneksi internet.",
      aborted ? 499 : 502,
      aborted ? "ABORTED" : "NETWORK_ERROR",
    );
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw mapChatError(response.status, detail, "groq", model);
  }

  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  const text = extractGeminiText(payload);
  if (!text) throw new GeminiError("Groq tidak mengembalikan jawaban. Coba lagi.", 502, "EMPTY_RESPONSE");
  const parsed = parseGeminiJson(text);
  if (!parsed) throw new GeminiError("Format jawaban Groq tidak valid. Coba lagi.", 502, "BAD_JSON");

  return {
    report: parseGeminiReport(parsed, model, new Date().toISOString()),
    promptTokens: readPromptTokens(payload, "groq"),
    candidatesUsed: Array.isArray(payload?.choices) ? payload.choices.length : 0,
  };
}

async function attemptGeminiModel(
  apiKey: string,
  model: string,
  prompt: string,
  signal?: AbortSignal,
): Promise<GeminiResponse> {
  const modelPath = model.startsWith("models/") ? model : `models/${model}`;
  const url = `${GEMINI_BASE_URL}/${modelPath}:generateContent?key=${encodeURIComponent(apiKey)}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        systemInstruction: {
          parts: [
            {
              text:
                SYSTEM_INSTRUCTION +
                "\n\nPastikan format balasan murni JSON sesuai struktur ini:\n" +
                JSON.stringify(INSIGHT_RESPONSE_SCHEMA),
            },
          ],
        },
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 3000,
          responseMimeType: "application/json",
          responseSchema: INSIGHT_RESPONSE_SCHEMA,
        },
      }),
      signal,
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    throw new GeminiError(
      aborted ? "Permintaan dibatalkan." : "Tidak bisa menghubungi server Gemini. Periksa koneksi internet.",
      aborted ? 499 : 502,
      aborted ? "ABORTED" : "NETWORK_ERROR",
    );
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw mapChatError(response.status, detail, "gemini", model);
  }

  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  const text = extractGeminiText(payload);
  if (!text) throw new GeminiError("Gemini tidak mengembalikan jawaban. Coba lagi.", 502, "EMPTY_RESPONSE");
  const parsed = parseGeminiJson(text);
  if (!parsed) throw new GeminiError("Format jawaban Gemini tidak valid. Coba lagi.", 502, "BAD_JSON");

  return {
    report: parseGeminiReport(parsed, model, new Date().toISOString()),
    promptTokens: readPromptTokens(payload, "gemini"),
    candidatesUsed: Array.isArray(payload?.candidates) ? payload.candidates.length : 0,
  };
}

export interface AiModelInfo {
  provider: AiProvider;
  models: string[];
  suggested: string;
}

function mapListError(status: number, detail: string, providerName: AiProvider): GeminiError {
  if (status === 401 || status === 403 || (status === 400 && /api key not valid/i.test(detail))) {
    return new GeminiError(
      `API key ${providerName === "groq" ? "Groq" : "Gemini"} ditolak. Periksa kembali key yang dimasukkan.`,
      502,
      "UNAUTHORIZED",
    );
  }
  if (status === 429 || (status === 413 && /rate limit|tokens per minute/i.test(detail))) {
    return new GeminiError(
      `Kuota rate limit ${providerName === "groq" ? "Groq" : "Gemini"} terlampaui. Tunggu sebentar lalu coba lagi.`,
      429,
      "QUOTA_EXCEEDED",
    );
  }
  return new GeminiError(
    `${providerName === "groq" ? "Groq" : "Gemini"} error ${status}: ${detail.slice(0, 160) || "tanpa keterangan"}`,
    502,
    "UPSTREAM_ERROR",
  );
}

/**
 * Mendeteksi provider secara otomatis (dari bentuk key atau percobaan) lalu
 * mengambil daftar model yang tersedia untuk mengisi dropdown di pengaturan.
 */
export async function listProviderModels(apiKey: string, hint?: AiProvider): Promise<AiModelInfo> {
  const primary = detectProvider(apiKey);
  const providers: AiProvider[] =
    hint === "groq" || hint === "gemini"
      ? [hint]
      : [primary, primary === "groq" ? "gemini" : "groq"];

  let lastError: GeminiError | null = null;
  let primaryError: GeminiError | null = null;
  for (const provider of providers) {
    try {
      if (provider === "gemini") return await listGeminiModels(apiKey);
      return await listGroqModels(apiKey);
    } catch (error) {
      if (!(error instanceof GeminiError)) throw error;
      lastError = error;
      if (provider === primary) primaryError = error;
      if (error.code !== "UNAUTHORIZED") throw error;
    }
  }
  throw primaryError ?? lastError ?? new GeminiError("Tidak bisa mendeteksi provider AI.", 502, "DETECT_FAILED");
}

async function listGroqModels(apiKey: string): Promise<AiModelInfo> {
  const response = await fetch(GROQ_MODELS_ENDPOINT, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const detail = await response.text().catch(() => "");
  if (!response.ok) throw mapListError(response.status, detail, "groq");
  const data = asRecord(parseGeminiJson(detail)).data;
  const rows: unknown[] = Array.isArray(data) ? data : [];
  const models = rows
    .map((row) => asRecord(row).id)
    .filter((id): id is string => typeof id === "string" && !NON_CHAT_MODEL.test(id))
    .sort();
  const suggested = MODEL_PREFERENCE.groq.find((model) => models.includes(model)) ?? models[0] ?? "";
  return { provider: "groq", models, suggested };
}

async function listGeminiModels(apiKey: string): Promise<AiModelInfo> {
  const url = `${GEMINI_BASE_URL}/models?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url);
  const detail = await response.text().catch(() => "");
  if (!response.ok) throw mapListError(response.status, detail, "gemini");
  const data = asRecord(parseGeminiJson(detail)).models;
  const rows: unknown[] = Array.isArray(data) ? data : [];
  const models = rows
    .map((row) => {
      const name = asRecord(row).name;
      return typeof name === "string" ? name.replace(/^models\//, "") : "";
    })
    .filter((name) => name.startsWith("gemini-") && !NON_CHAT_MODEL.test(name))
    .sort();
  const suggested = MODEL_PREFERENCE.gemini.find((model) => models.includes(model)) ?? models[0] ?? "";
  return { provider: "gemini", models, suggested };
}

export function isAiRequest(value: unknown): value is { sales: Dataset["sales"]; stock: Dataset["stock"]; settings: Settings } {
  const row = asRecord(value);
  return Array.isArray(row.sales) && Array.isArray(row.stock) && typeof row.settings === "object" && row.settings !== null;
}