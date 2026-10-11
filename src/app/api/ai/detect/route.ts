import { NextResponse } from "next/server";
import { GeminiError, listProviderModels } from "@/lib/gemini";
import type { AiProvider } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isProvider(value: unknown): value is AiProvider {
  return value === "groq" || value === "gemini";
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Body harus berupa JSON yang valid.", code: "BAD_JSON" }, { status: 400 });
  }

  const row = body && typeof body === "object" ? (body as { apiKey?: unknown; provider?: unknown }) : null;
  if (!row || typeof row.apiKey !== "string" || row.apiKey.trim() === "") {
    return NextResponse.json({ ok: false, error: "Masukkan API key terlebih dahulu.", code: "EMPTY_KEY" }, { status: 400 });
  }
  const apiKey = row.apiKey.trim();

  try {
    const info = await listProviderModels(apiKey, isProvider(row.provider) ? row.provider : undefined);
    return NextResponse.json({
      ok: true,
      provider: info.provider,
      models: info.models,
      suggestedModel: info.suggested,
    });
  } catch (error) {
    if (error instanceof GeminiError) {
      const status = error.code === "QUOTA_EXCEEDED" ? 429 : error.status;
      return NextResponse.json({ ok: false, error: error.message, code: error.code }, { status });
    }
    return NextResponse.json({ ok: false, error: "Gagal mendeteksi provider AI.", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}