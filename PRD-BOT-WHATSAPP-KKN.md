# Product Requirements Document — RembugBot

> Nama **RembugBot** adalah nama kerja dan dapat diganti tanpa mengubah requirement produk.

## 1. Kontrol Dokumen

| Atribut | Nilai |
|---|---|
| Produk | RembugBot — Asisten Grup WhatsApp KKN dan Komunitas Desa |
| Versi | 1.1 Draft |
| Status | Siap direview |
| Tanggal | 21 Juli 2026 |
| Pemilik produk | Muhammad Hasbi Ash Shiddiqi / Tim KKN |
| Target pilot | Grup internal kelompok KKN |
| Target lanjutan | Grup paguyuban atau karang taruna desa |
| Bahasa utama | Bahasa Indonesia |
| Zona waktu | Asia/Jakarta (WIB) |

### 1.1 Riwayat revisi

| Versi | Tanggal | Perubahan |
|---|---|---|
| 1.1 Draft | 21 Juli 2026 | Mengunci ownership SQLite, HTTP internal, enkripsi backup, memory budget, admin rate limit, kebijakan outage, health check, identitas HMAC, serta asumsi kuota GitHub Models |
| 1.0 Draft | 21 Juli 2026 | PRD awal lengkap berdasarkan hasil discovery dan keputusan produk |

### 1.2 Status persetujuan

| Peran | Nama | Status |
|---|---|---|
| Product owner | Muhammad Hasbi Ash Shiddiqi | Menunggu persetujuan final |
| Perwakilan admin grup pilot | Ditentukan saat onboarding | Menunggu |
| Technical owner | Muhammad Hasbi Ash Shiddiqi | Menunggu |

---

## 2. Ringkasan Eksekutif

RembugBot adalah asisten otomatis dalam grup WhatsApp yang membantu kelompok KKN dan komunitas desa memahami percakapan panjang, menemukan keputusan dan tindak lanjut, membaca dokumen PDF, serta mengingat jadwal kegiatan.

Bot mengumpulkan pesan dari grup yang telah memberikan persetujuan dan mengirim ringkasan dua kali sehari, pukul 08.00 dan 20.00 WIB. Ringkasan memuat narasi lengkap, highlight, kutipan penting beserta nama pengirim, keputusan, tugas, kandidat jadwal, dokumen, serta hal yang belum terselesaikan. Pesan rutin, stiker, dan percakapan tanpa nilai tindak lanjut tidak mendominasi hasil.

Semua perintah manual hanya dapat dijalankan oleh admin atau superadmin grup. Jadwal yang terdeteksi otomatis selalu berstatus kandidat dan tidak menghasilkan pengingat sampai dikonfirmasi admin. Dokumen PDF dianalisis secara lokal terlebih dahulu dan hanya konten yang lolos pemeriksaan sensitivitas yang dikirim ke provider AI.

MVP menggunakan Baileys sebagai jembatan WhatsApp, service Node.js/TypeScript sebagai pemilik tunggal SQLite, scheduler, job queue, dan koneksi WhatsApp, serta worker Python/FastAPI stateless untuk pemrosesan AI/PDF. Kedua service berkomunikasi melalui HTTP JSON internal. GitHub Models menjadi provider AI utama dengan fallback ketat dan EC2 AWS menjadi hosting pilot. Produk menargetkan biaya tunai Rp0 selama pilot, dengan guardrail kredit dan rencana migrasi sebelum AWS Free Plan berakhir.

---

## 3. Latar Belakang dan Masalah

### 3.1 Kondisi saat ini

Grup WhatsApp KKN dan komunitas desa menjadi pusat koordinasi kegiatan. Informasi penting tersebar di antara percakapan informal, balasan singkat, media, dan dokumen. Anggota yang terlambat membaca harus menelusuri banyak pesan untuk mengetahui keputusan terbaru.

### 3.2 Masalah pengguna

1. Keputusan penting tenggelam di antara percakapan rutin.
2. Pembagian tugas sering tidak terdokumentasi secara terstruktur.
3. Jadwal disebut secara informal dan mudah terlupakan.
4. Dokumen PDF dibagikan tanpa semua anggota membaca poin utamanya.
5. Notulensi manual membutuhkan waktu dan tidak konsisten.
6. Anggota yang tidak aktif selama beberapa jam kehilangan konteks.

### 3.3 Peluang

Bot yang hadir langsung dalam grup dapat mengurangi beban administratif tanpa memaksa anggota berpindah aplikasi. Ringkasan periodik yang dapat ditelusuri dan pengingat yang dikonfirmasi admin dapat meningkatkan koordinasi sekaligus tetap mempertahankan kebiasaan komunikasi warga.

---

## 4. Visi dan Prinsip Produk

### 4.1 Visi

Menjadi asisten koordinasi grup yang sederhana, hemat biaya, transparan, dan dapat dipercaya untuk membantu kegiatan KKN serta komunitas desa berjalan lebih tertib.

### 4.2 Prinsip

1. **Membantu, bukan mengambil alih.** Bot menyusun informasi; keputusan tetap milik manusia.
2. **Tidak mengarang.** Setiap keputusan, tugas, kutipan, dan jadwal harus dapat ditelusuri ke pesan sumber.
3. **Admin tetap memegang kontrol.** Tindakan yang mengubah jadwal atau data memerlukan admin.
4. **Minim gangguan.** Bot tidak membalas setiap pesan dan mengutamakan ringkasan terjadwal.
5. **Privasi sejak desain.** Nomor telepon tidak dikirim ke AI dan data mentah memiliki masa retensi pendek.
6. **Gratis secara disiplin.** Pemakaian provider dan infrastruktur dibatasi, dipantau, dan memiliki jalur keluar.
7. **Degradasi secara aman.** Kegagalan AI tidak menghasilkan informasi palsu atau pesan setengah jadi.

---

## 5. Tujuan, Non-Tujuan, dan KPI

### 5.1 Tujuan MVP

- Menghasilkan dua ringkasan otomatis per hari untuk satu grup pilot.
- Menangkap keputusan, tugas, jadwal, dokumen, dan pertanyaan terbuka secara akurat.
- Menampilkan kutipan penting dengan atribusi pengirim yang benar.
- Mendeteksi kandidat jadwal tanpa membuat pengingat palsu.
- Mengirim pengingat hanya untuk jadwal yang dikonfirmasi admin.
- Menganalisis PDF relevan yang dibagikan dalam grup.
- Beroperasi terus-menerus dengan intervensi minimal dan biaya tunai Rp0 selama pilot.

### 5.2 Non-tujuan MVP

- Menggantikan moderator atau ketua kelompok.
- Menilai karakter, emosi, produktivitas, atau kinerja anggota.
- Menyediakan chatbot tanya-jawab bebas untuk semua anggota.
- Memoderasi isi, menghapus pesan, atau mengeluarkan anggota.
- Membaca chat pribadi.
- Mendukung gambar, video, voice note, DOCX, atau spreadsheet secara penuh.
- Menyediakan dashboard web.
- Menjadi layanan multi-tenant untuk banyak organisasi.
- Menjamin uptime atau dukungan setara layanan komersial resmi WhatsApp.

### 5.3 KPI pilot

| KPI | Target |
|---|---:|
| Ringkasan terkirim dalam 15 menit dari jadwal | ≥ 95% |
| Keputusan penting yang berhasil tercakup | ≥ 90% dari sampel review admin |
| Atribusi nama dan kutipan yang tepat | 100% pada sampel audit |
| Jadwal palsu yang menjadi pengingat aktif | 0 |
| Tugas yang dikarang tanpa pesan sumber | 0 |
| Admin menilai ringkasan berguna | ≥ 80% review mingguan |
| Duplikasi ringkasan/pengingat | < 1% |
| PDF yang didukung berhasil diproses | ≥ 90% |
| Biaya tunai selama pilot | Rp0 |
| Insiden kebocoran token/nomor telepon ke log | 0 |

### 5.4 Exit criteria pilot

Pilot dinyatakan layak diperluas bila berjalan minimal 14 hari, menghasilkan sedikitnya 20 ringkasan, tidak memiliki insiden keamanan tingkat tinggi, mencapai KPI akurasi utama, dan disetujui oleh admin serta mayoritas anggota pilot yang memberikan evaluasi.

---

## 6. Pengguna dan Pemangku Kepentingan

### 6.1 Persona

#### Admin grup

Ketua atau koordinator yang bertanggung jawab atas jadwal, keputusan, dan ketertiban grup. Membutuhkan kontrol untuk mengonfirmasi jadwal, meminta ringkasan, menjeda bot, dan menghapus data.

#### Anggota aktif

Sering mengirim informasi dan mengikuti diskusi. Membutuhkan ringkasan yang tidak salah mengutip atau mengubah maksud pesan.

#### Anggota pasif

Jarang membuka grup atau membaca secara berkala. Membutuhkan gambaran lengkap tanpa menelusuri seluruh percakapan.

#### Operator teknis

Memelihara server, token, pairing WhatsApp, backup, dan monitoring. Membutuhkan log aman serta prosedur pemulihan yang jelas.

### 6.2 Pemangku kepentingan

- Tim KKN.
- Admin grup pilot.
- Anggota grup pilot.
- Pengurus paguyuban atau karang taruna saat ekspansi.
- Pemilik akun AWS dan akun GitHub Models.

---

## 7. Asumsi dan Batasan

### 7.1 Asumsi

- Seluruh anggota grup pilot telah menyetujui pemrosesan pesan.
- Nomor WhatsApp khusus tersedia dan menjadi anggota grup.
- Dua akun/token GitHub Models yang sah tersedia dan dimiliki atau diotorisasi oleh pemilik proyek.
- Volume awal adalah satu grup dengan maksimal 100 anggota dan maksimal 2.000 pesan per hari.
- Bahasa percakapan mayoritas Bahasa Indonesia, dengan kemungkinan bahasa daerah atau istilah lokal.
- Admin bertanggung jawab memberi pemberitahuan dan memperoleh persetujuan anggota baru.

### 7.2 Batasan

- Baileys tidak berafiliasi atau didukung resmi oleh WhatsApp.
- Kuota dan daftar model GitHub Models dapat berubah.
- Free usage GitHub Models ditujukan untuk eksperimen dan tidak memiliki SLA produksi.
- AWS Free Plan aktif sampai 16 Januari 2027; kelanjutan setelah tanggal itu memerlukan keputusan migrasi atau upgrade.
- AI dapat melakukan kesalahan sehingga keluaran harus memiliki bukti sumber dan guardrail.

---

## 8. Scope Rilis

### 8.1 MVP / Pilot KKN

- Satu nomor bot dan satu grup allowlist.
- Ingest seluruh pesan grup yang didukung.
- Ringkasan otomatis pukul 08.00 dan 20.00 WIB.
- Ringkasan manual oleh admin.
- Analisis PDF dalam ringkasan.
- Deteksi kandidat jadwal.
- Konfirmasi, ubah, batal, daftar, dan pengingat jadwal oleh admin.
- Penyimpanan lokal dengan retensi otomatis.
- Strict AI fallback menggunakan GitHub Models.
- Health check, log aman, backup, dan alert operasional dasar.

### 8.2 Rilis komunitas desa

- Onboarding consent untuk anggota baru.
- Dukungan beberapa grup allowlist dalam satu komunitas.
- Preferensi jadwal ringkasan per grup.
- Kamus istilah/nama kegiatan lokal.
- Laporan evaluasi dan panduan operator nonteknis.

### 8.3 Kandidat masa depan

- Voice note transcription.
- OCR gambar pengumuman.
- Dashboard web admin.
- Pencarian ringkasan historis.
- Kalender eksternal.
- WhatsApp Groups API resmi jika akses dan biayanya memungkinkan.

---

## 9. User Stories Utama

| ID | Sebagai | Saya ingin | Agar |
|---|---|---|---|
| US-01 | Anggota | menerima ringkasan dua kali sehari | dapat mengikuti perkembangan tanpa membaca semua pesan |
| US-02 | Anggota | melihat kutipan dan nama untuk pesan penting | dapat memahami siapa menyampaikan informasi kunci |
| US-03 | Admin | mengonfirmasi kandidat jadwal | pengingat tidak dibuat dari percakapan ambigu |
| US-04 | Admin | menambahkan atau membatalkan jadwal | informasi kegiatan tetap terkendali |
| US-05 | Anggota | melihat inti PDF dalam ringkasan | mengetahui isi dokumen tanpa membuka seluruh dokumen |
| US-06 | Admin | meminta ringkasan sekarang | dapat memperoleh status terkini saat diperlukan |
| US-07 | Admin | menjeda bot | dapat menghentikan pemrosesan saat diperlukan |
| US-08 | Anggota | mengetahui data apa yang diproses | dapat memberikan persetujuan secara sadar |
| US-09 | Operator | mengetahui bot terputus atau job gagal | dapat memulihkan layanan dengan cepat |

---

## 10. Requirement Fungsional

Prioritas menggunakan **Must**, **Should**, dan **Could**.

### 10.1 Koneksi dan scope WhatsApp

| ID | Requirement | Prioritas |
|---|---|---|
| FR-WA-001 | Sistem hanya memproses pesan dari grup yang JID-nya berada dalam allowlist. | Must |
| FR-WA-002 | Sistem mengabaikan chat pribadi, status, channel, dan grup yang tidak diizinkan. | Must |
| FR-WA-003 | Sistem mengabaikan pesan yang dibuat bot sendiri agar tidak terjadi loop. | Must |
| FR-WA-004 | Sistem menyimpan auth state secara persisten dan terenkripsi saat disimpan. | Must |
| FR-WA-005 | Sistem melakukan reconnect dengan exponential backoff dan menghentikan retry otomatis bila status menunjukkan logout. | Must |
| FR-WA-006 | Sistem memberi notifikasi operator bila pairing ulang diperlukan. | Must |
| FR-WA-007 | Sistem menangani event edit dan hapus sebelum ringkasan; pesan yang dihapus tidak boleh dikutip. | Should |
| FR-WA-008 | Sistem menyimpan identitas pengirim sebagai internal participant ID dan display name terbaru. | Must |
| FR-WA-009 | Sistem harus dapat memproses minimal 2.000 pesan teks per grup per hari pada scope pilot. | Must |

### 10.2 Otorisasi admin

| ID | Requirement | Prioritas |
|---|---|---|
| FR-AUTH-001 | Semua perintah manual hanya dapat dijalankan oleh `admin` atau `superadmin` grup WhatsApp. | Must |
| FR-AUTH-002 | Status admin diperiksa dari metadata grup pada saat perintah dan tidak hanya mengandalkan cache lama. | Must |
| FR-AUTH-003 | Perintah anggota biasa tidak dijalankan dan mendapat balasan singkat bahwa perintah khusus admin. | Must |
| FR-AUTH-004 | Perintah berisiko seperti penghapusan seluruh data memerlukan konfirmasi kedua dalam waktu 10 menit. | Must |
| FR-AUTH-005 | Semua tindakan admin dicatat dalam audit log tanpa menyimpan isi pesan sensitif. | Must |
| FR-AUTH-006 | Perintah `.ringkas sekarang` dibatasi satu kali per grup setiap 30 menit dan maksimal empat kali per hari. | Must |
| FR-AUTH-007 | Perintah `.pdf proses` dan `.pdf izinkan` secara gabungan dibatasi maksimal dua kali per grup per jam. | Must |
| FR-AUTH-008 | Perintah admin secara umum dibatasi lima per admin per menit; `.status` dan `.bantuan` dikecualikan dari kuota AI tetapi tetap dilindungi burst limit teknis. | Must |
| FR-AUTH-009 | Saat command ditolak karena rate limit, bot menampilkan sisa cooldown tanpa menjalankan job atau provider call. | Must |

### 10.3 Pengumpulan pesan

| ID | Requirement | Prioritas |
|---|---|---|
| FR-MSG-001 | Seluruh pesan teks dalam periode ringkasan dipertimbangkan sebagai sumber. | Must |
| FR-MSG-002 | Sistem menormalisasi reply, mention, caption dokumen, timestamp, dan identitas pengirim. | Must |
| FR-MSG-003 | Stiker, reaksi, salam, dan pesan sangat pendek tetap dihitung dalam statistik tetapi boleh dikeluarkan dari konteks AI bila tidak informatif. | Must |
| FR-MSG-004 | Sistem mempertahankan relasi reply agar jawaban tidak dipisahkan dari pertanyaan asal. | Should |
| FR-MSG-005 | Pesan bot, pesan duplikat, dan event retry tidak boleh dihitung dua kali. | Must |
| FR-MSG-006 | Jendela pagi mencakup `[20.00 hari sebelumnya, 08.00 hari ini)` dan jendela malam `[08.00, 20.00)`. | Must |

### 10.4 Ringkasan otomatis

| ID | Requirement | Prioritas |
|---|---|---|
| FR-SUM-001 | Ringkasan otomatis dijadwalkan setiap hari pukul 08.00 dan 20.00 WIB. | Must |
| FR-SUM-002 | Job mengambil snapshot pesan berdasarkan batas waktu tetap agar pesan baru tidak masuk ke dua ringkasan. | Must |
| FR-SUM-003 | Ringkasan memuat periode, statistik aktivitas, narasi lengkap, highlight, pesan penting, keputusan, tugas, jadwal, dokumen, dan pertanyaan terbuka. | Must |
| FR-SUM-004 | Pesan penting mencantumkan display name dan kutipan persis dari pesan sumber. | Must |
| FR-SUM-005 | Kutipan tidak boleh dibuat, diparafrasekan sebagai kutipan, atau diambil dari pesan yang telah dihapus. | Must |
| FR-SUM-006 | Keputusan harus dibedakan dari usulan, opini, rencana tentatif, dan pertanyaan. | Must |
| FR-SUM-007 | Tugas harus memuat penanggung jawab hanya bila eksplisit atau telah dikonfirmasi dalam percakapan. | Must |
| FR-SUM-008 | Bila tidak ada pesan dalam periode, bot tidak mengirim ringkasan. | Must |
| FR-SUM-009 | Bila hanya ada aktivitas rendah, bot mengirim versi singkat tanpa section kosong. | Must |
| FR-SUM-010 | Ringkasan target maksimal 3.500 karakter; bila lebih panjang, bot membaginya menjadi maksimal tiga bagian bernomor pada boundary section atau bullet yang aman. | Should |
| FR-SUM-011 | Setiap fakta penting dalam output terstruktur memiliki referensi internal ke message ID sumber. | Must |
| FR-SUM-012 | Job bersifat idempoten berdasarkan group ID, start time, dan end time. | Must |
| FR-SUM-013 | Admin dapat menjalankan `.ringkas sekarang` tanpa mengubah checkpoint ringkasan otomatis berikutnya. | Must |
| FR-SUM-014 | Bot mengirim ringkasan hanya setelah output AI lengkap, tervalidasi, dan dipetakan kembali ke nama lokal. | Must |
| FR-SUM-015 | Split tidak boleh memotong kutipan, tugas, jadwal, atau bullet; jika masih melebihi tiga bagian, narasi/highlight dipadatkan tanpa membuang keputusan, tugas, jadwal, dokumen penting, konflik, atau pertanyaan terbuka. | Must |
| FR-SUM-016 | Setiap bagian hasil split memuat urutan `(n/total)`, periode yang sama, dan pemisahan dilakukan sebelum pengiriman pertama. | Must |
| FR-SUM-017 | Setelah outage berdurasi `≤ 6 jam` dengan backlog coverage yang dapat diverifikasi lengkap, bot mengirim ringkasan penuh berheader `⚠️ RINGKASAN TERLAMBAT`, periode normal, dan durasi keterlambatan. | Must |
| FR-SUM-018 | Setelah outage `> 6 jam` atau coverage tidak dapat diverifikasi, bot mengirim `⚠️ RINGKASAN PEMULIHAN — MUNGKIN TIDAK LENGKAP` hanya dari pesan yang tersedia. | Must |
| FR-SUM-019 | Recovery digest menyebut periode target, periode data yang tersedia, rentang gap yang diketahui, penyebab keterlambatan bila aman, dan peringatan bahwa keputusan/tugas mungkin terlewat. | Must |
| FR-SUM-020 | Tidak ada window yang dilewati diam-diam: setiap window berstatus `completed`, `delayed_complete`, `recovery_incomplete`, atau `failed_notified`. | Must |
| FR-SUM-021 | Tepat enam jam masuk jalur delayed-complete bila coverage lengkap; durasi lebih dari enam jam, termasuk enam jam satu detik, selalu masuk recovery-incomplete. | Must |

### 10.5 Format ringkasan

Urutan default:

1. Header dan periode.
2. Statistik aktivitas.
3. Ringkasan lengkap.
4. Highlight penting.
5. Pesan penting dengan nama dan kutipan.
6. Keputusan.
7. Tugas dan penanggung jawab.
8. Jadwal terkonfirmasi dan kandidat jadwal.
9. Dokumen yang dibagikan.
10. Hal yang belum terselesaikan.

Ketentuan kualitas:

- Maksimal 10 highlight dan 8 kutipan penting per ringkasan, kecuali seluruhnya diperlukan untuk mencegah hilangnya keputusan.
- Satu pengirim tidak mendominasi kutipan bila pesan lain sama pentingnya.
- Percakapan sensitif tidak dikutip lebih panjang dari yang diperlukan.
- Jika terdapat konflik, ringkasan menyebutkan bahwa belum ada kesepakatan.
- Bot tidak menggunakan frasa kepastian untuk informasi tentatif.

### 10.6 PDF dan dokumen

| ID | Requirement | Prioritas |
|---|---|---|
| FR-PDF-001 | Sistem mendeteksi PDF yang dikirim dalam grup allowlist dan menyimpan metadata serta hash file. | Must |
| FR-PDF-002 | File yang sama tidak diproses ulang dalam periode retensi. | Must |
| FR-PDF-003 | PDF native-text diekstrak secara lokal; PDF scan menggunakan OCR lokal. | Must |
| FR-PDF-004 | MVP menerima PDF maksimal 20 MB dan maksimal 100 halaman. | Must |
| FR-PDF-005 | PDF terenkripsi, rusak, terlalu besar, atau tidak terbaca dilaporkan sebagai tidak dapat diproses tanpa menggagalkan ringkasan. | Must |
| FR-PDF-006 | Analisis memuat judul, tujuan, poin utama, keputusan, tugas, tanggal/tenggat, dan halaman sumber bila tersedia. | Must |
| FR-PDF-007 | Hasil PDF masuk ke ringkasan periodik dan tidak otomatis mengirim pesan terpisah. | Must |
| FR-PDF-008 | Admin dapat meminta pemrosesan ulang dengan `.pdf proses <id>`. | Should |
| FR-PDF-009 | Sistem menjalankan pemeriksaan pola data sensitif sebelum mengirim teks PDF ke AI. | Must |
| FR-PDF-010 | Dokumen yang terindikasi berisi NIK/KTP, nomor rekening, kredensial, tanda tangan, data kesehatan, atau data sensitif lain tidak dikirim ke AI tanpa konfirmasi eksplisit admin. | Must |
| FR-PDF-011 | File mentah dihapus maksimal 24 jam setelah ekstraksi berhasil atau gagal final. | Must |

### 10.7 Deteksi dan pengelolaan jadwal

| ID | Requirement | Prioritas |
|---|---|---|
| FR-SCH-001 | Sistem mendeteksi pembicaraan yang berpotensi menjadi kegiatan, rapat, tenggat, atau janji. | Must |
| FR-SCH-002 | Semua hasil deteksi otomatis dibuat sebagai kandidat, bukan jadwal aktif. | Must |
| FR-SCH-003 | Kandidat tidak menghasilkan pengingat sebelum dikonfirmasi admin. | Must |
| FR-SCH-004 | Kandidat menampilkan judul, tanggal, waktu, lokasi, sumber, bagian ambigu, dan ID kandidat. | Must |
| FR-SCH-005 | Kandidat ditampilkan dalam ringkasan periodik agar bot tidak mengganggu percakapan secara real-time. | Must |
| FR-SCH-006 | Kata relatif seperti “besok” dihitung berdasarkan timestamp pesan sumber dalam Asia/Jakarta. | Must |
| FR-SCH-007 | Istilah kabur seperti “malam”, “nanti”, atau “minggu depan” tidak diterjemahkan menjadi waktu pasti tanpa admin. | Must |
| FR-SCH-008 | Admin dapat mengonfirmasi, melengkapi, mengubah, menolak, atau membatalkan jadwal. | Must |
| FR-SCH-009 | Kandidat yang tidak dikonfirmasi kedaluwarsa setelah default 72 jam; nilainya configurable per grup dalam rentang 24–168 jam dan tidak boleh melewati waktu kegiatan yang sudah pasti. | Must |
| FR-SCH-010 | Jadwal yang dibuat dengan perintah eksplisit admin langsung berstatus terkonfirmasi. | Must |
| FR-SCH-011 | Perubahan jadwal mempertahankan audit trail versi sebelumnya. | Should |
| FR-SCH-012 | Pembatalan jadwal menghentikan semua pengingat yang belum terkirim. | Must |

### 10.8 Kebijakan ambiguitas jadwal

| Kondisi | Perilaku |
|---|---|
| Tanggal, waktu, dan kegiatan jelas | Buat kandidat lengkap; tunggu konfirmasi admin |
| Tanggal jelas, waktu tidak ada | Buat kandidat dengan `waktu belum ditentukan` |
| Waktu jelas, tanggal tidak ada | Buat kandidat dengan `tanggal belum ditentukan` |
| “Besok” atau nama hari | Resolusi dari timestamp sumber; tampilkan tanggal absolut untuk admin |
| “Minggu depan”, “nanti”, “malam” | Jangan menebak; tandai bagian ambigu |
| Dua waktu berbeda dalam diskusi | Tampilkan konflik dan semua opsi; jangan memilih |
| Ada kata “batal” dari admin | Batalkan jadwal terkait setelah pencocokan dan konfirmasi bila lebih dari satu kandidat |
| Pesan bercanda/tidak serius | Abaikan bila konteks tidak menunjukkan rencana nyata |

### 10.9 Pengingat

| ID | Requirement | Prioritas |
|---|---|---|
| FR-REM-001 | Jadwal terkonfirmasi mendapat pengingat pada pukul 19.00 WIB sehari sebelumnya dan dua jam sebelum acara. | Must |
| FR-REM-002 | Jika jadwal dikonfirmasi setelah salah satu waktu pengingat lewat, hanya pengingat berikutnya yang dikirim. | Must |
| FR-REM-003 | Setiap pengingat hanya terkirim satu kali. | Must |
| FR-REM-004 | Pengingat memuat nama kegiatan, tanggal absolut, waktu, lokasi, dan catatan singkat. | Must |
| FR-REM-005 | Admin dapat menonaktifkan salah satu atau seluruh pengingat per jadwal. | Should |
| FR-REM-006 | Pengingat tidak dikirim untuk kandidat kedaluwarsa, ditolak, atau dibatalkan. | Must |

### 10.10 Perintah admin

| Perintah | Fungsi |
|---|---|
| `.aktifkan` | Memulai flow aktivasi dan menampilkan pemberitahuan privasi |
| `.aktifkan setuju` | Mengonfirmasi bahwa consent grup telah diperoleh |
| `.ringkas sekarang` | Membuat ringkasan sejak checkpoint otomatis terakhir hingga sekarang |
| `.jadwal` | Menampilkan jadwal terkonfirmasi dan kandidat aktif |
| `.jadwal tambah "judul" DD-MM-YYYY HH:mm "lokasi"` | Membuat jadwal terkonfirmasi |
| `.jadwal konfirmasi <id> [koreksi]` | Mengonfirmasi atau melengkapi kandidat |
| `.jadwal ubah <id> ...` | Mengubah jadwal |
| `.jadwal batal <id>` | Membatalkan jadwal |
| `.jadwal tolak <id>` | Menolak kandidat |
| `.pdf proses <id>` | Meminta pemrosesan ulang PDF |
| `.pdf izinkan <id>` | Memberi konfirmasi eksplisit untuk memproses PDF yang ditahan sensitivity gate |
| `.status` | Menampilkan status koneksi dan job secara aman |
| `.pause` | Menjeda ingest dan job baru setelah konfirmasi |
| `.resume` | Melanjutkan bot |
| `.hapusdata` | Membuat permintaan penghapusan dan kode konfirmasi sekali pakai |
| `.hapusdata konfirmasi <kode>` | Menghapus data aktif bila dijalankan admin yang sama dalam waktu 10 menit |
| `.bantuan` | Menampilkan daftar perintah admin |

### 10.11 Consent dan transparansi

| ID | Requirement | Prioritas |
|---|---|---|
| FR-CNS-001 | Bot tidak mulai menyimpan pesan sebelum admin menjalankan proses aktivasi dan menyatakan consent grup telah diperoleh. | Must |
| FR-CNS-002 | Saat aktivasi, bot mengirim pemberitahuan tentang data yang diproses, tujuan, provider eksternal, retensi, dan cara menghubungi admin. | Must |
| FR-CNS-003 | Ketika anggota baru terdeteksi, bot mengirim pemberitahuan consent ringkas dan menandai admin untuk memastikan persetujuan. | Must untuk rilis warga |
| FR-CNS-004 | Admin dapat menjeda pemrosesan bila consent ditarik atau sedang dievaluasi. | Must |

---

## 11. Alur Pengguna

### 11.1 Aktivasi grup

1. Operator memasukkan JID grup ke allowlist.
2. Nomor bot ditambahkan ke grup menggunakan akun khusus.
3. Admin menjalankan `.aktifkan`.
4. Bot menampilkan pemberitahuan privasi dan meminta konfirmasi admin.
5. Admin menjalankan `.aktifkan setuju`.
6. Bot mencatat waktu aktivasi dan mulai memproses pesan setelah titik tersebut.

### 11.2 Ringkasan otomatis

1. Scheduler membuat window waktu tetap.
2. Worker mengambil snapshot pesan dan dokumen.
3. Preprocessor membuang noise, mempertahankan reply chain, dan mengganti identitas dengan alias.
4. Bila konteks besar, sistem membuat ringkasan per-chunk.
5. AI menghasilkan JSON terstruktur dengan referensi sumber.
6. Validator memastikan kutipan, nama alias, tanggal, dan message ID valid.
7. Renderer memetakan alias ke display name lokal.
8. Bot mengirim satu atau beberapa bagian ringkasan.
9. Checkpoint ditandai selesai secara atomik.

### 11.3 Kandidat jadwal

1. AI atau parser lokal menemukan kemungkinan jadwal.
2. Sistem menyimpan kandidat dengan bukti pesan.
3. Kandidat muncul pada ringkasan berikutnya.
4. Admin mengonfirmasi, memperbaiki, atau menolak.
5. Hanya kandidat terkonfirmasi yang menghasilkan pengingat.

### 11.4 PDF sensitif

1. PDF diterima dan diekstrak lokal.
2. Sensitivity scanner menemukan pola data berisiko.
3. Sistem tidak mengirim isi ke provider AI.
4. Ringkasan menyebut dokumen ditahan karena kemungkinan data sensitif.
5. Admin dapat memilih tidak memproses atau memberikan konfirmasi eksplisit.

---

## 12. Sistem AI dan Strict Fallback

### 12.1 Prinsip adopsi dari `Magang-Istana`

Pola yang dipertahankan:

- Konfigurasi model dan prompt menjadi single source of truth dalam YAML.
- Secret hanya berasal dari environment variable.
- Dua akun GitHub yang sah dapat menjadi route terpisah; token hanya kredensial akun dan tidak diasumsikan memiliki kuota independen.
- SDK tidak melakukan retry tersembunyi.
- Error 413, 429, timeout, auth, dan provider failure diklasifikasikan.
- Model dicoba sesuai urutan yang dapat diuji.
- Semua route gagal menghasilkan status eksplisit, bukan jawaban palsu.

Perbaikan untuk konteks WhatsApp:

- Output tidak di-stream ke grup.
- Fallback hanya terjadi sebelum output dipublikasikan.
- Circuit breaker mencegah provider yang sedang limit dicoba berulang.
- Model dipisah per lane/tugas.
- Output harus lolos JSON schema dan evidence validation.
- Context terlalu besar dipecah, bukan hanya dilempar ke model lain.

### 12.2 Lane ringkasan

Urutan awal, dapat diubah lewat konfigurasi tanpa perubahan kode:

1. GPT-4.1 Mini — token utama.
2. GPT-4.1 Mini — token cadangan.
3. GPT-4.1 Nano — token utama.
4. GPT-4.1 Nano — token cadangan.

### 12.3 Lane PDF/notulensi

1. GPT-4.1 — token utama.
2. GPT-4.1 — token cadangan.
3. GPT-4o — token utama.
4. GPT-4o — token cadangan.
5. Mistral model yang tersedia di GitHub Models — token utama/cadangan.

### 12.4 Lane jadwal

1. Parser tanggal lokal dan aturan Bahasa Indonesia.
2. GPT-4.1 Nano bila konteks ambigu.
3. GPT-4.1 Mini bila Nano gagal menghasilkan schema valid.

### 12.5 Provider di luar GitHub

- Bedrock, Groq, dan Gemini tidak aktif secara default pada MVP.
- Bedrock dapat diaktifkan sebagai emergency fallback hanya setelah persetujuan product owner, model tersedia, dan cost cap ditetapkan.
- Sistem tidak boleh merotasi akun untuk menghindari pembatasan yang dilarang provider. Seluruh penggunaan harus mematuhi ketentuan GitHub.

### 12.6 Model kuota GitHub

- Free usage diasumsikan dibatasi pada tingkat **account–model/model tier**, bukan pada nilai token/PAT.
- Dua token dari akun yang sama tidak memberikan diversifikasi kuota dan tidak boleh didaftarkan sebagai route cadangan yang seolah-olah independen.
- Setiap route menyimpan `account_alias`, `model_id`, dan credential reference; tidak menyimpan token mentah dalam konfigurasi.
- Circuit breaker dan statistik kuota menggunakan key `(account_alias, model_id)`.
- Dua akun berbeda tetap dapat terkena limit model pada waktu berdekatan; mitigasi utama adalah fallback lintas model, pengurangan context, caching, dan deferred retry.
- Daftar model serta limit diperiksa saat deployment dan direview minimal bulanan karena layanan berada dalam preview dan dapat berubah.

### 12.7 Kebijakan retry dan circuit breaker

- Timeout koneksi: 10 detik; timeout respons: 60 detik untuk ringkasan dan 120 detik untuk PDF.
- Satu route hanya dicoba sekali per job.
- `429`: hormati `Retry-After`; jika tidak tersedia, pasangan account–model memasuki cooldown 30 menit.
- `401/403`: route dinonaktifkan sampai operator memperbaiki token.
- `413`: context diperkecil/chunked; tidak langsung mengulang payload sama.
- `5xx/timeout`: cooldown 5 menit.
- Setelah semua route gagal, job dijadwalkan ulang setelah 15 menit, lalu 60 menit.
- Setelah tiga kegagalan job, status menjadi `failed_final` dan admin diberi notifikasi singkat.

### 12.8 Kontrak output ringkasan

```json
{
  "period": {"start": "ISO-8601", "end": "ISO-8601"},
  "activity": {"message_count": 0, "participant_count": 0},
  "narrative": "string",
  "highlights": [
    {"text": "string", "source_message_ids": ["id"]}
  ],
  "important_messages": [
    {"speaker_alias": "PERSON_001", "quote": "exact string", "source_message_id": "id"}
  ],
  "decisions": [
    {"text": "string", "status": "confirmed|tentative|disputed", "source_message_ids": ["id"]}
  ],
  "tasks": [
    {"text": "string", "assignee_alias": "PERSON_001|null", "due_at": "ISO-8601|null", "source_message_ids": ["id"]}
  ],
  "schedule_candidates": [
    {"title": "string", "date": "YYYY-MM-DD|null", "time": "HH:mm|null", "location": "string|null", "ambiguities": [], "source_message_ids": ["id"]}
  ],
  "documents": [],
  "open_questions": []
}
```

### 12.9 Validasi anti-halusinasi

- Setiap source message ID harus ada dalam snapshot.
- Kutipan harus merupakan substring persis dari pesan sumber setelah normalisasi whitespace.
- Speaker alias harus cocok dengan pengirim message ID.
- Tanggal relatif dihitung ulang oleh kode lokal.
- Keputusan tanpa bukti diturunkan menjadi highlight tentatif atau dibuang.
- Assignee yang tidak disebut eksplisit harus bernilai `null`.
- Jika validasi kritis gagal, output tidak dikirim dan route berikutnya dicoba.

---

## 13. Arsitektur Teknis Konseptual

```text
WhatsApp Group
      │ WhatsApp Web companion session
      ▼
WhatsApp Gateway — Node.js/TypeScript + Baileys
      ├── allowlist & admin authorization
      ├── message normalization
      ├── outbound renderer
      ├── scheduler & persistent job queue
      ├── SQLite owner (single writer)
      └── connection/reconnect manager
      │ HTTP JSON + bearer token
      ▼
AI Worker — Python/FastAPI
      ├── stateless task processor
      ├── preprocessing/chunking
      ├── PDF extraction + OCR
      ├── schedule parser
      ├── GitHub Models cascade
      └── schema/evidence validator

Node-owned storage
      ├── SQLite on encrypted EBS
      ├── temporary document volume
      └── SSE-S3 encrypted backup
```

### 13.1 Boundary service

- Gateway bertanggung jawab atas protokol WhatsApp dan tidak menyimpan API key AI.
- Gateway merupakan satu-satunya process yang membuka SQLite untuk operasi aplikasi, memiliki scheduler, dan melakukan seluruh read/write bisnis.
- AI worker stateless terhadap database aplikasi: menerima snapshot/input, memprosesnya, dan mengembalikan output tanpa membuka file SQLite.
- AI worker tidak terekspos ke internet publik dan menyimpan credential provider hanya melalui environment/secret runtime.
- Database yang dimiliki gateway merupakan sumber status job, jadwal, idempotency, dan audit.
- Restart salah satu service tidak boleh merusak state service lain.

### 13.2 Kontrak komunikasi internal

- Transport dipilih secara final: HTTP/1.1 JSON request-response.
- Pada Docker Compose, worker hanya tersedia pada private bridge network dan port tidak dipublish ke host/internet.
- Pada systemd, worker bind ke `127.0.0.1`; tidak bind ke `0.0.0.0`.
- Setiap request memakai bearer token acak minimal 256-bit, `X-Request-ID`, dan `Idempotency-Key` untuk operasi job.
- Gateway menetapkan connect timeout, response timeout per lane, dan batas ukuran body/file.
- File PDF diberikan melalui temporary shared volume dengan path/ID tervalidasi; worker tidak menerima path arbitrer.
- Response harus memenuhi versioned JSON schema sebelum ditulis gateway ke database.
- Log kedua service hanya menyimpan request ID, status, durasi, dan error class tanpa bearer token atau isi payload.

### 13.3 Deployment awal

- AWS Region: `ap-southeast-1` sebagai default karena dekat dengan pengguna Indonesia.
- Compute: EC2 ARM `t4g.small` atau instance free-plan-eligible setara.
- OS: Ubuntu LTS ARM64.
- Storage: EBS gp3 terenkripsi 15–20 GB.
- Runtime: Docker Compose atau systemd; satu host untuk MVP.
- Concurrency: maksimal satu AI/PDF job aktif dan satu halaman OCR diproses pada satu waktu.
- Estimasi RSS saat job berat: gateway ≤ 200 MiB, worker beserta child OCR ≤ 1 GiB, dan OS/agent/SQLite ≤ 400 MiB; sekitar 400 MiB tersisa untuk page cache serta safety margin. Hard container limit awal: gateway 256 MiB dan worker+OCR 1,25 GiB.
- Swap: 1 GiB terenkripsi sebagai proteksi crash, bukan pengganti RAM; sustained swapping memicu alert.
- Inbound security group: tidak ada port aplikasi publik; administrasi melalui AWS Systems Manager bila tersedia.
- Outbound: WhatsApp Web, GitHub Models, package registry saat deploy, dan AWS APIs yang diperlukan.
- Backup: S3 dengan SSE-S3, Block Public Access, IAM least privilege, dan lifecycle 30 hari; MVP tidak memakai customer-managed KMS key.
- Jika load test melampaui 80% memory secara berkelanjutan atau mengalami OOM, pilot tidak dilanjutkan sebelum optimasi atau perubahan instance disetujui melalui cost review.

---

## 14. Model Data Konseptual

| Entitas | Fungsi | Field kunci |
|---|---|---|
| `groups` | Grup allowlist dan konfigurasi | jid, name, timezone, status, summary_times |
| `participants` | Alias lokal dan status anggota | participant_id, group_id, wa_jid_hmac, display_name, current_role |
| `messages` | Pesan mentah terbatas retensi | message_id, group_id, participant_id, timestamp, type, content, reply_to, deleted_at |
| `documents` | Metadata dan hasil ekstraksi | message_id, hash, filename, status, sensitivity, extracted_text_path |
| `summary_windows` | Idempotency dan hasil ringkasan | group_id, start_at, end_at, status, rendered_text, model_route |
| `summary_evidence` | Relasi output ke pesan | summary_id, section, item_id, message_id |
| `schedule_candidates` | Kandidat hasil deteksi | title, date, time, location, ambiguity, expires_at, status |
| `schedules` | Jadwal terkonfirmasi | title, starts_at, location, status, source_candidate_id |
| `reminders` | Pengiriman pengingat | schedule_id, type, due_at, sent_at, status |
| `admin_actions` | Audit tindakan admin | participant_id, command, target_type, target_id, timestamp |
| `provider_health` | Circuit breaker | account_alias, model_id, state, cooldown_until, last_error_class |
| `jobs` | Antrean persisten | type, payload_ref, status, attempts, run_after, idempotency_key |

Tidak ada token, kredensial, auth key, JID anggota mentah, atau mapping identitas reversible dalam tabel aplikasi umum. `wa_jid_hmac` dibuat menggunakan HMAC-SHA256 dengan secret terpisah; gateway dapat memverifikasi identitas baru dengan menghitung ulang HMAC tanpa dapat mengembalikan hash menjadi nomor telepon. Audit mempertahankan `participant_id` dan riwayat display name untuk konteks operasional.

---

## 15. Requirement Nonfungsional

### 15.1 Reliability

| ID | Requirement |
|---|---|
| NFR-REL-001 | Ringkasan dan pengingat menggunakan idempotency key unik. |
| NFR-REL-002 | Hanya gateway Node.js membuka SQLite aplikasi; worker Python tidak memiliki koneksi database. SQLite menggunakan WAL, transaksi write singkat, `busy_timeout` awal 5 detik, bounded retry, dan checkpoint terkontrol. |
| NFR-REL-003 | Service otomatis restart setelah crash dengan backoff. |
| NFR-REL-004 | Backup terjadwal minimal sekali sehari dan diuji restore sebelum rollout warga. |
| NFR-REL-005 | Kehilangan koneksi WhatsApp tidak menghapus job atau jadwal. |
| NFR-REL-006 | Pesan outbound yang gagal disimpan dan dicoba ulang maksimal tiga kali tanpa duplikasi. |
| NFR-REL-007 | Jika SQLite tetap mengembalikan `SQLITE_BUSY` setelah bounded retry, operasi masuk persistent retry/error handling dan tidak boleh hilang atau diulang tanpa idempotency. |

### 15.2 Performance

| ID | Requirement |
|---|---|
| NFR-PERF-001 | Ingest pesan dipersist dalam p95 ≤ 2 detik setelah event diterima. |
| NFR-PERF-002 | Ringkasan normal selesai ≤ 10 menit dan dikirim ≤ 15 menit dari jadwal. |
| NFR-PERF-003 | Pemrosesan PDF ≤ 100 halaman selesai ≤ 20 menit dalam kondisi provider tersedia. |
| NFR-PERF-004 | Maksimal satu AI/PDF job dan satu halaman OCR aktif pada satu waktu. Estimasi RSS: gateway ≤ 200 MiB, worker+OCR ≤ 1 GiB, OS/agent/SQLite ≤ 400 MiB. Load test wajib membuktikan p95 host memory < 80% dan transient peak < 90% tanpa OOM sebelum pilot. |
| NFR-PERF-005 | Host memakai swap terenkripsi 1 GiB untuk proteksi burst; sustained swap, OOM, atau memory ≥ 90% menghentikan penerimaan job berat baru dan memicu alert. |

### 15.3 Security

| ID | Requirement |
|---|---|
| NFR-SEC-001 | Secret hanya disimpan di environment/secret store dengan permission minimum. |
| NFR-SEC-002 | Deployment tidak menggunakan kredensial root AWS. |
| NFR-SEC-003 | EC2 menggunakan IAM role least privilege untuk S3/monitoring. |
| NFR-SEC-004 | EBS memakai AWS-managed encryption dan backup S3 memakai SSE-S3, TLS, Block Public Access, serta IAM least privilege. AWS mengelola pembuatan/rotasi key; MVP tidak memiliki customer-managed key yang dapat hilang. |
| NFR-SEC-005 | JID anggota dipseudonimkan dengan HMAC-SHA256 menggunakan secret terpisah; database tidak menyimpan JID mentah atau mapping reversible. |
| NFR-SEC-006 | Nomor telepon, API key, session key, dan isi pesan tidak masuk log operasional. |
| NFR-SEC-007 | Dependency dikunci dengan lockfile dan diperiksa kerentanannya sebelum deploy. |
| NFR-SEC-008 | Auth state Baileys dipisahkan dari source code dan backup-nya terenkripsi. |
| NFR-SEC-009 | Prompt menganggap isi pesan dan PDF sebagai data, bukan instruksi sistem. |
| NFR-SEC-010 | Secret HMAC dan bearer token internal dapat dirotasi melalui runbook; rotasi HMAC harus menjaga periode transisi/versioned key agar participant aktif tidak langsung kehilangan keterkaitan. |

### 15.4 Maintainability

| ID | Requirement |
|---|---|
| NFR-MNT-001 | Konfigurasi model, prompt, jadwal, retensi, dan allowlist tidak di-hardcode. |
| NFR-MNT-002 | Gateway WhatsApp, domain logic, dan provider AI memiliki interface terpisah. |
| NFR-MNT-003 | Semua requirement Must yang dapat diotomasi memiliki test. |
| NFR-MNT-004 | Upgrade Baileys dilakukan terkontrol setelah regression test, bukan otomatis ke latest. |
| NFR-MNT-005 | Runbook pairing ulang, restore backup, rotasi token, dan migrasi server tersedia sebelum pilot. |

### 15.5 Accessibility dan bahasa

- Keluaran menggunakan Bahasa Indonesia yang jelas dan tidak terlalu teknis.
- Tanggal selalu ditampilkan absolut, misalnya `Minggu, 26 Juli 2026`.
- Waktu selalu menyebut WIB pada konteks yang dapat membingungkan.
- Emoji hanya menjadi penanda section dan bukan satu-satunya penyampai makna.

### 15.6 Operability dan health check

| ID | Requirement |
|---|---|
| NFR-OPS-001 | Gateway menyediakan `GET /health/live` untuk process/event-loop liveness dan `GET /health/ready` untuk SQLite, scheduler heartbeat, serta kemampuan menerima event. |
| NFR-OPS-002 | Worker menyediakan `GET /health/live` dan `GET /health/ready`; readiness memeriksa konfigurasi, temporary volume, dependency lokal, serta binary OCR tanpa melakukan provider call berbayar. |
| NFR-OPS-003 | Endpoint health hanya tersedia pada loopback/private service network, tidak memuat secret, prompt, isi pesan, nomor telepon, atau path sensitif. |
| NFR-OPS-004 | Status provider eksternal, koneksi WhatsApp, dan konektivitas antar-service dilaporkan sebagai dependency fields/degraded state agar gangguan dependency tidak memicu restart loop process yang sehat. |

---

## 16. Privasi, Retensi, dan Tata Kelola Data

### 16.1 Data yang diproses

- Isi pesan grup allowlist.
- Display name dan identifier pseudonymous pengirim.
- Timestamp, reply relation, dan role admin.
- PDF serta hasil ekstraksinya.
- Jadwal, ringkasan, dan audit tindakan admin.

### 16.2 Data yang tidak diproses

- Chat pribadi.
- Grup di luar allowlist.
- Status WhatsApp.
- Kontak perangkat di luar kebutuhan identifikasi pengirim grup.
- Isi pesan sebelum consent/aktivasi.

### 16.3 Pseudonymization sebelum AI

- Nomor telepon tidak dikirim ke provider.
- JID dinormalisasi lalu diubah menjadi versioned HMAC; plain cryptographic hash tanpa secret tidak digunakan.
- Display name diganti alias seperti `PERSON_001` dalam prompt.
- Mapping alias ke nama hanya dilakukan lokal setelah output tervalidasi.
- Audit merujuk `participant_id` dan riwayat display name. Saat identitas aktif perlu diverifikasi, gateway menghitung ulang HMAC dari JID event; sistem sengaja tidak dapat memulihkan nomor dari database saja.
- Penyimpanan mapping reversible hanya dapat ditambahkan bila ada kebutuhan hukum/operasional baru melalui revisi PRD dan threat model.
- URL yang mengandung token dan pola secret dihapus.
- PDF melewati redaksi pola sensitif sebelum provider call.

### 16.4 Retensi default

| Data | Retensi |
|---|---:|
| Pesan mentah | 14 hari |
| File PDF mentah | Maksimal 24 jam setelah ekstraksi |
| Teks hasil ekstraksi PDF | 14 hari |
| Ringkasan final | 90 hari |
| Kandidat jadwal ditolak/kedaluwarsa | 30 hari |
| Jadwal terkonfirmasi | 90 hari setelah kegiatan |
| Audit log admin | 90 hari |
| Log operasional tanpa konten | 30 hari |
| Auth state | Selama bot aktif; dihapus saat decommission |

### 16.5 Hak dan kontrol

- Admin dapat menjeda ingest.
- Admin dapat meminta penghapusan data grup.
- `.hapusdata` menghasilkan nonce acak sekali pakai; hanya admin peminta yang dapat menjalankan `.hapusdata konfirmasi <kode>` dalam 10 menit. Nonce kedaluwarsa atau aktor berbeda wajib ditolak.
- Penghapusan mencakup database, file sementara, dan backup sesuai siklus lifecycle.
- Ringkasan yang sudah terkirim di WhatsApp tidak dapat dihapus dari perangkat anggota oleh sistem; batas ini harus dijelaskan dalam notice.

---

## 17. AWS, Biaya, dan Rencana Satu Tahun

### 17.1 Kondisi awal terverifikasi

Per 21 Juli 2026:

- AWS Free Plan: aktif.
- Kredit tersisa: USD 199,95.
- Masa Free Plan berakhir: 16 Januari 2027.
- Belum ada EC2/Lightsail aktif di region yang diperiksa.

### 17.2 Guardrail biaya

- Gunakan satu EC2 tanpa load balancer, RDS, NAT Gateway, atau layanan mahal lain.
- Forecast bulanan ditargetkan ≤ USD 15 termasuk storage dan transfer.
- Buat AWS Budget alert pada USD 5, USD 10, dan USD 15 per bulan.
- Alert tambahan saat credits tersisa 50%, 25%, dan 10%.
- Tidak ada upgrade plan otomatis.
- Bedrock default nonaktif.
- Backup memiliki lifecycle dan batas ukuran.
- Operator meninjau cost dashboard minimal mingguan selama pilot.

### 17.3 Enkripsi dan pemulihan backup

- EBS menggunakan default encryption dengan AWS-managed key.
- Bucket backup menggunakan SSE-S3; Amazon S3 mengelola generation, storage, dan rotation key sehingga operator tidak menyimpan key enkripsi manual.
- Bucket mengaktifkan Block Public Access, versioning bila masih sesuai budget, TLS-only bucket policy, dan IAM role gateway dengan akses prefix minimum.
- Kehilangan akses akun/IAM tetap dapat membuat backup tidak tersedia; root MFA, recovery contact, dan prosedur account recovery wajib dijaga.
- Restore drill dilakukan minimal sebelum pilot, sebelum rilis warga, dan setiap tiga bulan; keberhasilan restore dicatat tanpa menyalin data nyata ke environment tidak aman.
- Perubahan ke SSE-KMS/customer-managed key memerlukan revisi threat model, kebijakan rotasi/deletion protection, dan simulasi key-loss sebelum diterapkan.

### 17.4 Decision gate

- **15 Desember 2026:** evaluasi credits, penggunaan, dan kelayakan rilis warga.
- **Pilihan A:** upgrade ke paid plan secara sadar agar sisa credits dapat digunakan sampai masa berlakunya, dengan budget dan penghentian otomatis sebelum credits habis.
- **Pilihan B (default tanpa persetujuan baru):** migrasi ke perangkat lokal/VPS gratis lain dan hentikan resource AWS sebelum 16 Januari 2027.
- Backup portabel dan Docker Compose harus memungkinkan migrasi maksimal empat jam.

Target satu tahun adalah target operasional, bukan jaminan AWS Free Plan selama satu tahun.

---

## 18. Observability dan Operasional

### 18.1 Metric minimum

- Status koneksi WhatsApp dan waktu koneksi terakhir.
- Jumlah pesan masuk per grup.
- Lag ingest.
- Durasi dan status job ringkasan/PDF.
- Route model yang digunakan tanpa mencatat prompt.
- Jumlah 429 per account–model, 413, timeout, dan schema validation failure.
- Jumlah/durasi `SQLITE_BUSY`, ukuran WAL, dan waktu checkpoint.
- Liveness/readiness kedua service serta latency HTTP internal.
- RSS memory gateway/worker, total host memory, swap activity, dan OOM event.
- Kandidat jadwal dibuat/dikonfirmasi/ditolak.
- Pengingat berhasil/gagal.
- Ukuran database, disk, dan backup.
- Estimasi biaya/credits AWS.

### 18.2 Alert

| Kondisi | Respons |
|---|---|
| WhatsApp disconnected > 5 menit | Alert operator |
| Pairing/logout | Alert prioritas tinggi dan hentikan outbound |
| Ringkasan terlambat > 15 menit | Alert operator |
| Tiga provider/job failure | Notifikasi admin dan operator |
| Disk > 80% | Alert dan jalankan cleanup aman |
| Memory ≥ 80% selama 5 menit | Alert dan tahan job berat baru bila terus meningkat |
| Memory ≥ 90%, sustained swap, atau OOM | Hentikan job berat, pertahankan ingest, alert prioritas tinggi |
| Health readiness gagal > 2 menit | Alert operator tanpa restart loop dependency yang sehat |
| `SQLITE_BUSY` melewati bounded retry | Alert dan pindahkan operasi ke retry/error queue |
| Backup gagal dua kali | Alert prioritas tinggi |
| Credits/budget threshold | Alert product owner |

### 18.3 Runbook wajib

- Pairing dan pairing ulang Baileys.
- Rotasi token GitHub.
- Pemulihan job tertunda.
- Restore SQLite dari backup.
- Verifikasi SSE-S3, account recovery, dan restore tanpa customer-managed key.
- Penanganan memory pressure/OOM dan penyesuaian concurrency.
- Penanganan outage dengan recovery digest.
- Penanganan pesan/ringkasan duplikat.
- Respons insiden privasi.
- Upgrade/rollback Baileys.
- Migrasi keluar AWS.
- Decommission dan penghapusan data.

---

## 19. Edge Cases

1. Tidak ada pesan pada window: tidak mengirim apa pun.
2. Hanya stiker/salam: ringkasan singkat atau dilewati bila tidak bermakna.
3. Lebih dari 500 pesan: hierarchical chunking dan merge berbukti.
4. Pesan masuk tepat pukul 08.00/20.00: masuk window berikutnya.
5. Admin berubah saat command: role diperiksa ulang.
6. Bot offline `≤ 6 jam` dan backlog terbukti lengkap: kirim ringkasan penuh dengan header `⚠️ RINGKASAN TERLAMBAT`, periode normal, serta durasi keterlambatan; tepat enam jam termasuk jalur ini.
7. Bot offline `> 6 jam` atau backlog tidak dapat dibuktikan lengkap: kirim `⚠️ RINGKASAN PEMULIHAN — MUNGKIN TIDAK LENGKAP` berisi periode target, coverage aktual, gap, dan hanya fakta dari pesan yang tersedia; window tidak boleh dihapus diam-diam.
8. AI gagal seluruhnya: tidak mengirim ringkasan spekulatif; retry sesuai kebijakan.
9. Output valid tetapi kosong: renderer membuat pesan aktivitas rendah berdasarkan data lokal.
10. PDF duplikat dengan nama berbeda: deduplikasi berdasarkan hash.
11. PDF sensitif: ditahan, tidak dikirim ke AI.
12. Jadwal melewati tengah malam: timestamp disimpan lengkap dengan timezone.
13. Dua kandidat serupa: sistem menyarankan merge, admin yang memutuskan.
14. Nama anggota berubah: ringkasan memakai nama saat render, evidence tetap participant ID.
15. Pesan diedit setelah ringkasan terkirim: tidak mengubah ringkasan lama; perubahan masuk ringkasan berikutnya bila penting.

---

## 20. Acceptance Criteria MVP

### AC-01 — Allowlist

**Given** bot menerima pesan dari grup yang tidak terdaftar, **when** event diproses, **then** tidak ada isi pesan yang disimpan atau dikirim ke AI.

### AC-02 — Ringkasan terjadwal

**Given** grup aktif memiliki pesan pada window 08.00–20.00, **when** pukul 20.00 WIB terlewati, **then** tepat satu ringkasan tervalidasi terkirim paling lambat pukul 20.15.

### AC-03 — Window tidak tumpang tindih

Pesan tepat pukul 20.00 tidak muncul pada ringkasan yang berakhir pukul 20.00 dan hanya dapat muncul pada window berikutnya.

### AC-04 — Kutipan

Setiap kutipan penting identik dengan substring pesan sumber dan nama yang ditampilkan cocok dengan pengirim pesan tersebut.

### AC-05 — Anti-halusinasi keputusan

Output dengan keputusan tanpa source message ID valid ditolak dan tidak dikirim.

### AC-06 — Aktivitas kosong

Window tanpa pesan tidak menghasilkan pesan “tidak ada aktivitas” di grup.

### AC-07 — Admin-only

Perintah dari anggota non-admin tidak mengubah data atau menjalankan job.

### AC-08 — Kandidat jadwal

Jadwal hasil deteksi otomatis tidak membuat row reminder sebelum admin mengonfirmasi.

### AC-09 — Ambiguitas

Pesan “mungkin rapat minggu depan malam” menghasilkan kandidat dengan tanggal/waktu belum pasti dan tidak mengarang timestamp.

### AC-10 — Pengingat

Jadwal terkonfirmasi menghasilkan maksimal satu pengingat sehari sebelumnya dan satu pengingat dua jam sebelumnya.

### AC-11 — Pembatalan

Setelah admin membatalkan jadwal, semua reminder pending berubah menjadi cancelled dan tidak dikirim.

### AC-12 — PDF

PDF native-text ≤ 20 MB dan ≤ 100 halaman menghasilkan ringkasan dokumen dengan evidence halaman bila ekstraksi menyediakan nomor halaman.

### AC-13 — PDF sensitif

PDF yang mengandung pola NIK atau nomor rekening tidak dikirim ke provider sebelum konfirmasi eksplisit admin.

### AC-14 — Provider fallback

Saat route pertama mengembalikan 429, pasangan account–model memasuki cooldown dan job mencoba route account–model berikutnya tepat satu kali tanpa menerbitkan output parsial. Dua PAT dari akun sama tidak diperlakukan sebagai kuota independen.

### AC-15 — Semua provider gagal

Saat seluruh route gagal, tidak ada ringkasan palsu; job masuk retry queue dan setelah batas retry admin menerima pemberitahuan kegagalan.

### AC-16 — Idempotency

Menjalankan ulang job dengan idempotency key yang sama tidak mengirim ringkasan atau pengingat kedua.

### AC-17 — Retensi

Cleanup harian menghapus pesan mentah yang lebih tua dari 14 hari dan file PDF mentah yang melewati 24 jam.

### AC-18 — Restart

Restart service tidak menghilangkan auth state, jadwal, reminder pending, atau checkpoint ringkasan.

### AC-19 — Log aman

Automated scan tidak menemukan API key, session key, nomor telepon lengkap, atau isi pesan dalam log operasional.

### AC-20 — Backup dan restore

Database dapat dipulihkan dari backup terakhir ke environment uji dan menghasilkan jumlah jadwal serta checkpoint yang sama.

### AC-21 — Single database owner

Automated architecture/integration test membuktikan hanya gateway Node.js yang membuka SQLite aplikasi; worker Python menyelesaikan job melalui HTTP tanpa koneksi database.

### AC-22 — Internal transport

Request worker tanpa bearer token valid ditolak, port worker tidak dipublish ke internet, dan request valid membawa request ID serta idempotency key yang tercatat tanpa payload sensitif.

### AC-23 — Admin rate limit

Pemanggilan `.ringkas sekarang` kedua dalam 30 menit dari grup yang sama ditolak dengan sisa cooldown dan tidak membuat job/provider call baru; batas harian empat tetap berlaku.

### AC-24 — Kandidat 72 jam

Kandidat tanpa waktu kegiatan pasti kedaluwarsa setelah default 72 jam; konfigurasi grup di luar rentang 24–168 jam ditolak.

### AC-25 — HMAC participant

Database dan log tidak mengandung JID anggota mentah. JID event yang sama menghasilkan participant HMAC yang sama untuk versi key aktif, sedangkan nilai database tidak dapat digunakan untuk memperoleh nomor asli.

### AC-26 — Recovery digest

Outage tepat enam jam dengan coverage lengkap menghasilkan `RINGKASAN TERLAMBAT`; outage enam jam satu detik menghasilkan `RINGKASAN PEMULIHAN — MUNGKIN TIDAK LENGKAP` dengan target period, actual coverage, dan gap.

### AC-27 — Health endpoints

Kedua service menyediakan liveness dan readiness internal. Worker yang kehilangan dependency eksternal melaporkan degraded dependency tanpa membocorkan secret atau menyebabkan process sehat masuk restart loop.

### AC-28 — Safe summary split

Ringkasan panjang dibagi maksimal tiga pesan hanya antar-section atau antar-bullet; tidak ada kutipan, tugas, atau jadwal terpotong dan setiap bagian berlabel urutan yang benar.

### AC-29 — Memory/concurrency

Load test membuktikan hanya satu AI/PDF job dan satu halaman OCR aktif, p95 memory host di bawah 80%, transient peak di bawah 90% tanpa OOM, serta memory pressure menghentikan job berat baru tanpa menghentikan ingest pesan.

### AC-30 — Managed backup encryption

Objek backup terverifikasi memakai SSE-S3, bucket menolak public access dan non-TLS request, serta restore berhasil tanpa customer-managed encryption key.

---

## 21. Strategi Pengujian

### 21.1 Unit test

- Normalisasi semua tipe pesan yang didukung.
- Admin authorization dan metadata refresh.
- Window boundary serta timezone.
- Deduplikasi dan idempotency.
- Parser tanggal Indonesia.
- PDF sensitivity scanner.
- JSON schema dan evidence validator.
- Renderer serta split message.
- Provider error classification dan circuit breaker.
- Account–model quota identity dan duplicate-account token detection.
- Admin command cooldown, daily limit, serta nonce `.hapusdata`.
- HMAC participant identity dan versioned key transition.
- Safe section/bullet split dan recovery digest renderer.
- Retention cleanup.

### 21.2 Integration test

- Event Baileys → database → summary job.
- Gateway → authenticated HTTP worker → validated response tanpa worker DB access.
- AI mock 200/401/413/429/5xx/timeout.
- PDF native dan scan → ekstraksi → summary.
- Candidate → confirm → reminder → send.
- Restart service dengan job pending.
- Health endpoint normal, degraded, dan dependency failure.
- WAL busy retry/checkpoint serta persistent recovery.
- Backup SSE-S3 dan restore.

### 21.3 End-to-end pilot test

- Grup sandbox dengan pesan sintetis.
- Jadwal eksplisit, ambigu, konflik, perubahan, dan pembatalan.
- PDF normal, scan, sensitif, encrypted, corrupt, oversized.
- Disconnect dan pairing ulang.
- Outage tepat 6 jam, 6 jam 1 detik, serta coverage tidak lengkap.
- Ringkasan panjang yang memerlukan split tiga bagian.
- Load test memory/OCR concurrency pada instance target.
- Simulasi provider outage.
- Audit 20 ringkasan oleh dua reviewer manusia.

### 21.4 Evaluasi kualitas AI

Dataset evaluasi minimal 30 window percakapan yang dianonimkan, mencakup percakapan pendek, panjang, informal, bercanda, konflik keputusan, PDF, dan jadwal ambigu. Penilaian mencakup coverage, attribution, faithfulness, decision classification, task extraction, dan schedule precision.

---

## 22. Rollout

### Fase 0 — Persiapan

- Finalisasi PRD.
- Siapkan nomor khusus, akun/token, AWS budget, dan consent notice.
- Buat threat model serta test dataset sintetis.

### Fase 1 — Sandbox

- Deploy ke grup uji kecil.
- Ringkasan hanya dipreview ke operator, belum dikirim otomatis.
- Validasi koneksi, format, fallback, dan retensi selama 3–5 hari.

### Fase 2 — Pilot grup KKN

- Aktifkan ringkasan otomatis dua kali sehari.
- Jalankan minimal 14 hari.
- Review ringkasan harian dan catat false positive/negative.
- Tidak menambah grup baru selama stabilisasi.

### Fase 3 — Hardening

- Perbaiki prompt dan rule berdasarkan evaluasi.
- Uji restore, incident response, pairing ulang, dan provider outage.
- Lengkapi panduan admin dan operator.

### Fase 4 — Rilis komunitas terbatas

- Onboard satu grup warga dengan consent baru.
- Pantau minimal 30 hari.
- Evaluasi bahasa, volume, privasi, dan penerimaan pengguna.

### Rollback

- Jalankan `.pause`.
- Hentikan outbound scheduler.
- Pertahankan database hanya selama investigasi sesuai retensi.
- Bila insiden privasi, cabut token/provider access dan lakukan prosedur penghapusan.
- Bila Baileys bermasalah, putuskan companion session dari perangkat utama.

---

## 23. Risiko dan Mitigasi

| Risiko | Kemungkinan | Dampak | Mitigasi |
|---|---|---|---|
| Nomor dibatasi/diblokir WhatsApp | Sedang | Tinggi | Nomor khusus, volume rendah, tanpa spam, allowlist, manual recovery |
| Breaking change Baileys | Tinggi | Sedang | Pin version, regression test, controlled upgrade, rollback |
| Pairing/session terputus | Sedang | Tinggi | Persistent auth, alert, runbook pairing ulang |
| GitHub quota berubah/habis | Sedang | Tinggi | Task lanes, chunking, circuit breaker, retry queue, provider config |
| Dua token ternyata berbagi kuota akun | Sedang | Sedang | Route diidentifikasi account–model; token akun sama tidak dianggap fallback independen |
| AI mengarang keputusan | Sedang | Tinggi | Evidence ID, exact-quote validator, schema validation, human audit |
| Jadwal palsu | Sedang | Tinggi | Semua auto-detected schedule wajib konfirmasi admin |
| Data pribadi terkirim ke provider | Sedang | Tinggi | Consent, alias lokal, redaction, sensitivity gate, retensi pendek |
| AWS plan berakhir | Pasti | Tinggi | Decision gate, portable deployment, migration runbook |
| Kredit AWS habis | Rendah–sedang | Tinggi | Budget alerts, satu instance, no RDS/NAT/LB, cost review |
| Root AWS disalahgunakan | Sedang | Kritis | IAM least privilege, MFA, tidak memakai root untuk deploy |
| Disk penuh karena media/log | Sedang | Sedang | Limit file, cleanup, log rotation, disk alert |
| Memory 2 GB habis saat OCR | Sedang | Tinggi | Single job/page concurrency, memory budget, swap guard, load test, cost-gated resize |
| SQLite lock/busy | Rendah | Tinggi | Node single owner, short transaction, busy timeout, bounded retry, WAL monitoring |
| Backup tidak dapat dipulihkan | Rendah | Tinggi | SSE-S3 managed keys, account recovery, periodic restore drill |
| Internal worker diakses tanpa izin | Rendah | Tinggi | Private bind/network, bearer token, body limit, no public port |
| Ringkasan terlalu panjang/noisy | Sedang | Sedang | Section limit, activity-aware rendering, split maksimal tiga bagian |

---

## 24. Dependensi

- Nomor WhatsApp khusus dan perangkat utama yang tetap aktif.
- Baileys dan kompatibilitas protokol WhatsApp Web.
- Node.js LTS serta Python 3.11+.
- Dua akun GitHub Models yang sah beserta token masing-masing; token dari akun yang sama tidak dihitung sebagai diversifikasi kuota.
- AWS EC2, EBS, IAM, S3, Budget/Cost monitoring.
- Parser PDF, OCR, dan date parser yang mendukung deployment ARM64.
- Admin grup yang bertanggung jawab atas consent dan konfirmasi jadwal.

---

## 25. Milestone Indikatif

| Milestone | Hasil |
|---|---|
| M0 — PRD approved | Scope dan acceptance criteria disetujui |
| M1 — Technical design | ADR, threat model, schema, dan test plan |
| M2 — WhatsApp foundation | Pairing, allowlist, ingest, admin commands |
| M3 — Summary MVP | Scheduled summary dan strict fallback |
| M4 — Schedule | Candidate, confirmation, reminder |
| M5 — PDF | Extraction, OCR, sensitivity, summary |
| M6 — AWS pilot | Deploy, monitoring, backup, budget |
| M7 — Pilot exit review | KPI, feedback, go/no-go warga |

Estimasi waktu ditentukan setelah technical design dan breakdown issue implementasi; PRD tidak mengunci tanggal delivery sebelum estimasi teknis.

---

## 26. Keputusan Produk yang Telah Dikunci

1. Baileys dipakai untuk pilot dengan risiko tidak resmi yang diterima.
2. Bot memakai nomor khusus.
3. Seluruh pesan grup allowlist dirangkum otomatis.
4. Ringkasan dikirim pukul 08.00 dan 20.00 WIB.
5. Ringkasan memuat narasi lengkap serta nama/kutipan untuk pesan penting.
6. Hanya admin/superadmin yang dapat menjalankan perintah.
7. Semua jadwal hasil deteksi otomatis wajib dikonfirmasi admin.
8. Kandidat ambigu tidak diterjemahkan secara spekulatif.
9. PDF dianalisis dalam ringkasan, bukan langsung membanjiri grup.
10. GitHub Models menjadi provider utama dengan strict fallback per lane.
11. Output tidak di-stream ke WhatsApp.
12. Node gateway dan Python AI worker dipisahkan; Node menjadi pemilik tunggal SQLite/scheduler/job queue dan Python stateless terhadap database.
13. Komunikasi service menggunakan HTTP JSON internal dengan bearer token, request ID, dan idempotency key.
14. Maksimal satu AI/PDF job dan satu halaman OCR aktif pada host 2 GB; load test menjadi gate pilot.
15. Circuit breaker GitHub menggunakan pasangan account–model, bukan token.
16. Kandidat jadwal kedaluwarsa default 72 jam dan configurable 24–168 jam.
17. JID anggota disimpan sebagai HMAC non-reversible; audit menggunakan participant ID dan display-name history.
18. Outage `≤ 6 jam` yang lengkap menghasilkan delayed summary; outage `> 6 jam` atau coverage tidak pasti menghasilkan recovery digest berlabel tidak lengkap.
19. Backup S3 menggunakan SSE-S3/AWS-managed keys pada MVP.
20. Kedua service memiliki endpoint liveness/readiness internal.
21. AWS dipakai untuk pilot dengan guardrail biaya dan exit plan.
22. Raw message disimpan 14 hari; ringkasan 90 hari.
23. Privasi, pseudonymization, evidence validation, dan idempotency adalah requirement Must.

---

## 27. Pertanyaan Terbuka Non-blocking

Pertanyaan berikut tidak menghalangi technical design karena memiliki default:

| Pertanyaan | Default PRD |
|---|---|
| Nama final produk | RembugBot sebagai nama kerja |
| Apakah jadwal ringkasan dapat diubah per grup? | Tidak pada MVP; 08.00/20.00 WIB |
| Apakah anggota boleh menjalankan `.bantuan`? | Tidak; seluruh command admin-only |
| Apakah output historis dapat diekspor? | Tidak pada MVP |
| Apakah PDF sensitif boleh diproses? | Hanya setelah konfirmasi eksplisit admin |
| Provider darurat setelah GitHub gagal | Tidak ada secara default; retry job |

---

## 28. Referensi

- [Baileys repository](https://github.com/WhiskeySockets/Baileys)
- [Baileys documentation](https://baileys.wiki/)
- [Baileys auth state guidance](https://baileys.wiki/docs/api/functions/useMultiFileAuthState/)
- [GitHub Models prototyping and rate limits](https://docs.github.com/en/enterprise-cloud%40latest/github-models/use-github-models/prototyping-with-ai-models)
- [GitHub Models billing](https://docs.github.com/en/billing/concepts/product-billing/github-models)
- [SQLite Write-Ahead Logging](https://sqlite.org/wal.html)
- [SQLite busy timeout](https://sqlite.org/pragma.html#pragma_busy_timeout)
- [AWS Free Plan FAQ](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier-FAQ.html)
- [AWS free compute offers](https://aws.amazon.com/free/compute/)
- [Amazon S3 default encryption](https://docs.aws.amazon.com/AmazonS3/latest/userguide/default-bucket-encryption.html)
- Implementasi referensi lokal: `Magang-Istana/python-ai/config/ai_config.yaml`
- Implementasi referensi lokal: `Magang-Istana/python-ai/app/services/llm_streaming.py`

---

## 29. Glosarium

| Istilah | Arti |
|---|---|
| Allowlist | Daftar grup yang secara eksplisit diizinkan diproses |
| Candidate schedule | Jadwal hasil deteksi yang belum dikonfirmasi admin |
| Circuit breaker | Mekanisme melewati provider yang sedang gagal/terbatas untuk sementara |
| Evidence | Referensi ke pesan sumber yang mendukung keluaran AI |
| HMAC | Autentikasi berbasis hash dan secret untuk membuat identifier stabil yang tidak reversible |
| Idempotency | Jaminan operasi yang sama tidak menghasilkan kiriman duplikat |
| JID | Identifier internal WhatsApp untuk user atau grup |
| Lane | Urutan model khusus untuk jenis tugas tertentu |
| Pseudonymization | Mengganti identitas asli dengan alias sebelum data diproses eksternal |
| Readiness | Status apakah service siap menerima pekerjaan dengan dependency kritisnya |
| Recovery digest | Ringkasan pemulihan berlabel tidak lengkap setelah outage/gap data |
| Strict fallback | Perpindahan provider/model terkontrol setelah kegagalan terklasifikasi |
| Window | Rentang waktu pesan yang menjadi bahan satu ringkasan |

---

## 30. Definition of Ready untuk Implementasi

Implementasi dapat dimulai ketika:

- PRD disetujui product owner.
- Nomor bot khusus tersedia.
- Consent notice pilot disepakati.
- AWS IAM non-root dan budget guardrail siap.
- Dua akun GitHub Models terverifikasi berbeda dan token tersedia melalui secret lokal/deploy.
- Technical design menetapkan HTTP schema, single-owner SQLite access, HMAC key versioning, memory/container limit, health endpoint, serta restore procedure.
- Threat model, schema migration, dan test plan dibuat.
- Versi Baileys awal dipilih serta dikunci.
- Issue implementasi dipecah per milestone dan memiliki acceptance criteria yang merujuk PRD ini.
