# Mie Ayam Gendok — Website Pemesanan

Website statis (HTML, CSS, JavaScript murni — tanpa framework/build tool) yang mengikuti tampilan UI pada desain: Beranda, Menu, Login/Register, dan Checkout + pembayaran QRIS.

## Struktur folder

```
mie-ayam-gendok/
├── index.html          # Beranda
├── menu.html           # Daftar menu (+ pencarian & filter kategori)
├── cart.html           # Halaman Keranjang (ubah jumlah / hapus item)
├── login.html          # Login & Register (dua tab dalam satu halaman)
├── checkout.html        # Checkout + ringkasan pesanan + QRIS
├── orders.html          # Riwayat pesanan ("Pesanan Saya")
└── assets/
    ├── css/style.css   # Semua styling
    └── js/
        ├── cart.js      # Keranjang & riwayat pesanan (disimpan di localStorage)
        ├── auth.js      # Ganti tab Login/Register
        └── checkout.js  # Ringkasan pesanan & alur pembayaran QRIS
```

## Fitur yang sudah ditambahkan

- **Halaman Keranjang (`cart.html`)** — lihat semua item, ubah jumlah dengan tombol +/−, atau hapus item sebelum checkout.
- **Pencarian & filter menu (`menu.html`)** — cari menu berdasarkan nama, atau filter kategori "Mie Ayam" / "Pangsit & Minuman".
- **Riwayat Pesanan (`orders.html`)** — setiap pesanan yang berhasil dibuat di checkout otomatis tersimpan dan bisa dilihat kembali di sini (per perangkat, via `localStorage`).

## Cara menjalankan di VS Code

1. Buka folder ini di VS Code (`File > Open Folder...`).
2. Install ekstensi **Live Server** (oleh Ritwick Dey) dari Extensions Marketplace.
3. Klik kanan pada `index.html` → **Open with Live Server**.
4. Situs akan terbuka di browser, biasanya di `http://127.0.0.1:5500`.

Tanpa Live Server pun, kamu bisa langsung membuka `index.html` di browser — hanya saja beberapa browser membatasi fitur tertentu saat file dibuka lewat `file://`.

## Cara kerja alur pemesanan

1. Buka **Menu**, klik **Beli** pada item yang diinginkan → item masuk ke keranjang (disimpan di `localStorage`, jadi tetap ada walau halaman di-refresh).
2. Buka **Checkout** (ikon keranjang di header) → isi detail pengiriman, pilih metode pengiriman & pembayaran.
3. Jika memilih **QRIS**, akan muncul kartu QR untuk disimulasikan pembayarannya (tombol "Saya Sudah Bayar").
4. Setelah konfirmasi, ringkasan pesanan berubah menjadi status "Pesanan berhasil dibuat!" dengan timeline status.

## Yang perlu disesuaikan sebelum dipakai produksi

- Gambar makanan saat ini memakai URL Unsplash sebagai placeholder — ganti dengan foto asli produk kamu.
- Form Login/Register/Checkout belum terhubung ke backend/database — saat ini hanya simulasi di sisi browser (front-end only).
- Kode QRIS pada halaman checkout dibuat dengan generator QR gratis untuk demo — ganti dengan QRIS statis/dinamis resmi dari penyedia pembayaran kamu (mis. Midtrans, Xendit, atau bank).
- Nomor WhatsApp, alamat, dan jam operasional di Beranda & footer masih placeholder.
