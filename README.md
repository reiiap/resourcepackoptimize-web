# ReiiKajurawa Development Optimize Resourcepack

Web app full client-side untuk mengoptimasi resourcepack Minecraft langsung dari browser:

- Upload ZIP resourcepack
- Analisa isi file (PNG/JSON/ukuran)
- Konfigurasi optimasi
- Optimasi langsung di browser (tanpa backend)
- Download hasil ZIP optimize

## Menjalankan

Karena ini static web app, cukup jalankan web server sederhana:

```bash
python -m http.server 8080
```

Lalu buka `http://localhost:8080`.

## Catatan

- Semua proses dilakukan di browser user.
- Tidak ada upload ke server.
- Cocok untuk workflow cepat dari tahap awal sampai akhir di website.
