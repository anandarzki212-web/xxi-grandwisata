# Audit XXI Inventory v5

Sumber: **STOCK GUDANG UTAMA DAN GUDANG TRANSIT-2.xlsx**
Sheet: **stock gudang utama dan transit**

Total produk: **187**

## Ringkasan status
- FORMULA_ONLY: **6**
- VERIFIED: **138**
- REVIEW_MISSING: **5**
- LABEL_ONLY: **13**
- REVIEW_COMPLEX: **7**
- REVIEW_CONFLICT: **18**

## Arti status
- `VERIFIED`: label konversi dan formula normalized Excel sejalan.
- `REVIEW_CONFLICT`: label dan formula berbeda; tidak diubah otomatis.
- `REVIEW_COMPLEX`: formula menggabungkan beberapa baris produk.
- `LABEL_ONLY`: label memberi konversi, tetapi formula normalized tidak lengkap.
- `FORMULA_ONLY`: formula memberi faktor, tetapi label tidak menuliskan konversi lengkap.
- `REVIEW_MISSING`: Excel tidak memberi mapping yang cukup untuk disimpulkan.

## Harga
- Workbook yang diaudit tidak memiliki field harga yang teridentifikasi.
- Aplikasi v5 menyediakan field harga terpisah dan tidak mengarang nominal.

## Catatan
- Audit ini memakai data Excel terbaru yang ada di project.
- Mapping `REVIEW_*` sengaja dibiarkan terlihat agar tidak mengubah stok dengan asumsi yang belum dikonfirmasi.

## Keputusan v5.1 — Harga
Workbook Excel terbaru yang diaudit tidak menyediakan data harga. Karena itu fitur harga dihapus dari aplikasi v5.1; aplikasi fokus pada stok, konversi, transaksi, transfer, dan audit.
