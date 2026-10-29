# IP Allowlist API — Cloudflare Worker + D1

API perantara untuk menyimpan dan memeriksa izin IP dengan field:

```text
ip       alamat IPv4 atau IPv6
expired  tanggal berakhir, format YYYY-MM-DD
name     nama/keterangan pemilik IP
```

API menggunakan Cloudflare D1 dengan binding `DB`. Endpoint baca daftar publik tidak membutuhkan API key. Operasi perubahan data tetap dilindungi secret `API_KEY`.

## Endpoint

Endpoint publik:

- `GET /ips` — daftar IP aktif, tanpa API key.
- `GET /ips?include_expired=1` — daftar semua IP termasuk yang kedaluwarsa, tanpa API key.
- `GET /dashboard` — panel UI, tanpa API key untuk melihat daftar; API key diisi di form saat mengelola data.

Endpoint berikut membutuhkan salah satu header:

```http
Authorization: Bearer API_KEY
```

atau:

```http
X-API-Key: API_KEY
```

- `GET /health` — cek layanan.
- `GET /ips` — daftar izin IP yang masih aktif.
- `GET /ips?include_expired=1` — daftar semua data termasuk yang kedaluwarsa.
- `GET /ips/{ip}` — mengambil satu IP dan status `active`.
- `POST /ips` — menambah IP.
- `PATCH /ips/{ip}` — mengubah `expired` atau `name`.
- `DELETE /ips/{ip}` — menghapus satu IP.
- `DELETE /ips` — menghapus semua IP.

## Deploy

### 1. Buat D1

```bash
npm install
npx wrangler login
npx wrangler d1 create ip-allowlist
```

Salin `database_id` yang ditampilkan, lalu isi `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "ip-allowlist"
database_id = "UUID_DATABASE_D1"
```

Jangan mengubah binding `DB` karena digunakan sebagai `env.DB` di Worker.

### 2. Terapkan schema

```bash
npx wrangler d1 execute ip-allowlist --remote --file=./schema.sql
```

Verifikasi:

```bash
npx wrangler d1 execute ip-allowlist --remote \\
  --command "SELECT name FROM sqlite_master WHERE type = 'table'"
```

Hasil harus memuat `ip_allowlist`.

### 3. Buat secret API key

```bash
openssl rand -hex 32
npx wrangler secret put API_KEY
```

Saat diminta, masukkan hasil random tersebut. Jangan menaruh API key di source code atau `wrangler.toml`.

### 4. Deploy Worker

```bash
npm run check
npx wrangler deploy
```

URL Worker akan ditampilkan oleh Wrangler.

### Deploy dari Dashboard/GitHub

Repository ini dapat dihubungkan ke Cloudflare Workers melalui **Workers & Pages → Create → Import a repository**. Gunakan branch `main`, entry point `worker.js`, dan biarkan `wrangler.toml` menjadi sumber konfigurasi. Setelah deploy:

1. Tambahkan D1 binding dengan variable name `DB`.
2. Pilih database `ip-allowlist`.
3. Tambahkan secret `API_KEY`.
4. Deploy ulang.
5. Jalankan `schema.sql` melalui D1 Console jika belum dijalankan.

## Contoh API

### Tambah IP

```bash
curl -X POST https://API_DOMAIN/ips \\
  -H 'Authorization: Bearer API_KEY' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "ip": "203.0.113.10",
    "expired": "2026-10-29",
    "name": "Server utama"
  }'
```

Semua field wajib diisi. `expired` harus berupa tanggal valid dengan format `YYYY-MM-DD`.

### Ambil IP aktif — publik

Tidak perlu API key:

```bash
curl https://API_DOMAIN/ips
```

Secara default, data yang tanggal `expired`-nya lebih kecil dari tanggal UTC hari ini tidak ditampilkan.

Untuk semua data termasuk yang kedaluwarsa:

```bash
curl 'https://API_DOMAIN/ips?include_expired=1'
```

## Panel dashboard

Buka:

```text
https://API_DOMAIN/dashboard
```

Panel menyediakan:

- daftar IP aktif tanpa API key;
- tombol menampilkan IP kedaluwarsa;
- tambah IP;
- edit tanggal expired dan nama;
- hapus IP.

Masukkan `API_KEY` pada field panel saat melakukan tambah, edit, atau hapus. API key tidak disimpan ke database atau URL.

### Cek satu IP

```bash
curl https://API_DOMAIN/ips/203.0.113.10 \\
  -H 'Authorization: Bearer API_KEY'
```

Contoh respons:

```json
{
  "status": true,
  "data": {
    "ip": "203.0.113.10",
    "expired": "2026-10-29",
    "name": "Server utama"
  },
  "active": true
}
```

### Ubah tanggal atau nama

```bash
curl -X PATCH https://API_DOMAIN/ips/203.0.113.10 \\
  -H 'Authorization: Bearer API_KEY' \\
  -H 'Content-Type: application/json' \\
  -d '{"expired":"2026-12-31","name":"Server produksi"}'
```

### Hapus IP

```bash
curl -X DELETE https://API_DOMAIN/ips/203.0.113.10 \\
  -H 'Authorization: Bearer API_KEY'
```

## Integrasi script izin IP

Script cukup memanggil:

```text
GET https://API_DOMAIN/ips/IP_YANG_DIPERIKSA
```

Jika respons HTTP `200` dan `active: true`, IP diizinkan. Jika HTTP `404`, IP tidak terdaftar. Jika `active: false`, data terdaftar tetapi sudah kedaluwarsa.

## Keamanan

- Simpan `API_KEY` sebagai Worker Secret.
- Jangan memasukkan API key ke aplikasi klien yang dibagikan publik tanpa lapisan autentikasi tambahan.
- Gunakan HTTPS Worker URL.
- Rotasi API key jika bocor.
- IP yang kedaluwarsa tidak dihapus otomatis; gunakan `DELETE /ips/{ip}` atau hapus massal sesuai kebutuhan.

## Pemeriksaan

```bash
node --check worker.js
npm run check
```
