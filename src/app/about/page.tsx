"use client";

import { Info, Database, Activity, Code } from "lucide-react";

export default function About() {
  return (
    <section className="animate-fade-in" style={{ marginTop: '16px' }}>
      <div className="feature-card glass-panel" style={{ padding: '40px', lineHeight: '1.8' }}>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '24px', marginBottom: '32px' }}>
          <Info size={40} style={{ color: 'var(--accent-primary)' }} />
          <div>
            <h2 style={{ fontSize: '28px', margin: 0 }}>Dokumentasi Sistem</h2>
            <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Intelligence Merchandising ERP - PT Rank Retailindo Atletik</p>
          </div>
        </div>

        <div style={{ marginBottom: '40px' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)', marginBottom: '16px' }}>
            <Activity size={24} style={{ color: 'var(--success)' }} />
            1. Alur Kerja Sistem (Data Flow)
          </h3>
          <p style={{ color: 'var(--text-secondary)' }}>
            Sistem ERP cerdas ini dibangun untuk mendigitalisasi dan mengoptimasi proses retail hulu ke hilir di jaringan <strong>Rank Sports</strong>. Berikut adalah alur berjalannya sistem:
          </p>
            <ol style={{ marginLeft: '24px', marginTop: '16px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <li><strong>Data Capture:</strong> Tim merchandising mengunggah file <i>.xlsx</i>/<i>.csv</i> penjualan (POS offline maupun export marketplace) lewat halaman <i>Upload Data</i>. Nama kolom dideteksi otomatis (tanggal, toko, SKU, size, qty, harga) dan bisa dikoreksi manual. Baris yang gagal baca dilaporkan, bukan dihitung.</li>
            <li><strong>Data Processing (Analytics):</strong> Engine sistem memproses data penjualan menjadi <i>insight</i>. Misalnya, menghitung ukuran sepatu (EU 39, 40, 41) apa saja yang paling cepat habis untuk setiap <i>Parent SKU</i> (misal: Ortuseight Catalyst Legion).</li>
            <li><strong>Size Curve PO Generation:</strong> Pada halaman <i>Purchasing</i>, saat tim pengadaan memasukkan target total PO (misal: 1000 pasang), sistem akan memecahnya secara matematis (metode <i>largest remainder</i>) menjadi porsi <i>Child SKU</i> (tiap ukuran), lalu membulatkan ke isi karton &amp; MOQ agar toko tidak mengalami stok mati.</li>
            <li><strong>Smart Allocation:</strong> Sistem menyusun rencana alokasi stok dari Gudang Pusat ke setiap cabang berdasarkan histori penjualan per outlet, lengkap dengan reserve gudang dan ekspor CSV transfer order.</li>
            <li><strong>Forecast &amp; Markdown:</strong> Holt&apos;s Linear memproyeksikan demand per minggu, safety stock dihitung dari volatilitas &amp; lead time, sementara modul <i>Markdown</i> menandai SKU dengan sell-through &amp; weeks-of-cover rendah beserta harga diskon yang disarankan.</li>
          </ol>
          <p style={{ color: 'var(--text-secondary)', marginTop: '16px' }}>
            Penyimpanan saat ini berjalan lokal di browser (IndexedDB) agar sistem dapat langsung dipakai tanpa setup database.
            Skema PostgreSQL/Prisma tersedia untuk mode multi-user.
          </p>
        </div>

        <div style={{ marginBottom: '40px' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)', marginBottom: '16px' }}>
            <Database size={24} style={{ color: 'var(--warning)' }} />
            2. Arsitektur Database (Prisma ORM)
          </h3>
          <p style={{ color: 'var(--text-secondary)' }}>
            Sistem menggunakan struktur database relasional yang kuat (PostgreSQL). Kunci utamanya adalah pemisahan antara <strong>Parent SKU</strong> dan <strong>Child SKU</strong>:
          </p>
          <ul style={{ marginLeft: '24px', marginTop: '16px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <li><code>Product (Parent)</code>: Menyimpan atribut umum seperti nama &quot;Nike Air Zoom Pegasus&quot; dan Base Price.</li>
            <li><code>ProductVariant (Child)</code>: Menurun dari Parent SKU, menyimpan variasi spesifik seperti &quot;Size 42, Color Red, Barcode Khusus&quot;. Hal ini mutlak diperlukan di retail sepatu agar pencatatan inventaris dan ukuran benar-benar presisi.</li>
            <li><code>WarehouseStore</code>: Membedakan mana yang merupakan gudang (Warehouse) pusat dan mana yang merupakan Toko Retail fisik (Store).</li>
            <li><code>Inventory</code>: Melacak kuantitas stok yang tersedia (Quantity On Hand) untuk setiap Child SKU di masing-masing lokasi.</li>
          </ul>
        </div>

        <div>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)', marginBottom: '16px' }}>
            <Code size={24} style={{ color: 'var(--accent-primary)' }} />
            3. Teknologi yang Digunakan
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', color: 'var(--text-secondary)' }}>
            <div style={{ background: 'var(--hover-bg)', padding: '16px', borderRadius: '8px' }}>
              <strong style={{ color: 'var(--text-primary)' }}>Frontend Framework</strong><br/>
              Next.js 14 (App Router) + React.js untuk interaktivitas instan dan navigasi SPA (Single Page Application) yang cepat.
            </div>
            <div style={{ background: 'var(--hover-bg)', padding: '16px', borderRadius: '8px' }}>
              <strong style={{ color: 'var(--text-primary)' }}>UI/UX & Styling</strong><br/>
              Vanilla CSS dengan konsep <i>Glassmorphism</i> dan tema atletik <i>High-Contrast</i> khas Rank Sports. Tanpa menggunakan TailwindCSS.
            </div>
            <div style={{ background: 'var(--hover-bg)', padding: '16px', borderRadius: '8px' }}>
              <strong style={{ color: 'var(--text-primary)' }}>Data Visualization</strong><br/>
              <i>Recharts</i> (Library grafik berbasis D3.js) untuk menggambar <i>Bar Chart</i> ukuran dan <i>Area Chart</i> tren penjualan.
            </div>
            <div style={{ background: 'var(--hover-bg)', padding: '16px', borderRadius: '8px' }}>
              <strong style={{ color: 'var(--text-primary)' }}>Database System</strong><br/>
              PostgreSQL dengan Prisma ORM untuk pemetaan relasi antar tabel (ERD) dan eksekusi <i>query</i> terstruktur.
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}
