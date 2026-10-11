import { normalizeHeader } from "../parse-utils";

export const CANONICAL_FIELDS = [
  "date",
  "store",
  "channel",
  "parentSku",
  "sku",
  "size",
  "qty",
  "unitPrice",
  "revenue",
  "safetyStock",
  "reorderPoint",
] as const;

export type CanonicalField = (typeof CANONICAL_FIELDS)[number];

export type ColumnMapping = Record<CanonicalField, number>;

export const FIELD_LABELS: Record<CanonicalField, string> = {
  date: "Tanggal",
  store: "Toko / Outlet / Kanal",
  channel: "Tipe Kanal",
  parentSku: "Parent SKU",
  sku: "Child SKU",
  size: "Ukuran (Size)",
  qty: "Qty Terjual",
  unitPrice: "Harga Satuan",
  revenue: "Total Nilai",
  safetyStock: "Safety Stock (opsional)",
  reorderPoint: "Reorder Point (opsional)",
};

export const FIELD_HINTS: Record<CanonicalField, string> = {
  date: "Wajib. Contoh: 05/01/2026",
  store: "Nama cabang atau channel. Default 'Umum' bila kosong",
  channel: "Kosong = deteksi otomatis dari nama toko",
  parentSku: "Kosong = diturunkan dari Child SKU",
  sku: "Wajib. Barcode juga bisa dipakai",
  size: "Kosong = diturunkan dari Child SKU",
  qty: "Wajib. Angka positif",
  unitPrice: "Kosong = diturunkan dari Total Nilai",
  revenue: "Kosong = Qty x Harga Satuan",
  safetyStock: "Hanya untuk sheet stok. Kosong = dihitung dari service level",
  reorderPoint: "Hanya untuk sheet stok. Kosong = dihitung dari lead time + safety stock",
};

const FIELD_PRIORITY: CanonicalField[] = [
  "date",
  "qty",
  "sku",
  "parentSku",
  "revenue",
  "unitPrice",
  "size",
  "store",
  "channel",
  "safetyStock",
  "reorderPoint",
];

const ALIASES: Record<CanonicalField, string[]> = {
  date: [
    "tanggal", "tgl", "date", "tanggaltransaksi", "tgltransaksi", "tgltrx",
    "transactiondate", "orderdate", "invoicedate", "datedorder", "createdat",
    "waktu", "datetime", "tanggalpenjualan", "tanggalbeli", "periode", "period",
  ],
  store: [
    "toko", "store", "namatoko", "outlet", "namoutlet", "cabang", "namacabang",
    "lokasi", "location", "gerai", "branch", "gudang", "warehouse", "shop",
    "tokoonline", "storecode", "kodetoko", "namaoutlet",
  ],
  channel: [
    "channel", "kanal", "saleschannel", "tipe", "tipetoko", "type", "source",
    "sumber", "platform", "marketplace", "saleschanneltype",
  ],
  parentSku: [
    "parentsku", "parent", "model", "modelname", "produk", "product",
    "productname", "namaproduk", "artikel", "style", "stylecode", "itemname",
    "namabarang", "productgroup",
  ],
  sku: [
    "sku", "skuid", "childsku", "child", "barcode", "kodesku", "itemcode",
    "productcode", "kodeproduk", "kodebarang", "variant", "skuinduk", "skucode",
  ],
  size: [
    "size", "ukuran", "uk", "sizeeu", "eusize", "sizechart", "sizefootwear",
    "sizerunning", "sizeapparel", "ukuransepatu", "sizebarang",
  ],
  qty: [
    "qty", "quantity", "jumlah", "jml", "qtyterjual", "jumlahterjual",
    "sold", "unitsold", "qtysold", "totalqty", "quantitysold", "qtyterjualan",
    "jumlahunit", "totalunit", "terjual",
  ],
  unitPrice: [
    "hargasatuan", "harga", "price", "unitprice", "hargaunit", "hargajual",
    "sellingprice", "netprice", "hargabersih", "hargapenjualan", "hargamodal",
  ],
  revenue: [
    "total", "totalharga", "amount", "nominal", "jumlahharga", "totalpenjualan",
    "grandtotal", "subtotal", "pendapatan", "revenue", "nilai", "totalsales",
    "totalpendapatan", "totalbayar", "totalhargabarang", "omzet",
  ],
  safetyStock: ["safetystock", "safetystok", "cadangan", "stokcadangan", "buffer"],
  reorderPoint: ["reorderpoint", "titikreorder", "titikpesan", "reorderqty", "reorder"],
};

const GENERIC_FUZZY_ALIASES = new Set(["tipe", "type", "sisa", "smu", "jml", "kode", "nilai", "nama"]);

const NORMALIZED_ALIASES: Record<CanonicalField, Set<string>> = (() => {
  const result = {} as Record<CanonicalField, Set<string>>;
  for (const field of CANONICAL_FIELDS) {
    result[field] = new Set(ALIASES[field].map(normalizeHeader));
  }
  return result;
})();

export function emptyMapping(): ColumnMapping {
  return {
    date: -1,
    store: -1,
    channel: -1,
    parentSku: -1,
    sku: -1,
    size: -1,
    qty: -1,
    unitPrice: -1,
    revenue: -1,
    safetyStock: -1,
    reorderPoint: -1,
  };
}

export function countMappedColumns(mapping: ColumnMapping): number {
  return CANONICAL_FIELDS.filter((field) => mapping[field] >= 0).length;
}

export function autoMapColumns(headers: unknown[]): ColumnMapping {
  const mapping = emptyMapping();
  const normalized = headers.map(normalizeHeader);
  const usedColumns = new Set<number>();

  for (const field of FIELD_PRIORITY) {
    const index = normalized.findIndex(
      (column, position) => column && !usedColumns.has(position) && NORMALIZED_ALIASES[field].has(column),
    );
    if (index >= 0) {
      mapping[field] = index;
      usedColumns.add(index);
    }
  }

  interface FuzzyCandidate {
    field: CanonicalField;
    column: number;
    aliasLength: number;
  }

  const candidates: FuzzyCandidate[] = [];
  for (const field of FIELD_PRIORITY) {
    for (const alias of NORMALIZED_ALIASES[field]) {
      if (alias.length < 3 || GENERIC_FUZZY_ALIASES.has(alias)) continue;
      normalized.forEach((column, position) => {
        if (!column || column === alias) return;
        if (column.includes(alias)) {
          candidates.push({ field, column: position, aliasLength: alias.length });
        }
      });
    }
  }

  candidates.sort((a, b) => {
    if (b.aliasLength !== a.aliasLength) return b.aliasLength - a.aliasLength;
    return FIELD_PRIORITY.indexOf(a.field) - FIELD_PRIORITY.indexOf(b.field);
  });

  const takenFields = new Set<CanonicalField>(FIELD_PRIORITY.filter((field) => mapping[field] >= 0));
  for (const candidate of candidates) {
    if (takenFields.has(candidate.field) || usedColumns.has(candidate.column)) continue;
    mapping[candidate.field] = candidate.column;
    takenFields.add(candidate.field);
    usedColumns.add(candidate.column);
  }

  if (mapping.store < 0 && mapping.channel >= 0) mapping.store = mapping.channel;

  return mapping;
}

export function isMappingUsable(mapping: ColumnMapping): boolean {
  const hasIdentity = mapping.sku >= 0 || mapping.parentSku >= 0;
  return mapping.date >= 0 && mapping.qty >= 0 && hasIdentity;
}

export function describeMissingFields(mapping: ColumnMapping): string[] {
  const missing: string[] = [];
  if (mapping.date < 0) missing.push("Tanggal");
  if (mapping.qty < 0) missing.push("Qty Terjual");
  if (mapping.sku < 0 && mapping.parentSku < 0) missing.push("Child SKU / Parent SKU");
  return missing;
}
