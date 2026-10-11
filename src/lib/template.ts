export const SALES_TEMPLATE_HEADERS = [
  "Tanggal",
  "Toko",
  "Kanal",
  "Parent SKU",
  "Child SKU",
  "Size",
  "Qty",
  "Harga Satuan",
  "Total",
];

export const SALES_TEMPLATE_ROWS = [
  ["05/01/2026", "Rank Sports - Jabodetabek", "OFFLINE", "ORT-CTL", "ORT-CTL-41", "41", 2, 1499000, 2998000],
  ["05/01/2026", "Shopee Official Store", "ONLINE", "ORT-CTL", "ORT-CTL-41", "41", 1, 1399000, 1399000],
  ["06/01/2026", "Rank Sports - Bandung", "OFFLINE", "RNK-JER", "RNK-JER-M", "M", 5, 349000, 1745000],
];

export const STOCK_TEMPLATE_HEADERS = ["Child SKU", "Toko", "Stok"];
export const STOCK_TEMPLATE_ROWS = [
  ["ORT-CTL-41", "Rank Sports - Jabodetabek", 12],
  ["ORT-CTL-40", "Rank Sports - Bandung", 5],
];

export function toCsv(rows: (string | number)[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const text = cell === null || cell === undefined ? "" : String(cell);
          return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        })
        .join(","),
    )
    .join("\r\n");
}

export function downloadCsv(filename: string, rows: (string | number)[][]): void {
  const blob = new Blob([`\uFEFF${toCsv(rows)}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function mulberry32(seed: number): () => number {
  let value = seed;
  return () => {
    value |= 0;
    value = (value + 0x6d2b79f5) | 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface DemoProduct {
  parent: string;
  sizes: string[];
  price: number;
  base: number;
  trend: number;
  onlineBoost: number;
}

const DEMO_STORES = [
  { name: "Rank Sports - Jabodetabek", channel: "OFFLINE", weight: 0.34 },
  { name: "Rank Sports - Bandung", channel: "OFFLINE", weight: 0.2 },
  { name: "Rank Sports - Semarang", channel: "OFFLINE", weight: 0.14 },
  { name: "Rank Sports - Surabaya", channel: "OFFLINE", weight: 0.12 },
  { name: "Shopee Official Store", channel: "ONLINE", weight: 0.13 },
  { name: "Tokopedia Official Store", channel: "ONLINE", weight: 0.07 },
];

const DEMO_PRODUCTS: DemoProduct[] = [
  { parent: "ORT-CTL", sizes: ["38", "39", "40", "41", "42", "43", "44"], price: 1499000, base: 46, trend: 0.0025, onlineBoost: 1.35 },
  { parent: "ASICS-NB24", sizes: ["39", "40", "41", "42", "43"], price: 2199000, base: 14, trend: -0.0012, onlineBoost: 1.1 },
  { parent: "RNK-JER", sizes: ["S", "M", "L", "XL", "XXL"], price: 349000, base: 30, trend: 0.001, onlineBoost: 1.6 },
  { parent: "RNK-SOCK", sizes: ["ONE SIZE"], price: 95000, base: 26, trend: 0.0004, onlineBoost: 1.2 },
];

const SIZE_WEIGHTS: Record<string, number[]> = {
  "ORT-CTL": [5, 12, 22, 28, 18, 10, 5],
  "ASICS-NB24": [10, 20, 28, 24, 18],
  "RNK-JER": [14, 32, 28, 18, 8],
  "RNK-SOCK": [100],
};

export function buildDemoSalesCsv(weeks = 104): (string | number)[][] {
  const random = mulberry32(20260105);
  const rows: (string | number)[][] = [SALES_TEMPLATE_HEADERS];
  const start = Date.UTC(2024, 0, 8);

  for (let week = 0; week < weeks; week += 1) {
    const date = new Date(start + week * 7 * 86_400_000);
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    const iso = `${date.getUTCFullYear()}-${month}-${day}`;

    for (const store of DEMO_STORES) {
      for (const product of DEMO_PRODUCTS) {
        const seasonality = 1 + 0.35 * Math.sin(((week % 52) / 52) * Math.PI * 2);
        const growth = 1 + product.trend * week;
        const channelFactor = store.channel === "ONLINE" ? product.onlineBoost : 1;
        const noise = 0.6 + random() * 0.9;
        const expected = product.base * store.weight * seasonality * growth * channelFactor * noise;
        if (expected < 1) continue;

        const weights = SIZE_WEIGHTS[product.parent];
        for (let index = 0; index < product.sizes.length; index += 1) {
          const qty = Math.round(expected * (weights[index] / 100) * (0.7 + random() * 0.6));
          if (qty <= 0) continue;
          const size = product.sizes[index];
          const discount = store.channel === "ONLINE" ? 0.93 : 1;
          rows.push([
            iso,
            store.name,
            store.channel,
            product.parent,
            `${product.parent}-${size === "ONE SIZE" ? "OS" : size}`,
            size,
            qty,
            Math.round(product.price * discount),
            Math.round(qty * product.price * discount),
          ]);
        }
      }
    }
  }

  return rows;
}

export function buildDemoStockCsv(): (string | number)[][] {
  const random = mulberry32(777);
  const rows: (string | number)[][] = [STOCK_TEMPLATE_HEADERS];

  for (const store of DEMO_STORES) {
    for (const product of DEMO_PRODUCTS) {
      for (const size of product.sizes) {
        const onHand = Math.round(product.base * store.weight * (0.4 + random() * 2.6));
        if (onHand <= 0) continue;
        rows.push([`${product.parent}-${size === "ONE SIZE" ? "OS" : size}`, store.name, onHand]);
      }
    }
  }

  return rows;
}
