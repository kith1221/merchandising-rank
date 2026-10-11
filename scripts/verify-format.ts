import { formatCompact, formatRupiah, formatRupiahCompact } from "../src/lib/format";

const failures: string[] = [];

function check(label: string, condition: boolean, detail = ""): void {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    failures.push(label);
    console.log(`  FAIL  ${label} ${detail}`);
  }
}

const normalize = (value: string): string => value.replace(/\u00a0/g, " ");

console.log("\n[1] Rupiah penuh");
check("formatRupiah ribuan", normalize(formatRupiah(12820237510)) === "Rp 12.820.237.510", formatRupiah(12820237510));
check("formatRupiah desimal dibulatkan", normalize(formatRupiah(1234.6)) === "Rp 1.235", formatRupiah(1234.6));
check("formatRupiah NaN aman", normalize(formatRupiah(Number.NaN)) === "Rp 0", formatRupiah(Number.NaN));

console.log("\n[2] Compact: tidak boleh ambigu (M = miliar, bukan juta)");
check("12,8 miliar", formatRupiahCompact(12820237510) === "Rp 12,8 miliar", formatRupiahCompact(12820237510));
check("1,8 miliar", formatRupiahCompact(1750000000) === "Rp 1,8 miliar", formatRupiahCompact(1750000000));
check("917 juta -> jt", formatRupiahCompact(917000000) === "Rp 917 jt", formatRupiahCompact(917000000));
check("1,2 juta -> jt", formatRupiahCompact(1200000) === "Rp 1,2 jt", formatRupiahCompact(1200000));
check("45 ribu -> rb", formatRupiahCompact(45000) === "Rp 45 rb", formatRupiahCompact(45000));
check("9,3 triliun -> T", formatRupiahCompact(9300000000000) === "Rp 9,3 T", formatRupiahCompact(9300000000000));
check("kecil tanpa satuan", formatRupiahCompact(250) === "Rp 250", formatRupiahCompact(250));
check("nol", formatRupiahCompact(0) === "Rp 0", formatRupiahCompact(0));

console.log("\n[3] Compact untuk unit (tanpa Rp)");
check("unit 13982 -> 14 rb", formatCompact(13982) === "14 rb", formatCompact(13982));
check("unit 246 -> 246", formatCompact(246) === "246", formatCompact(246));
check("unit 1.5 juta -> 1,5 jt", formatCompact(1500000) === "1,5 jt", formatCompact(1500000));
check("angka >= 100 tidak pakai desimal", formatCompact(123456789) === "123 jt", formatCompact(123456789));
check("nilai negatif pakai tanda", formatCompact(-45000) === "-45 rb", formatCompact(-45000));
check("NaN aman", formatCompact(Number.NaN) === "0" && formatRupiahCompact(Number.NaN) === "Rp 0");

console.log("\n[4] Konsistensicompact vs penuh");
const samples = [0, 250, 999, 45000, 999999, 1200000, 917000000, 1750000000, 12820237510, 9300000000000];
for (const value of samples) {
  const compact = formatRupiahCompact(value);
  const full = formatRupiah(value);
  const digits = (compact.match(/\d/g) ?? []).length;
  check(`${value} -> ${compact} (penuh ${full})`, digits > 0 && compact.startsWith("Rp "), compact);
}

console.log(`\nSelesai bagian format. Gagal: ${failures.length}`);
if (failures.length > 0) {
  console.log(failures.map((item) => ` - ${item}`).join("\n"));
  process.exitCode = 1;
}