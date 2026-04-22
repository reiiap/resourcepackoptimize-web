# ReiiKajurawa Development Optimize Resourcepack

Aplikasi web full client-side untuk optimasi resourcepack Minecraft dari tahap upload sampai export hasil ZIP.

## Fitur utama

- Import resourcepack dari **ZIP** atau **folder lokal**.
- Analisis cepat (jumlah file, ukuran total, jumlah texture PNG, jumlah JSON/MCMETA).
- Optimasi dengan opsi:
  - Hapus metadata tidak penting (`.DS_Store`, `thumbs.db`, `__MACOSX`).
  - Deduplikasi file identik.
  - Minify JSON dan MCMETA.
  - Atur level kompresi ZIP (1-9).
- Export hasil langsung di browser tanpa server.

## Menjalankan

Buka `index.html` langsung di browser modern.

> Catatan: library JSZip dan FileSaver menggunakan CDN.
