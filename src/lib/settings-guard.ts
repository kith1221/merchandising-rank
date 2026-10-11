import type { AiClientConfig, Settings } from "./types";
import { DEFAULT_SETTINGS } from "./types";

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function sanitizeAiConfig(raw: unknown): AiClientConfig {
  if (!raw || typeof raw !== "object") return { provider: "", apiKey: "", model: "" };
  const value = raw as Partial<AiClientConfig>;
  const provider = value.provider === "gemini" || value.provider === "groq" ? value.provider : "";
  return {
    provider,
    apiKey: typeof value.apiKey === "string" ? value.apiKey.trim() : "",
    model: typeof value.model === "string" ? value.model.trim() : "",
  };
}

/**
 * Menormalkan Settings dari sumber tidak dipercaya (IndexedDB, request body).
 * Dipakai bersama oleh DataProvider di browser dan route handler di server
 * supaya nilai yang sampai ke analytics selalu dalam batas aman.
 */
export function sanitizeSettings(value: unknown): Settings {
  if (!value || typeof value !== "object") return DEFAULT_SETTINGS;
  const input = value as Partial<Settings>;
  const ladder =
    Array.isArray(input.markdownLadder) && input.markdownLadder.length > 0
      ? input.markdownLadder
          .filter((tier) => typeof tier?.minWeeksCover === "number" && typeof tier?.discount === "number")
          .sort((a, b) => b.minWeeksCover - a.minWeeksCover)
      : DEFAULT_SETTINGS.markdownLadder;

  return {
    forecastAlpha: clamp(
      typeof input.forecastAlpha === "number" ? input.forecastAlpha : DEFAULT_SETTINGS.forecastAlpha,
      0.05,
      1,
    ),
    forecastBeta: clamp(
      typeof input.forecastBeta === "number" ? input.forecastBeta : DEFAULT_SETTINGS.forecastBeta,
      0,
      1,
    ),
    leadTimeDays: clamp(
      typeof input.leadTimeDays === "number" ? input.leadTimeDays : DEFAULT_SETTINGS.leadTimeDays,
      1,
      365,
    ),
    serviceLevelZ: clamp(
      typeof input.serviceLevelZ === "number" ? input.serviceLevelZ : DEFAULT_SETTINGS.serviceLevelZ,
      0.5,
      3,
    ),
    allocationBasis: input.allocationBasis === "revenue" ? "revenue" : "units",
    allocationReservePct: clamp(
      typeof input.allocationReservePct === "number" ? input.allocationReservePct : DEFAULT_SETTINGS.allocationReservePct,
      0,
      50,
    ),
    poPackSize: Math.max(1, Math.round(input.poPackSize ?? DEFAULT_SETTINGS.poPackSize)),
    poMoq: Math.max(0, Math.round(input.poMoq ?? DEFAULT_SETTINGS.poMoq)),
    markdownLadder: ladder,
    ai: sanitizeAiConfig(input.ai),
  };
}