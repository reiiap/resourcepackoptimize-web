# ReiiKajurawa Development Optimize Resourcepack

Aplikasi web full client-side untuk optimasi resourcepack Minecraft berbasis **link URL ZIP**.

## Bugfix terbaru

- Fix bug tombol **Ambil dari Link** yang terlihat tidak merespon.
- Saat klik tombol sekarang UI langsung update status (`Memulai request...`) dan tombol sementara di-disable agar tidak double click.
- Ditambahkan retry jalur link otomatis:
  - via CORS prefix (raw URL)
  - via CORS prefix (encoded URL)
  - direct URL
- Ditambahkan timeout request agar proses tidak menggantung tanpa feedback.
- Input URL juga bisa jalan dengan tombol **Enter**.

## Konsep optimasi (mengacu sistem repo)

- Profil A: **Standard Safe**.
- Profil B: **Advanced Audio Focus**.
- Opsi hapus folder shader `assets/minecraft/shaders`.
- Deduplikasi file identik.
- Pengaturan level kompresi ZIP.

> Catatan: karena ini full di browser, tidak menjalankan `ffmpeg/optipng/advpng` native seperti shell script.

## Menjalankan

Buka `index.html` di browser modern.
