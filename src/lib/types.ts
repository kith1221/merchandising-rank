export type ChannelKind = "OFFLINE" | "ONLINE";

export interface Sale {
  date: string;
  store: string;
  channel: ChannelKind;
  parentSku: string;
  sku: string;
  size: string;
  qty: number;
  unitPrice: number;
  revenue: number;
}

export interface StockRecord {
  sku: string;
  store: string;
  qty: number;
  safetyStock?: number;
  reorderPoint?: number;
}

export interface ImportIssue {
  row: number;
  message: string;
}

export interface ImportResult {
  sales: Sale[];
  stock: StockRecord[];
  issues: ImportIssue[];
  sheetName: string;
  stockSheetName: string | null;
  totalRows: number;
  validRows: number;
}

export interface Dataset {
  sales: Sale[];
  stock: StockRecord[];
  importedAt: string;
  sources: string[];
  minDate: string | null;
  maxDate: string | null;
}

export interface MarkdownTier {
  minWeeksCover: number;
  discount: number;
}

export type AiProvider = "groq" | "gemini";

export interface AiClientConfig {
  provider: AiProvider | "";
  apiKey: string;
  model: string;
}

export interface Settings {
  forecastAlpha: number;
  forecastBeta: number;
  leadTimeDays: number;
  serviceLevelZ: number;
  allocationBasis: "units" | "revenue";
  allocationReservePct: number;
  poPackSize: number;
  poMoq: number;
  markdownLadder: MarkdownTier[];
  ai: AiClientConfig;
}

export const DEFAULT_SETTINGS: Settings = {
  forecastAlpha: 0.4,
  forecastBeta: 0.15,
  leadTimeDays: 45,
  serviceLevelZ: 1.65,
  allocationBasis: "units",
  allocationReservePct: 5,
  poPackSize: 6,
  poMoq: 0,
  markdownLadder: [
    { minWeeksCover: 26, discount: 40 },
    { minWeeksCover: 16, discount: 30 },
    { minWeeksCover: 10, discount: 20 },
    { minWeeksCover: 6, discount: 10 },
    { minWeeksCover: 0, discount: 0 },
  ],
  ai: { provider: "", apiKey: "", model: "" },
};

export const EMPTY_DATASET: Dataset = {
  sales: [],
  stock: [],
  importedAt: "",
  sources: [],
  minDate: null,
  maxDate: null,
};

export type AiSeverity = "critical" | "warning" | "opportunity" | "info";

export interface AiInsight {
  title: string;
  detail: string;
  severity: AiSeverity;
  evidence: string;
}

export interface AiAction {
  step: string;
  reason: string;
  priority: "high" | "medium" | "low";
}

export interface AiReport {
  headline: string;
  summary: string;
  insights: AiInsight[];
  actions: AiAction[];
  risks: string[];
  model: string;
  generatedAt: string;
}
