# XXI Inventory — Grand Wisata

Web inventory untuk Living World Grand Wisata XXI. Versi ini mengikuti scope terbaru:

- 2 mode: User (view-only) dan Admin.
- Jika User menekan aksi perubahan, muncul Login Admin.
- Login Admin juga tersedia dari icon Pengaturan di kanan atas.
- Admin demo: `taufiq / admin123` dan `rizki / admin321`.
- Show/Hide password.
- Sidebar hanya: Dashboard, Inventory, History, Approval Pengambilan, QR Rak, Orderan Mingguan, Laporan.
- Icon kanan atas: hari/tanggal, Scanner, Pengaturan.
- Pengaturan hanya: Login Admin, ganti foto Dashboard kanan bawah, ganti warna website.
- Gudang Utama: Tambah, Kurangi, Transfer ke Transit.
- Gudang Transit: tidak punya Tambah manual; Admin tetap boleh melakukan pengeluaran manual tanpa scan.
- Transfer hanya Gudang Utama → Gudang Transit.
- History fokus usage/pengeluaran dan dapat diedit Admin; perubahan qty history menyesuaikan stok kembali secara transactional.
- QR Rak: minimal 3 produk, maksimal 50 produk; Admin dapat create/edit/generate/print.
- Scan QR menampilkan produk rak, sisa stok Transit, EXP, dan input jumlah pengambilan.
- Pengambilan QR masuk Approval Pengambilan. APPROVE baru mengurangi stok Transit; REJECT tidak mengurangi stok.
- Tidak ada AI WhatsApp, WhatsApp request, Info, Transfer Gudang sebagai menu sidebar, atau Total Stock sebagai kartu Dashboard.
- Orderan Mingguan menggunakan struktur tabel 2 bagian seperti sheet Excel `format orderan mingguan`.

## 1. Siapkan project

```bash
unzip XXI-Inventory-Grand-Wisata-Final.zip
cd XXI-Inventory-Grand-Wisata
npm install
```

## 2. Buat `.env.local`

Salin `.env.example` menjadi `.env.local`, lalu isi:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

## 3. Siapkan Supabase

Buka Supabase → **SQL Editor**.

Jalankan berurutan:

1. `supabase/schema.sql`
2. `supabase/seed_excel_latest.sql`
3. `supabase/seed_weekly_order_rows.sql`

`seed_excel_latest.sql` adalah seed data dari workbook terbaru yang sudah ada di project.

## 4. Jalankan lokal

```bash
npm run dev
```

Buka:

```text
http://localhost:3000
```

## 5. Login Admin

Default mode adalah User / view-only.

Akun:

```text
ID: taufiq
Password: admin123

ID: rizki
Password: admin321
```

User bisa melihat data. Saat menekan aksi yang mengubah data, Login Admin akan muncul.

## 6. QR Rak

Admin → QR Rak → Buat Rak.

Aturan:

- minimum 3 produk
- maksimum 50 produk
- QR berisi URL rak
- QR bisa dilihat dan dicetak

Saat QR dibuka/scanned, halaman pengambilan akan menampilkan produk yang terdaftar pada rak dan mengambil stok dari **Gudang Transit**.

Jika browser tidak mendukung `BarcodeDetector`, gunakan input/link manual pada Scanner.

## 7. Catatan foto & warna

Foto Dashboard dan warna website disimpan di browser melalui localStorage pada versi ini. Ini membuat pengaturan langsung bekerja tanpa perlu bucket Storage tambahan. Untuk deployment multi-device production, pengaturan ini sebaiknya dipindahkan ke Supabase Storage/settings.

## 8. Catatan keamanan

Login Admin pada versi ini adalah login aplikasi/demo di sisi client sesuai akun yang diminta. Untuk deployment publik production, jangan menganggap kredensial tersebut sebagai mekanisme keamanan final; migrasikan ke Supabase Auth + RLS sebelum aplikasi dibuka ke internet.
