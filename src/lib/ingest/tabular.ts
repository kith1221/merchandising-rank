import { normalizeHeader } from "../parse-utils";

export type CellValue = string | number | boolean | Date | null;
export type Row = CellValue[];
export interface Sheet {
  name: string;
  rows: Row[];
}

const DELIMITERS = [",", ";", "\t", "|"];

export function sniffDelimiter(sample: string): string {
  const firstLine = sample.split(/\r?\n/)[0] ?? "";
  let best = ",";
  let bestCount = 0;
  for (const delimiter of DELIMITERS) {
    let count = 0;
    let inQuotes = false;
    for (const char of firstLine) {
      if (char === '"') inQuotes = !inQuotes;
      else if (char === delimiter && !inQuotes) count += 1;
    }
    if (count > bestCount) {
      bestCount = count;
      best = delimiter;
    }
  }
  return best;
}

export function parseDelimitedText(text: string, delimiter: string): Row[] {
  const rows: Row[] = [];
  let row: Row = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    row.push(field.trim());
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      pushField();
    } else if (char === "\n") {
      pushRow();
    } else if (char === "\r") {
      continue;
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) pushRow();
  return rows;
}

function isBlankRow(row: Row): boolean {
  return row.every((cell) => cell === null || cell === undefined || String(cell).trim() === "");
}

function width(row: Row): number {
  let last = -1;
  row.forEach((cell, index) => {
    if (cell !== null && cell !== undefined && String(cell).trim() !== "") last = index;
  });
  return last + 1;
}

export function normalizeSheetRows(rows: Row[]): Row[] {
  const maxWidth = rows.reduce((max, row) => Math.max(max, width(row)), 0);
  const cleaned = rows
    .filter((row) => !isBlankRow(row))
    .map((row) => {
      const padded: Row = [];
      for (let index = 0; index < maxWidth; index += 1) padded.push(row[index] ?? null);
      return padded;
    });
  while (cleaned.length > 0 && isBlankRow(cleaned[cleaned.length - 1])) cleaned.pop();
  return cleaned;
}

export function detectHeaderRow(rows: Row[], scanLimit = 12): number {
  const limit = Math.min(rows.length, scanLimit);
  let bestIndex = 0;
  let bestScore = -1;

  for (let index = 0; index < limit; index += 1) {
    const row = rows[index];
    const filled = row.filter((cell) => cell !== null && String(cell).trim() !== "").length;
    const textCells = row.filter((cell) => typeof cell === "string" && cell.trim().length > 0).length;
    if (filled < 2 || textCells < 2) continue;
    const score = scoreHeader(row);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }

  return bestScore > 0 ? bestIndex : 0;
}

function scoreHeader(row: Row): number {
  const cells = row.map((cell) => String(cell ?? "").toLowerCase().replace(/[^a-z0-9]+/g, ""));
  const known = new Set([
    "tanggal", "date", "tgl", "toko", "store", "sku", "barcode", "qty", "jumlah",
    "harga", "hargasatuan", "total", "size", "ukuran", "produk", "product",
    "channel", "kanal", "parentsku", "jumlahterjual", "tanggaltransaksi",
  ]);
  return cells.filter((cell) => cell.length > 1 && known.has(cell)).length;
}

export async function readFileAsSheets(file: File): Promise<Sheet[]> {
  const name = file.name.toLowerCase();

  if (name.endsWith(".csv") || name.endsWith(".txt") || name.endsWith(".tsv")) {
    const text = (await file.text()).replace(/^\uFEFF/, "");
    const delimiter = name.endsWith(".tsv") ? "\t" : sniffDelimiter(text.slice(0, 4000));
    return [{ name: file.name, rows: normalizeSheetRows(parseDelimitedText(text, delimiter)) }];
  }

  if (name.endsWith(".xlsx") || name.endsWith(".xlsm")) {
    const { default: readXlsxFile } = await import("read-excel-file/browser");
    const sheets = await readXlsxFile(file);
    return sheets.map((sheet) => ({ name: sheet.sheet, rows: normalizeSheetRows(sheet.data as Row[]) }));
  }

  if (name.endsWith(".xls")) {
    throw new Error(
      "Format .xls (Excel 97-2003) belum didukung. Buka di Excel lalu simpan ulang sebagai .xlsx atau .csv.",
    );
  }

  throw new Error("Format file tidak dikenali. Gunakan .xlsx, .csv, atau .tsv.");
}

export function looksLikeStockSheet(sheetName: string, headers: unknown[]): boolean {
  const compact = headers.map((cell) => normalizeHeader(cell)).join(" ");
  return /(stok|stock|onhand|availableqty|remainingqty|persediaan|inventory)/.test(compact);
}
