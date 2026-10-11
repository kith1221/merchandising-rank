import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface PoLine {
  size: string;
  sku: string;
  units: number;
  sharePct: number;
  orderQty: number;
}

export interface PoPdfOptions {
  parentSku: string;
  target: number;
  total: number;
  rows: PoLine[];
  packSize: number;
  moq: number;
  respectRules: boolean;
  overshoot?: number;
  generatedAt?: string;
}

const BRAND_NAME = "Merchandising Rank — Rank Sports";

export function downloadPoPdf({
  parentSku,
  target,
  total,
  rows,
  packSize,
  moq,
  respectRules,
  overshoot,
  generatedAt,
}: PoPdfOptions) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const marginLeft = 14;
  const pageWidth = doc.internal.pageSize.getWidth();
  const usableWidth = pageWidth - marginLeft * 2;
  let y = 14;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(BRAND_NAME, marginLeft, y);
  y += 7;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.text("Purchase Order — Draft Breakdown", marginLeft, y);
  y += 7;

  doc.setFontSize(10);
  const dateStr = generatedAt ?? new Date().toLocaleString("id-ID");
  doc.text(`Tanggal dokumen: ${dateStr}`, marginLeft, y);
  y += 5;
  doc.text(`Parent SKU: ${parentSku || "-"}`, marginLeft, y);
  y += 5;
  doc.text(`Target PO: ${target.toLocaleString("id-ID")} prs`, marginLeft, y);
  y += 5;
  doc.text(`Pack Size: ${packSize} | MOQ: ${moq} | Bulatkan: ${respectRules ? "Ya" : "Tidak"}`, marginLeft, y);
  y += 5;
  doc.text(`Total Draft PO: ${total.toLocaleString("id-ID")} prs`, marginLeft, y);
  y += 5;
  if (typeof overshoot === "number" && overshoot !== 0) {
    const prefix = overshoot > 0 ? "+" : "";
    doc.text(`Selisih vs target: ${prefix}${overshoot.toLocaleString("id-ID")} prs`, marginLeft, y);
    y += 5;
  }
  y += 6;

  const headers = [["No", "Size", "Child SKU", "Histori (unit)", "Porsi (%)", "Order Qty (prs)"]];
  const body = rows.map((row, index) => [
    String(index + 1),
    row.size,
    row.sku,
    row.units.toLocaleString("id-ID"),
    row.sharePct.toFixed(2),
    row.orderQty.toLocaleString("id-ID"),
  ]);

  autoTable(doc, {
    startY: y,
    head: headers,
    body,
    margin: { left: marginLeft, right: marginLeft },
    styles: { font: "helvetica", fontSize: 9, cellPadding: 2, overflow: "linebreak" },
    headStyles: { fillColor: [24, 24, 35], textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [250, 250, 255] },
    columnStyles: {
      0: { halign: "center", cellWidth: 8 },
      1: { halign: "center", cellWidth: 14 },
      2: { cellWidth: 46 },
      3: { halign: "right", cellWidth: 28 },
      4: { halign: "right", cellWidth: 24 },
      5: { halign: "right", cellWidth: 28 },
    },
    tableWidth: usableWidth,
  });

  const finalY = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? y + 20;
  let bottom = finalY + 10;
  if (bottom + 20 > doc.internal.pageSize.getHeight()) {
    doc.addPage();
    bottom = 18;
  }
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Catatan: Draft PO ini dihitung otomatis dari Size Curve (penjualan).", marginLeft, bottom);
  doc.text("Silakan verifikasi MOQ, isi karton, lead time, & stok tersedia sebelum PO final.", marginLeft, bottom + 5);
  doc.text(`Dihasilkan oleh: Merchandising Rank — ${dateStr}`, marginLeft, bottom + 10);

  const filename = `po-${(parentSku || "parent").replace(/[^a-zA-Z0-9_-]/g, "-")}.pdf`;
  doc.save(filename);
}