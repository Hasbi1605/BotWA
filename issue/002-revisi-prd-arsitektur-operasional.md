# Issue 002 — Revisi PRD Arsitektur dan Operasional

## Status

Completed

## Tujuan

Menutup ambiguitas arsitektur dan operasional pada PRD RembugBot sebelum technical design dimulai.

## Scope

- Menetapkan Node.js sebagai satu-satunya owner/writer SQLite.
- Menetapkan HTTP JSON internal sebagai komunikasi gateway–worker.
- Menetapkan SSE-S3/AWS-managed encryption untuk backup MVP.
- Menetapkan memory budget dan concurrency limit host 2 GB.
- Menambahkan rate limit perintah admin.
- Mengubah masa kandidat jadwal menjadi default 72 jam dan configurable.
- Memperjelas HMAC participant identity dan audit trail non-reversible.
- Menetapkan kebijakan catch-up serta recovery digest setelah outage.
- Memperjelas konfirmasi `.hapusdata`.
- Memperbaiki asumsi kuota GitHub Models dari token menjadi account–model.
- Menambahkan health check endpoint kedua service.
- Menetapkan aturan split ringkasan hanya pada boundary aman.

## Keputusan

- Node gateway memiliki database, scheduler, persistent job queue, dan seluruh write.
- Python worker stateless terhadap database aplikasi.
- Transport internal memakai HTTP JSON dengan bearer token, request ID, dan idempotency key.
- Backup S3 memakai SSE-S3; tidak ada customer-managed KMS key pada MVP.
- Satu AI/PDF job berjalan pada satu waktu; OCR memproses satu halaman pada satu waktu.
- Identitas disimpan sebagai HMAC JID dan participant ID tanpa mapping reversible.
- Outage lebih dari enam jam atau coverage yang tidak terverifikasi menghasilkan recovery digest berlabel mungkin tidak lengkap.

## Verifikasi

- Tidak ada ID requirement atau acceptance criteria duplikat.
- Semua keputusan muncul konsisten di arsitektur, NFR, edge case, dan acceptance criteria.
- Tautan lokal Markdown valid.
- Tidak ada trailing whitespace atau conflict marker.

## Hasil verifikasi

- PRD versi 1.1 Draft memiliki 109 requirement FR/NFR unik dan 30 acceptance criteria.
- Tidak ditemukan ID requirement/acceptance criteria duplikat.
- Audit istilah lama bersih dari SQLite multi-writer, pilihan transport ambigu, kandidat 48 jam, dan asumsi kuota per-token.
- Marker keputusan single-owner SQLite serta HTTP JSON konsisten antara PRD dan codebase context.
- Tautan lokal Markdown valid.
- Trailing whitespace dan conflict marker tidak ditemukan.

## Done when

- PRD naik ke versi 1.1 Draft.
- Semua scope revisi memiliki requirement atau keputusan eksplisit.
- Codebase context dan changelog workspace diperbarui.
- Verifikasi dokumentasi lulus.
