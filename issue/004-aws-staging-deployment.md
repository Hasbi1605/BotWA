# Issue 004 — AWS Staging Deployment dan WhatsApp Pilot Gate

## Status

In progress — release gate lokal selesai; AI endpoint/cascade di-align ke Magang-Istana; provisioning AWS belum dijalankan (menunggu konfirmasi + role non-root).

## Tujuan

Menyediakan staging RembugBot yang aman dan terukur di AWS Singapore, tanpa mengaktifkan grup produksi sebelum pairing serta pilot eksplisit lulus.

## Kondisi awal

- AWS account aktif dan belum memiliki EC2, S3 bucket, atau AWS Budget untuk RembugBot.
- CLI saat ini memakai root principal; provisioning tidak boleh dilanjutkan sehari-hari dengan root.
- Image Linux ARM64 gateway dan worker telah lulus build serta health smoke test lokal.
- Harga live AWS Price List pada 2026-07-21 untuk Singapore: `t4g.small` USD 0,0212/jam dan `t4g.medium` USD 0,0424/jam, belum termasuk EBS/public IPv4.
- Nomor WhatsApp belum dipasangkan dan group allowlist tetap kosong.

## Keputusan

- Region: `ap-southeast-1`.
- Staging awal: **`t4g.small` (2 vCPU, 2 GiB)** sesuai PRD/NFR-PERF-004 (gateway ≤256 MiB, worker ≤1 GiB, single job/OCR page). Naik ke `t4g.medium` (4 GiB) hanya jika memory p95 ≥80% atau OOM saat pilot PDF/OCR.
- OS: Ubuntu Server 24.04 LTS ARM64 dari SSM public AMI parameter.
- Akses operator: AWS Systems Manager Session Manager; security group tanpa inbound rule.
- Storage: encrypted 20 GiB gp3.
- Backup: private S3 bucket dengan SSE-S3, public access block, versioning, dan lifecycle 30 hari.
- Secret runtime: SSM Parameter Store `SecureString`; tidak ditempatkan di git, CloudFormation output, atau EC2 user-data.
- Root hanya digunakan untuk bootstrap role provisioning; perubahan berikutnya memakai assumed role sementara.
- Pairing QR dilakukan setelah deployment/health check hijau. Allowlist tetap kosong sampai grup uji dipilih.

## Scope

- Tambahkan infrastructure-as-code CloudFormation untuk EC2, IAM instance profile, S3 backup, security group, dan alarm dasar.
- Tambahkan bootstrap/deploy scripts yang idempotent dan tidak mencetak secret.
- Buat AWS Budget bulanan dengan batas USD 40; notification ditambahkan setelah alamat tujuan dikonfirmasi.
- Buat provisioning role dan jalankan stack melalui assumed role.
- Simpan environment runtime sebagai SecureString menggunakan token GitHub Models yang sudah dimiliki user bila dapat ditemukan secara aman.
- Verifikasi endpoint GitHub Models terbaru, namespaced model ID, dan fallback dua token melalui smoke request sintetis sebelum secret dipindahkan ke AWS.
- Deploy aplikasi, verifikasi SSM, container health, memory baseline, migration, dan QR generation.

## Di luar scope

- Scan QR tanpa akses pengguna ke ponsel.
- Mengaktifkan grup WhatsApp utama.
- Mengisi group allowlist sebelum JID grup uji diketahui.
- Membeli Reserved Instance atau Savings Plan.

## Verification gate

- CloudFormation template validation lulus.
- Stack `CREATE_COMPLETE`/`UPDATE_COMPLETE`.
- Tidak ada inbound security-group rule.
- EBS terenkripsi dan S3 public-access-block aktif.
- Instance terdaftar `Online` di SSM.
- `docker compose ps` menunjukkan worker healthy dan gateway running.
- Worker `/health/ready` `ok`; gateway `/health/live` `ok`; gateway readiness boleh `degraded` hanya karena WhatsApp belum dipasangkan.
- QR muncul di log gateway tanpa warning `printQRInTerminal` deprecated.
- Memory baseline dan estimasi biaya dicatat.

## Rollback

- Stop instance terlebih dahulu jika health/deploy gagal dan investigasi membutuhkan waktu.
- Hapus stack untuk menghentikan biaya compute; bucket backup dipertahankan hanya jika data pilot sudah ada.
- Hapus SecureString dan provisioning role setelah environment tidak lagi digunakan.

## Done when

- Infrastruktur staging sehat dan dapat diakses melalui SSM.
- Budget guardrail tersedia.
- Aplikasi berjalan dengan secret dari Parameter Store.
- Handoff pairing QR jelas dan tidak ada grup produksi yang diaktifkan diam-diam.
