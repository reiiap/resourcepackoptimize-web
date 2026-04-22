# ReiiKajurawa Development Optimize Resourcepack

Aplikasi web full client-side untuk optimasi resourcepack Minecraft berbasis **link URL ZIP**.

## Yang sudah diperbaiki

- Sistem input sekarang pakai **link ZIP** (bukan wajib upload file lokal).
- Ada **progress bar download** dan **progress bar optimasi** supaya proses tidak terlihat stuck.
- Workflow 4 tahap tetap tersedia: Link Input → Analisis → Optimasi → Export.

## Konsep optimasi (mengacu sistem repo)

- Profil A: **Standard Safe**.
- Profil B: **Advanced Audio Focus**.
- Opsi hapus folder shader `assets/minecraft/shaders`.
- Deduplikasi file identik.
- Pengaturan level kompresi ZIP.

> Catatan: karena ini full di browser, tidak menjalankan `ffmpeg/optipng/advpng` native seperti shell script. Proses tetap aman dan stabil untuk workflow web.

## Menjalankan

Buka `index.html` di browser modern.
