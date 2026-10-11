"use client";

import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Database,
  Download,
  FileSpreadsheet,
  Loader2,
  Save,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { useData } from "@/lib/data-provider";
import { autoMapStockColumns, buildSales, buildStock, mergeDatasets, summarizeRange } from "@/lib/ingest/dataset";
import {
  CANONICAL_FIELDS,
  FIELD_HINTS,
  FIELD_LABELS,
  autoMapColumns,
  describeMissingFields,
  emptyMapping,
  isMappingUsable,
} from "@/lib/ingest/schema";
import type { ColumnMapping } from "@/lib/ingest/schema";
import {
  detectHeaderRow,
  looksLikeStockSheet,
  normalizeSheetRows,
  parseDelimitedText,
  readFileAsSheets,
} from "@/lib/ingest/tabular";
import type { Sheet } from "@/lib/ingest/tabular";
import type { Dataset } from "@/lib/types";
import {
  SALES_TEMPLATE_HEADERS,
  SALES_TEMPLATE_ROWS,
  STOCK_TEMPLATE_HEADERS,
  STOCK_TEMPLATE_ROWS,
  buildDemoSalesCsv,
  buildDemoStockCsv,
  downloadCsv,
  toCsv,
} from "@/lib/template";
import { dateRangeLabel, formatNumber, formatRupiah } from "@/lib/format";

type ParseState = "idle" | "parsing" | "ready" | "error";

interface Prepared {
  sheets: Sheet[];
  salesSheet: string;
  stockSheet: string | null;
  fileName: string;
}

const SALES_SHEET_HINTS = /penjualan|sales|transaksi|transaction|order|omzet|pembelian|export|data/;

export default function UploadPage() {
  const { dataset, saveDataset, clearDataset, hasSales } = useData();
  const inputRef = useRef<HTMLInputElement>(null);
  const stockInputRef = useRef<HTMLInputElement>(null);

  const [parseState, setParseState] = useState<ParseState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [salesSheet, setSalesSheet] = useState("");
  const [stockSheet, setStockSheet] = useState<string | null>(null);
  const [stockSheets, setStockSheets] = useState<Sheet[]>([]);
  const [stockFileName, setStockFileName] = useState<string | null>(null);
  const [stockParse, setStockParse] = useState<"idle" | "parsing" | "ready">("idle");
  const [headerIndex, setHeaderIndex] = useState(0);
  const [stockHeaderIndex, setStockHeaderIndex] = useState(0);
  const [mapping, setMapping] = useState<ColumnMapping>(emptyMapping());
  const [stockMapping, setStockMapping] = useState<ColumnMapping>(emptyMapping());
  const [mode, setMode] = useState<"replace" | "append">("replace");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [dragging, setDragging] = useState(false);

  const sheet = useMemo(
    () => prepared?.sheets.find((item) => item.name === salesSheet) ?? null,
    [prepared, salesSheet],
  );
  const stockSheetData = useMemo(() => {
    const source = stockSheets.length > 0 ? stockSheets : (prepared?.sheets ?? []);
    return source.find((item) => item.name === stockSheet) ?? null;
  }, [prepared, stockSheets, stockSheet]);

  const headers = useMemo(() => (sheet ? sheet.rows[headerIndex] ?? [] : []), [sheet, headerIndex]);
  const stockHeaders = useMemo(
    () => (stockSheetData ? stockSheetData.rows[stockHeaderIndex] ?? [] : []),
    [stockSheetData, stockHeaderIndex],
  );

  const salesBuild = useMemo(
    () => (sheet ? buildSales(sheet.rows, mapping, headerIndex) : null),
    [sheet, mapping, headerIndex],
  );
  const stockBuild = useMemo(
    () => (stockSheetData ? buildStock(stockSheetData.rows, stockMapping, stockHeaderIndex) : null),
    [stockSheetData, stockMapping, stockHeaderIndex],
  );

  const missing = describeMissingFields(mapping);
  const ready = isMappingUsable(mapping) && (salesBuild?.rows.length ?? 0) > 0;
  const previewRange = useMemo(() => summarizeRange(salesBuild?.rows ?? []), [salesBuild]);
  const previewUnits = useMemo(
    () => (salesBuild?.rows ?? []).reduce((acc, sale) => acc + sale.qty, 0),
    [salesBuild],
  );
  const previewRevenue = useMemo(
    () => (salesBuild?.rows ?? []).reduce((acc, sale) => acc + sale.revenue, 0),
    [salesBuild],
  );
  const stockUnits = useMemo(
    () => (stockBuild?.rows ?? []).reduce((acc, record) => acc + record.qty, 0),
    [stockBuild],
  );

  const stockJoin = useMemo(() => {
    const salesSkus = new Set((salesBuild?.rows ?? []).map((sale) => sale.sku));
    const stockRows = stockBuild?.rows ?? [];
    if (salesSkus.size === 0 || stockRows.length === 0) {
      return { total: stockRows.length, matched: 0, unmatchedSample: [] as string[] };
    }
    let matched = 0;
    const unmatched = new Set<string>();
    for (const record of stockRows) {
      if (salesSkus.has(record.sku)) matched += 1;
      else if (unmatched.size < 4) unmatched.add(record.sku);
    }
    return { total: stockRows.length, matched, unmatchedSample: [...unmatched] };
  }, [salesBuild, stockBuild]);

  function applySheets(next: Prepared) {
    setPrepared(next);
    setParseState("ready");
    setSaveState("idle");

    const salesData = next.sheets.find((item) => item.name === next.salesSheet);
    const detectedHeader = salesData ? detectHeaderRow(salesData.rows) : 0;
    setSalesSheet(next.salesSheet);
    setHeaderIndex(detectedHeader);
    setMapping(salesData ? autoMapColumns(salesData.rows[detectedHeader] ?? []) : emptyMapping());

    const stockData = next.stockSheet
      ? next.sheets.find((item) => item.name === next.stockSheet)
      : null;
    if (stockData) {
      // Sheet stok ikut dalam file penjualan (.xlsx) — ambil alih dari file stok terpisah bila ada.
      setStockSheets(next.sheets);
      setStockFileName(null);
      setStockParse("ready");
      const stockHeader = detectHeaderRow(stockData.rows);
      setStockSheet(next.stockSheet);
      setStockHeaderIndex(stockHeader);
      setStockMapping(stockData ? autoMapStockColumns(stockData.rows[stockHeader] ?? []) : emptyMapping());
    } else if (!stockFileName) {
      setStockSheets([]);
      setStockSheet(null);
      setStockParse("idle");
    }
  }

  async function handleFile(file: File) {
    setParseState("parsing");
    setError(null);
    setSaveState("idle");
    try {
      const sheets = (await readFileAsSheets(file)).filter((item) => item.rows.length > 1);
      if (sheets.length === 0) throw new Error("File tidak berisi data yang bisa dibaca.");

      const named = sheets.find((item) => SALES_SHEET_HINTS.test(item.name) && !looksLikeStockSheet(item.name, item.rows[0]));
      const stockOnly = sheets.find((item) => looksLikeStockSheet(item.name, item.rows[0]));
      const salesCandidate = named ?? sheets.find((item) => item.name !== stockOnly?.name) ?? sheets[0];
      const stockCandidate = stockOnly && stockOnly.name !== salesCandidate.name ? stockOnly : null;

      applySheets({ sheets, salesSheet: salesCandidate.name, stockSheet: stockCandidate?.name ?? null, fileName: file.name });
    } catch (caught) {
      setParseState("error");
      setError(caught instanceof Error ? caught.message : "File gagal dibaca.");
    }
  }

  async function handleStockFile(file: File) {
    setStockParse("parsing");
    setError(null);
    setSaveState("idle");
    try {
      const sheets = (await readFileAsSheets(file)).filter((item) => item.rows.length > 1);
      if (sheets.length === 0) throw new Error("File stok tidak berisi data yang bisa dibaca.");

      const stockCandidate = sheets.find((item) => looksLikeStockSheet(item.name, item.rows[0])) ?? sheets[0];
      const stockHeader = detectHeaderRow(stockCandidate.rows);
      setStockSheets(sheets);
      setStockFileName(file.name);
      setStockSheet(stockCandidate.name);
      setStockHeaderIndex(stockHeader);
      setStockMapping(autoMapStockColumns(stockCandidate.rows[stockHeader] ?? []));
      setStockParse("ready");
    } catch (caught) {
      setStockParse((hasStockFile) => (hasStockFile ? "ready" : "idle"));
      setError(caught instanceof Error ? caught.message : "File stok gagal dibaca.");
    }
  }

  function selectStockSheet(name: string) {
    const target = (stockSheets.length > 0 ? stockSheets : prepared?.sheets ?? []).find((item) => item.name === name);
    if (!target) return;
    const detected = detectHeaderRow(target.rows);
    setStockSheet(name);
    setStockHeaderIndex(detected);
    setStockMapping(autoMapStockColumns(target.rows[detected] ?? []));
  }

  function removeStockFile() {
    setStockSheets([]);
    setStockFileName(null);
    setStockSheet(null);
    setStockParse("idle");
    setStockMapping(emptyMapping());
  }

  function selectSalesSheet(name: string) {
    const target = prepared?.sheets.find((item) => item.name === name);
    if (!target) return;
    const detected = detectHeaderRow(target.rows);
    setSalesSheet(name);
    setHeaderIndex(detected);
    setMapping(autoMapColumns(target.rows[detected] ?? []));
  }

  function rescanHeader() {
    if (!sheet) return;
    const detected = detectHeaderRow(sheet.rows);
    setHeaderIndex(detected);
    setMapping(autoMapColumns(sheet.rows[detected] ?? []));
    if (stockSheetData) {
      const stockHeader = detectHeaderRow(stockSheetData.rows);
      setStockHeaderIndex(stockHeader);
      setStockMapping(autoMapStockColumns(stockSheetData.rows[stockHeader] ?? []));
    }
  }

  function loadDemo() {
    const salesRows = normalizeSheetRows(parseDelimitedText(toCsv(buildDemoSalesCsv()), ","));
    const stockRows = normalizeSheetRows(parseDelimitedText(toCsv(buildDemoStockCsv()), ","));
    applySheets({
      sheets: [
        { name: "Penjualan", rows: salesRows },
        { name: "Stok", rows: stockRows },
      ],
      salesSheet: "Penjualan",
      stockSheet: "Stok",
      fileName: "data-contoh-rank-sports.csv",
    });
  }

  async function commit() {
  if (!salesBuild || !prepared) return;
    const range = summarizeRange(salesBuild.rows);
    const incoming: Dataset = {
      sales: salesBuild.rows,
      stock: stockBuild?.rows ?? [],
      importedAt: new Date().toISOString(),
      sources: [prepared.fileName, ...(stockFileName ? [stockFileName] : [])],
      minDate: range.minDate,
      maxDate: range.maxDate,
    };
    setSaveState("saving");
    try {
      await saveDataset(mode === "append" ? mergeDatasets(dataset, incoming) : incoming);
      setSaveState("saved");
      setError(null);
    } catch (caught) {
      setSaveState("idle");
      setError(
        `Data gagal disimpan ke browser: ${caught instanceof Error ? caught.message : "error tidak diketahui"}. Analitik tetap berjalan dengan data lama.`,
      );
    }
  }

  return (
    <section className="feature-section mt-4" style={{ gridTemplateColumns: "1fr" }}>
      <div className="feature-card glass-panel">
        <div className="feature-header">
          <h3>Upload Data Penjualan</h3>
          <p>
            Sistem menerima <strong>.xlsx</strong>, <strong>.csv</strong>, dan <strong>.tsv</strong>. Nama kolom dideteksi otomatis
            (tanggal, toko, SKU, size, qty, harga) dan bisa dikoreksi manual sebelum disimpan. Data stok opsional: sheet{" "}
            <strong>Stok</strong> dalam .xlsx yang sama terbaca otomatis, atau unggah <strong>file stok terpisah</strong> di bawah.
          </p>
        </div>

        <div
          className={`dropzone ${dragging ? "dragging" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            const file = event.dataTransfer.files?.[0];
            if (file) void handleFile(file);
          }}
        >
          {parseState === "parsing" ? (
            <>
              <Loader2 size={34} className="spin" style={{ color: "var(--accent-primary)" }} />
              <strong>Membaca file...</strong>
            </>
          ) : (
            <>
              <Upload size={34} style={{ color: "var(--accent-primary)" }} />
              <strong>Tarik file ke sini atau klik untuk memilih</strong>
              <span style={{ color: "var(--text-secondary)", fontSize: "13px" }}>
                Excel (.xlsx) atau CSV. Baris judul di atas header tetap aman - sistem mencari baris header sendiri.
              </span>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xlsm,.csv,.tsv,.txt"
            style={{ display: "none" }}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFile(file);
              event.target.value = "";
            }}
          />
          <button className="glow-btn" onClick={() => inputRef.current?.click()} style={{ marginTop: "12px" }}>
            <FileSpreadsheet size={16} /> Pilih File
          </button>
        </div>

        <div className="stock-upload" style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", padding: "12px 16px", marginTop: "12px", border: "1px dashed var(--border-color, rgba(255,255,255,0.16))", borderRadius: "12px" }}>
          <Boxes size={18} style={{ color: "var(--warning)" }} />
          <strong style={{ fontSize: "14px" }}>Data Stok (opsional, file terpisah)</strong>
          <input
            ref={stockInputRef}
            type="file"
            accept=".xlsx,.xlsm,.csv,.tsv,.txt"
            style={{ display: "none" }}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleStockFile(file);
              event.target.value = "";
            }}
          />
          {stockFileName && (
            <span className="badge primary">Stok: {stockFileName}</span>
          )}
          {!stockFileName && (
            <span style={{ color: "var(--text-secondary)", fontSize: "13px" }}>
              CSV polos bisa diisi lewat sini; sheet &quot;Stok&quot; dalam .xlsx terbaca otomatis.
            </span>
          )}
          {stockFileName && (
            <button className="ghost-btn" onClick={removeStockFile} aria-label="Hapus file stok">
              <Trash2 size={14} /> Hapus
            </button>
          )}
          <button className="ghost-btn" onClick={() => stockInputRef.current?.click()} disabled={stockParse === "parsing"}>
            <FileSpreadsheet size={14} /> {stockFileName ? "Perbarui / Ganti Data Stok" : "Pilih File Stok Terpisah"}
          </button>
          {stockParse === "parsing" && (
            <>
              <Loader2 size={16} className="spin" style={{ color: "var(--accent-primary)" }} />
              <span style={{ color: "var(--text-secondary)", fontSize: "13px" }}>Membaca file stok...</span>
            </>
          )}
        </div>

        <div className="toolbar">
          <button className="ghost-btn" onClick={() => downloadCsv("template-penjualan-rank-sports.csv", [SALES_TEMPLATE_HEADERS, ...SALES_TEMPLATE_ROWS])}>
            <Download size={14} /> Template Penjualan
          </button>
          <button className="ghost-btn" onClick={() => downloadCsv("template-stok-rank-sports.csv", [STOCK_TEMPLATE_HEADERS, ...STOCK_TEMPLATE_ROWS])}>
            <Download size={14} /> Template Stok
          </button>
          <button className="ghost-btn" onClick={() => downloadCsv("data-contoh-penjualan.csv", buildDemoSalesCsv())}>
            <Download size={14} /> Unduh Data Contoh
          </button>
          <button className="ghost-btn accent" onClick={loadDemo}>
            <Sparkles size={14} /> Muat Data Contoh ke Form
          </button>
        </div>

        {error && (
          <div className="alert error">
            <AlertTriangle size={18} />
            <span>{error}</span>
          </div>
        )}
      </div>

      {prepared && sheet && (
        <>
          <div className="feature-card glass-panel">
            <div className="feature-header">
              <h3>Pemetaan Kolom</h3>
              <p>
                File: <strong>{prepared.fileName}</strong>. Periksa hasil deteksi otomatis. Baris {headerIndex + 1} dipakai sebagai header.
              </p>
            </div>

            <div className="toolbar">
              {prepared.sheets.length > 1 && (
                <label className="field-inline">
                  Sheet penjualan
                  <select
                    className="select-field"
                    value={salesSheet}
                    onChange={(event) => selectSalesSheet(event.target.value)}
                  >
                    {prepared.sheets.map((item) => (
                      <option key={item.name} value={item.name}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="field-inline">
                Baris header
                <input
                  type="number"
                  min={1}
                  max={Math.max(1, sheet.rows.length)}
                  className="input-field"
                  style={{ width: "90px" }}
                  value={headerIndex + 1}
                  onChange={(event) => {
                    const next = Math.max(0, Math.min(sheet.rows.length - 1, Number(event.target.value) - 1 || 0));
                    setHeaderIndex(next);
                    setMapping(autoMapColumns(sheet.rows[next] ?? []));
                  }}
                />
              </label>
              <button className="ghost-btn" onClick={rescanHeader}>
                Deteksi Ulang
              </button>
              {stockSheets.length > 1 && (
                <label className="field-inline">
                  Sheet stok
                  <select
                    className="select-field"
                    value={stockSheet ?? ""}
                    onChange={(event) => selectStockSheet(event.target.value)}
                  >
                    {stockSheets.map((item) => (
                      <option key={item.name} value={item.name}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {stockSheet && (
                <span className="badge primary">Sheet stok: {stockSheet}</span>
              )}
            </div>

            <div className="mapping-grid">
              {CANONICAL_FIELDS.map((field) => (
                <label key={field} className="mapping-item">
                  <span className="mapping-label">{FIELD_LABELS[field]}</span>
                  <select
                    className="select-field"
                    value={mapping[field]}
                    onChange={(event) => setMapping((current) => ({ ...current, [field]: Number(event.target.value) }))}
                  >
                    <option value={-1}>-- tidak ada --</option>
                    {headers.map((header, index) => (
                      <option key={index} value={index}>
                        {String(header ?? "").trim() || `(kolom ${index + 1})`}
                      </option>
                    ))}
                  </select>
                  <span className="mapping-hint">
                    {mapping[field] >= 0 ? FIELD_HINTS[field] : "Kolom opsional, boleh dikosongkan"}
                  </span>
                </label>
              ))}
            </div>

            {stockSheetData && (
              <div className="mapping-grid" style={{ marginTop: "8px" }}>
                {(["sku", "store", "qty"] as const).map((field) => (
                  <label key={field} className="mapping-item">
                    <span className="mapping-label">Stok - {FIELD_LABELS[field]}</span>
                    <select
                      className="select-field"
                      value={stockMapping[field]}
                      onChange={(event) =>
                        setStockMapping((current) => ({ ...current, [field]: Number(event.target.value) }))
                      }
                    >
                      <option value={-1}>-- tidak ada --</option>
                      {stockHeaders.map((header, index) => (
                        <option key={index} value={index}>
                          {String(header ?? "").trim() || `(kolom ${index + 1})`}
                        </option>
                      ))}
                    </select>
                    <span className="mapping-hint">
                      {field === "sku" ? "Child SKU atau barcode" : field === "store" ? "Kosong = \"Umum\"" : "Stok akhir di lokasi itu"}
                    </span>
                  </label>
                ))}
              </div>
            )}

            {missing.length > 0 && (
              <div className="alert error">
                <AlertTriangle size={18} />
                <span>Kolom wajib belum dipetakan: {missing.join(", ")}</span>
              </div>
            )}
          </div>

          <div className="feature-card glass-panel">
            <div className="feature-header">
              <h3>Pratinjau & Validasi</h3>
              <p>Baris yang gagal dibaca akan dilewati dan dilaporkan di bawah.</p>
            </div>

            <div className="stat-row">
              <div className="mini-stat">
                <span>Baris terbaca</span>
                <strong>{formatNumber(salesBuild?.totalRows ?? 0)}</strong>
              </div>
              <div className="mini-stat">
                <span>Baris valid</span>
                <strong style={{ color: "var(--success)" }}>{formatNumber(salesBuild?.validRows ?? 0)}</strong>
              </div>
              <div className="mini-stat">
                <span>Baris dilewati</span>
                <strong style={{ color: "var(--warning)" }}>{formatNumber(salesBuild?.skipped ?? 0)}</strong>
              </div>
              <div className="mini-stat">
                <span>Total unit</span>
                <strong>{formatNumber(previewUnits)}</strong>
              </div>
              <div className="mini-stat">
                <span>Omzet</span>
                <strong>{formatRupiah(previewRevenue)}</strong>
              </div>
              <div className="mini-stat">
                <span>Periode</span>
                <strong className="is-text">{dateRangeLabel(previewRange.minDate, previewRange.maxDate)}</strong>
              </div>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Tanggal</th>
                    <th>Toko</th>
                    <th>Parent SKU</th>
                    <th>Child SKU</th>
                    <th>Size</th>
                    <th>Qty</th>
                    <th>Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {(salesBuild?.rows ?? []).slice(0, 8).map((sale, index) => (
                    <tr key={`${sale.date}-${sale.sku}-${index}`}>
                      <td>{sale.date}</td>
                      <td style={{ color: "var(--text-secondary)" }}>{sale.store}</td>
                      <td style={{ fontFamily: "monospace" }}>{sale.parentSku}</td>
                      <td style={{ fontFamily: "monospace" }}>{sale.sku}</td>
                      <td>{sale.size}</td>
                      <td style={{ fontWeight: 700 }}>{sale.qty}</td>
                      <td>{sale.revenue.toLocaleString("id-ID")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {(salesBuild?.issues.length ?? 0) > 0 && (
              <details className="issues">
                <summary>{salesBuild?.issues.length} baris bermasalah (klik untuk lihat)</summary>
                <ul>
                  {salesBuild?.issues.map((issue, index) => (
                    <li key={index}>
                      Baris {issue.row}: {issue.message}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {stockSheetData && (
              <div className="alert info">
                <Database size={18} />
                <span>
                  Sheet stok terbaca: <strong>{formatNumber(stockBuild?.validRows ?? 0)}</strong> baris stok per SKU &amp; toko
                  {stockBuild && stockBuild.skipped > 0 ? ` (${stockBuild.skipped} dilewati)` : ""}. Total stok: {formatNumber(stockUnits)} unit.
                </span>
              </div>
            )}

            {stockSheetData && stockJoin.total > 0 && stockJoin.matched === 0 && (
              <div className="alert error">
                <AlertTriangle size={18} />
                <span>
                  Tidak ada satu pun SKU stok yang cocok dengan SKU penjualan ({formatNumber(stockJoin.total)} baris stok, 0 cocok).{" "}
                  weeks of cover, safety stock, dan reorder akan kosong. Tambahkan kolom <strong>SKU/Item Code</strong> yang sama di kedua
                  sheet
                  {stockJoin.unmatchedSample.length > 0 && (
                    <>
                      , contoh stok: <code>{stockJoin.unmatchedSample.join(", ")}</code>
                    </>
                  )}
                  .
                </span>
              </div>
            )}

            {stockSheetData && stockJoin.total > 0 && stockJoin.matched > 0 && stockJoin.matched < stockJoin.total && (
              <div className="alert info">
                <AlertTriangle size={18} />
                <span>
                  {formatNumber(stockJoin.matched)} dari {formatNumber(stockJoin.total)} SKU stok cocok dengan penjualan. Sisanya
                  diabaikan karena tidak ada riwayat penjualan
                  {stockJoin.unmatchedSample.length > 0 && (
                    <>
                      , contoh: <code>{stockJoin.unmatchedSample.join(", ")}</code>
                    </>
                  )}
                  .
                </span>
              </div>
            )}

            {((salesBuild?.synthesizedSku ?? 0) > 0 || (stockBuild?.synthesizedSku ?? 0) > 0) && (
              <div className="alert info">
                <AlertTriangle size={18} />
                <span>
                  File tidak punya kolom Child SKU. Sistem membentuk SKU dari <strong>Parent + Size</strong>
                  {salesBuild && salesBuild.synthesizedSku > 0 && ` (${formatNumber(salesBuild.synthesizedSku)} baris penjualan)`}
                  {stockBuild && stockBuild.synthesizedSku > 0 && ` (${formatNumber(stockBuild.synthesizedSku)} baris stok)`} sehingga setiap
                  size tetap terpisah. Kalau sheet stok memakai kode item yang berbeda, tambahkan kolom SKU yang sama agar stok ikut
                  terhitung.
                </span>
              </div>
            )}
          </div>

          <div className="feature-card glass-panel">
            <div className="feature-header">
              <h3>Simpan ke Database</h3>
              <p>Data disimpan di IndexedDB browser ini dan langsung dipakai semua modul analitik.</p>
            </div>

            <div className="toolbar">
              <label className="radio">
                <input type="radio" checked={mode === "replace"} onChange={() => setMode("replace")} />
                <span>Ganti data lama</span>
              </label>
              <label className="radio">
                <input type="radio" checked={mode === "append"} onChange={() => setMode("append")} />
                <span>Tambahkan ke data lama</span>
              </label>
            </div>

            {hasSales && (
              <div className="alert info">
                <Database size={18} />
                <span>
                  Data aktif: {formatNumber(dataset.sales.length)} baris penjualan, {formatNumber(dataset.stock.length)} baris stok,{" "}
                  {dateRangeLabel(dataset.minDate, dataset.maxDate)}
                  {dataset.sources.length > 0 ? ` (${dataset.sources.join(", ")})` : ""}
                </span>
              </div>
            )}

            <div className="toolbar">
              <button
                className="glow-btn"
                onClick={() => void commit()}
                disabled={!ready || saveState === "saving"}
                style={{ opacity: ready && saveState !== "saving" ? 1 : 0.4, cursor: ready ? "pointer" : "not-allowed" }}
              >
                {saveState === "saving" ? <Loader2 size={16} className="spin" /> : <Save size={16} />} Simpan &amp; Hitung
              </button>
              {saveState === "saved" && (
                <span className="alert success" style={{ margin: 0 }}>
                  <CheckCircle2 size={18} /> Tersimpan. Buka menu Overview / Purchasing untuk melihat hasilnya.
                </span>
              )}
              {hasSales && (
                <button
                  className="ghost-btn danger"
                  onClick={() => {
                    if (!window.confirm("Hapus semua data penjualan dari browser ini?")) return;
                    void clearDataset()
                      .then(() => {
                        setSaveState("idle");
                        setError(null);
                      })
                      .catch((caught: unknown) => {
                        setError(caught instanceof Error ? caught.message : "Gagal menghapus data.");
                      });
                  }}
                >
                  <Trash2 size={14} /> Hapus Semua Data
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
