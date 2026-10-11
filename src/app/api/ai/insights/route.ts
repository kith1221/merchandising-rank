import { NextResponse } from "next/server";
import {
  buildReportContext,
  GeminiError,
  isAiRequest,
  readGeminiConfig,
  requestGeminiReport,
  resolveAiConfig,
} from "@/lib/gemini";
import {
  allocateByShare,
  forecastWeekly,
  markdownPlan,
  productAffinity,
  productTrends,
  reorderPlan,
  summarize,
} from "@/lib/analytics";
import { DEFAULT_SETTINGS } from "@/lib/types";
import { sanitizeSettings } from "@/lib/settings-guard";
import { summarizeRange } from "@/lib/ingest/dataset";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_ROWS = 50_000;
const REQUEST_TIMEOUT_MS = 60_000;

function fail(message: string, status: number, code: string) {
  return NextResponse.json({ ok: false, error: message, code }, { status });
}

export async function GET() {
  const config = readGeminiConfig();
  return NextResponse.json({
    ok: true,
    configured: config !== null,
    envConfigured: config !== null,
    configFromEnv: config ? { provider: config.provider, model: config.model } : null,
    envModel: config?.model ?? null,
  });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("Body harus berupa JSON yang valid.", 400, "BAD_JSON");
  }

  if (!isAiRequest(body)) {
    return fail("Payload harus berisi sales, stock, dan settings.", 400, "BAD_PAYLOAD");
  }

  if (body.sales.length === 0) {
    return fail("Tidak ada data penjualan untuk dianalisa. Upload data terlebih dahulu.", 400, "NO_SALES");
  }

  if (body.sales.length > MAX_ROWS) {
    return fail(`Data terlalu besar (${body.sales.length} baris). Maksimal ${MAX_ROWS} baris per permintaan.`, 413, "TOO_LARGE");
  }

  const settings = sanitizeSettings({ ...DEFAULT_SETTINGS, ...body.settings });
  // Key/model dari pengaturan browser menang; bila kosong, pakai .env.
  const config = resolveAiConfig(readGeminiConfig(), settings.ai);
  if (!config) {
    return fail(
      "API key AI belum diatur. Tambahkan di halaman Settings (Deteksi Otomatis) atau atur GROQ_API_KEY/GEMINI_API_KEY di .env.local.",
      503,
      "NOT_CONFIGURED",
    );
  }

  try {
    const sales = body.sales;
    const stock = body.stock;
    const range = summarizeRange(sales);
    const summary = summarize(sales, stock, range.minDate, range.maxDate);
    const reorder = reorderPlan(sales, stock, settings, range.minDate, range.maxDate);
    const markdown = markdownPlan(sales, stock, settings, range.minDate, range.maxDate);
    const affinity = productAffinity(sales, 20);
    const trends = productTrends(sales);
    const forecast = forecastWeekly(sales, settings.forecastAlpha, settings.forecastBeta, 12);
    const totalUnits = sales.reduce((acc, row) => acc + row.qty, 0);
    const allocation = allocateByShare(sales, stock, totalUnits, settings);

    const context = buildReportContext({
      summary: {
        totalUnits: summary.totalUnits,
        totalRevenue: summary.totalRevenue,
        avgUnitPrice: summary.avgUnitPrice,
        parentCount: summary.parentCount,
        skuCount: summary.skuCount,
        storeCount: summary.storeCount,
        days: summary.days,
        unitsPerDay: summary.unitsPerDay,
        onlineShareUnits: summary.onlineShareUnits,
        stockRecords: summary.stockRecords,
        hasStock: summary.hasStock,
      },
      storeStats: summary.storeStats.map((row) => ({ ...row })),
      parentStats: summary.parentStats.map((row) => ({ ...row })),
      reorder: reorder.map((row) => ({ ...row })),
      markdown: markdown.map((row) => ({ ...row })),
      allocation: allocation.map((row) => ({ ...row })),
      forecast: {
        level: forecast.level,
        trend: forecast.trend,
        avgWeekly: forecast.avgWeekly,
        sigmaWeekly: forecast.sigmaWeekly,
        mape: forecast.mape,
        wape: forecast.wape,
        weeks: forecast.weeks,
        observedWeeks: forecast.observedWeeks,
        recentActuals: forecast.points.filter((point) => point.actual !== null).map((point) => point.actual ?? 0),
        forecastPoints: forecast.points
          .filter((point) => point.forecast !== null)
          .map((point) => ({ period: point.period, value: Math.round((point.forecast ?? 0) * 100) / 100 })),
      },
      affinity: affinity.map((row) => ({ ...row })),
      trends: trends.map((row) => ({ ...row })),
      settings,
      range,
      sales: sales.map((row) => ({
        date: row.date,
        store: row.store,
        channel: row.channel,
        parentSku: row.parentSku,
        sku: row.sku,
        size: row.size,
        qty: row.qty,
        unitPrice: row.unitPrice,
        revenue: row.revenue,
      })),
    });

    const result = await requestGeminiReport(context, config, AbortSignal.timeout(REQUEST_TIMEOUT_MS));

    return NextResponse.json({
      ok: true,
      report: result.report,
      promptTokens: result.promptTokens,
      salesRows: sales.length,
      stockRows: stock.length,
      trends,
    });
  } catch (error) {
    if (error instanceof GeminiError) {
      const status = error.code === "QUOTA_EXCEEDED" ? 429 : error.status;
      return fail(error.message, status, error.code);
    }
    return fail("Terjadi kesalahan tak terduga saat menganalisa data.", 500, "INTERNAL_ERROR");
  }
}