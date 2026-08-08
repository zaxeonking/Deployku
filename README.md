# DeployKu

Platform sederhana: user upload file `.zip`, sistem otomatis deploy ke Vercel — tanpa mereka butuh akun GitHub. Semua deployment memakai 1 akun Vercel milik pemilik platform (kamu), lewat Vercel API Token.

## 1. Install dependency

```bash
npm install
```

## 2. Buat Vercel Token

1. Buka https://vercel.com/account/tokens
2. Create Token → scope **Full Account** → copy tokennya

## 3. Setup environment variable

Copy `.env.example` jadi `.env.local`, isi:

```
VERCEL_TOKEN=isi_token_kamu
VERCEL_TEAM_ID=          # kosongkan kalau bukan akun Team
```

## 4. Jalankan lokal

```bash
npm run dev
```

Buka http://localhost:3000, coba upload zip berisi file statis (index.html dkk) atau project Next.js/React.

## 5. Deploy platform ini sendiri ke Vercel

```bash
npm install -g vercel
vercel login
vercel --prod
```

Saat proses `vercel`, dia akan minta set Environment Variables — masukkan `VERCEL_TOKEN` (dan `VERCEL_TEAM_ID` kalau ada) di situ, atau lewat dashboard: Project Settings → Environment Variables.

## Batasan versi ini (MVP)

- Semua project user ke-deploy ke **akun Vercel kamu** (bukan akun masing-masing user). Untuk versi "tiap user pakai akun sendiri", perlu Vercel Integration/OAuth yang harus didaftarkan ke Vercel Marketplace dan diapprove — bisa dikembangkan di tahap berikutnya.
- Ukuran project dibatasi ~45MB per upload (batas aman untuk inline deploy tanpa upload file terpisah).
- Belum ada autentikasi user / rate limiting — kalau mau publik beneran, tambahkan itu dulu supaya tidak disalahgunakan orang lain (nge-spam deploy pakai token kamu).
- File yang mengandung `node_modules/`, `.git/`, `.next/` otomatis di-skip dari zip.

## Struktur

```
app/
  page.tsx              -> halaman upload (frontend)
  api/deploy/route.ts   -> terima zip, kirim ke Vercel API
  api/status/[id]/route.ts -> cek status build
```
