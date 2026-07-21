# Issue 001 — Penyusunan PRD Bot WhatsApp KKN

## Status

Completed

## Latar belakang

Proyek membutuhkan Product Requirements Document (PRD) sebagai acuan sebelum implementasi bot grup WhatsApp untuk kelompok KKN dan, setelah pilot berhasil, grup paguyuban atau karang taruna desa. Bot akan merangkum seluruh percakapan secara otomatis, menyoroti pesan dan dokumen penting, serta mengelola kandidat jadwal dengan konfirmasi admin.

## Tujuan

- Mendefinisikan masalah, pengguna, scope, dan batas produk secara jelas.
- Menetapkan requirement fungsional dan nonfungsional yang dapat diuji.
- Mendokumentasikan keputusan Baileys, AWS, GitHub Models, privasi, retensi, dan operasional.
- Menyediakan acceptance criteria dan rencana rollout dari pilot hingga penggunaan warga.

## Scope dokumen

- Ringkasan otomatis pukul 08.00 dan 20.00 WIB.
- Analisis PDF yang masuk dalam periode ringkasan.
- Deteksi kandidat jadwal, konfirmasi admin, dan pengingat.
- Otorisasi perintah hanya untuk admin grup.
- Integrasi WhatsApp melalui Baileys.
- AI cascade berbasis GitHub Models dengan pola yang diadaptasi dari `Magang-Istana`.
- Hosting awal di AWS Free Plan/credits dan rencana keluar sebelum masa plan berakhir.
- Keamanan, privasi, observability, pengujian, KPI, risiko, dan rollout.

## Di luar scope

- Implementasi source code.
- Provisioning atau deploy AWS.
- Pembuatan nomor WhatsApp atau pemasangan perangkat.
- Dashboard web dan dukungan banyak organisasi pada MVP.

## Asumsi yang disepakati

- Semua anggota grup pilot telah menyetujui pemrosesan pesan.
- Bot menggunakan nomor WhatsApp khusus.
- Seluruh pesan grup yang diizinkan masuk ke jendela ringkasan.
- Hanya admin/superadmin WhatsApp yang dapat menjalankan perintah.
- Kandidat jadwal hasil deteksi otomatis tidak aktif sebelum dikonfirmasi admin.
- Target biaya tunai adalah Rp0 selama pilot; pemakaian AWS dibatasi oleh credits dan guardrail anggaran.

## Risiko utama

- Baileys adalah integrasi tidak resmi dan dapat terputus atau memerlukan pairing ulang.
- GitHub Models free usage tidak memberikan SLA produksi dan kuotanya dapat berubah.
- Pesan grup serta PDF dapat memuat data pribadi atau sensitif.
- AWS Free Plan berakhir sebelum target operasional satu tahun.
- Ringkasan AI dapat menghilangkan konteks atau salah mengklasifikasikan usulan sebagai keputusan.

## Langkah kerja

1. Konsolidasikan keputusan hasil brainstorming.
2. Susun requirement bernomor dan prioritas MVP.
3. Definisikan flow, kontrak output AI, data model konseptual, dan arsitektur.
4. Definisikan keamanan, retensi, reliability, observability, dan cost guardrail.
5. Susun acceptance criteria, test strategy, rollout, KPI, serta exit criteria.
6. Verifikasi konsistensi dan kelengkapan dokumen.

## Verifikasi

- Pemeriksaan struktur heading dan requirement ID.
- Pemeriksaan tautan lokal dan referensi eksternal.
- Pemeriksaan whitespace/format Markdown.
- Review konsistensi antara scope, acceptance criteria, dan rencana rollout.

## Hasil verifikasi

- Struktur PRD: 30 bagian tingkat utama tersedia.
- Requirement unik: 91 ID FR/NFR; tidak ditemukan ID duplikat.
- Acceptance criteria: 20 skenario.
- Tautan lokal Markdown: valid.
- Trailing whitespace dan conflict marker: tidak ditemukan.
- Referensi implementasi `Magang-Istana` yang disebutkan: tersedia.

## Done when

- PRD lengkap tersedia di root proyek.
- Tidak ada keputusan produk kritis yang dibiarkan ambigu tanpa default yang jelas.
- Acceptance criteria dapat diterjemahkan menjadi test.
- Changelog workspace diperbarui.
- Hasil verifikasi dokumentasi dicatat.
