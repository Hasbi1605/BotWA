# Issue 003 — Release Hardening dan Verification Gate

## Status

Verification complete — pending push

## Tujuan

Mengubah implementasi MVP wiring RembugBot menjadi release candidate yang dapat dibangun, diuji, dan dijalankan secara konsisten sebelum provisioning AWS serta pairing WhatsApp.

## Scope

- Menambahkan konfigurasi lint gateway yang kompatibel dengan ESLint 9.
- Menambahkan test gateway untuk otorisasi admin, rate limit, job retry/idempotency, persistence, dan boundary penting lain yang dapat diuji tanpa koneksi WhatsApp nyata.
- Menambahkan test worker untuk autentikasi endpoint, preprocessing/validasi evidence, sensitivity gate, parser jadwal, serta provider fallback/circuit breaker.
- Memperbaiki defect yang ditemukan oleh test tanpa refactor besar.
- Memvalidasi build TypeScript, lint, test Node/Python, import/compile Python, Compose, dan build image Docker.
- Menjalankan smoke test health endpoint dan komunikasi gateway–worker apabila Docker lokal tersedia.
- Menyinkronkan dokumentasi pengembangan dan changelog.

## Di luar scope

- Pairing nomor WhatsApp produksi.
- Mengaktifkan bot di grup WhatsApp utama.
- Provisioning atau perubahan resource AWS sebelum release gate lokal lulus.
- Mengubah requirement produk pada PRD.

## Risiko utama

- Native module `better-sqlite3` berbeda perilaku antara Node lokal dan image Node 20.
- OCR/Tesseract dapat meningkatkan memory footprint worker.
- Ketergantungan pada GitHub Models tidak boleh membuat test membutuhkan token atau jaringan.
- Baileys tidak menyediakan sandbox resmi; integrasi riil harus dilakukan setelah test deterministik lulus.

## Rencana implementasi

1. Petakan kontrak modul dan seam yang dapat diuji tanpa jaringan.
2. Tambahkan test yang terlebih dahulu menangkap perilaku P0/P1 hasil review Grok.
3. Perbaiki lint dan defect minimal yang ditemukan test.
4. Jalankan seluruh verification gate lokal.
5. Perbarui status issue, codebase context bila struktur/flow berubah, dan changelog.
6. Commit serta push hanya setelah seluruh gate yang tersedia lulus; catat blocker lingkungan secara eksplisit.

## Verification gate

- `cd gateway && npm test`
- `cd gateway && npm run lint`
- `cd gateway && npm run build`
- `cd worker && source .venv/bin/activate && pytest`
- `cd worker && source .venv/bin/activate && ruff check app tests`
- `cd worker && source .venv/bin/activate && python -m compileall app`
- `docker compose -f docker/docker-compose.yml config`
- Build image gateway dan worker.
- Smoke test `/health/live` dan `/health/ready` jika Docker daemon tersedia.

## Done when

- Test nyata tersedia untuk kedua service dan seluruh test lulus.
- Lint serta build lulus.
- Image production dapat dibangun atau blocker lingkungan sudah dibuktikan dan didokumentasikan.
- Tidak ada secret yang masuk git.
- Dokumentasi dan changelog sesuai hasil aktual.
- Commit hardening telah dipush setelah verifikasi memadai.

## Hasil

- Gateway: 10 Vitest lulus pada Node 20; ESLint dan TypeScript build lulus.
- Worker: 10 Pytest lulus; Ruff dan compileall lulus.
- Dependency audit: npm production audit 0 vulnerability; pip-audit tidak menemukan vulnerability pada dependency PyPI.
- Image gateway Node 20 dan worker Python 3.11 + Tesseract Indonesia berhasil dibangun pada Linux ARM64.
- Production dan development Compose tervalidasi dengan environment dummy tanpa menyimpan secret.
- Smoke test membuktikan migration 12 tabel, gateway liveness, SQLite readiness, worker liveness/readiness, dan komunikasi network antar-container.
- Baileys legacy 6.7.16 terbukti gagal pairing dengan status 405. Controlled upgrade ke 7.0.0-rc13 lulus build/regression test dan menghasilkan QR terminal eksplisit.
- Defect timestamp retry/reminder, reminder 19.00 WIB, parser jam, strict evidence validation, Hatch package discovery, dan Docker build context ditutup dengan regression test.
- Pairing akun dan pilot grup tetap menjadi gate manual berikutnya setelah deployment staging.
