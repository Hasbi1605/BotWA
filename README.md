# RembugBot

Asisten otomatis untuk grup WhatsApp yang membantu kelompok KKN dan komunitas desa memahami percakapan panjang, menemukan keputusan dan tindak lanjut, membaca dokumen PDF, serta mengingat jadwal kegiatan.

## Fitur

- **Ringkasan otomatis** 2x sehari (08.00 & 20.00 WIB)
- **Deteksi keputusan dan tugas** dengan atribusi pengirim
- **Analisis PDF** dengan sensitivity gate untuk data pribadi
- **Deteksi jadwal** dengan konfirmasi admin
- **Pengingat otomatis** untuk jadwal terkonfirmasi
- **Perintah admin** untuk kontrol penuh

## Arsitektur

```
WhatsApp Group → Gateway (Node.js/TypeScript + Baileys)
                    ↓
                Worker (Python/FastAPI + GitHub Models)
                    ↓
                SQLite (encrypted)
```

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Nomor WhatsApp khusus
- Token GitHub Models (2 akun)

### Setup

```bash
# Clone repository
git clone https://github.com/Hasbi1605/BotWA.git
cd BotWA

# Copy environment file
cp docker/.env.example docker/.env

# Edit .env dengan kredensial Anda
nano docker/.env

# Build dan jalankan
cd docker
docker compose up --build -d

# Scan QR code dengan WhatsApp
docker compose logs -f gateway
```

### Perintah Bot

Ketik di grup WhatsApp:

| Perintah | Fungsi |
|---|---|
| `.aktifkan` | Aktifkan bot di grup |
| `.ringkas sekarang` | Buat ringkasan manual |
| `.jadwal` | Lihat jadwal dan kandidat |
| `.jadwal tambah "judul" DD-MM-YYYY HH:mm "lokasi"` | Tambah jadwal |
| `.status` | Status bot |
| `.pause` / `.resume` | Jeda/lanjutkan bot |
| `.hapusdata` | Hapus data grup |
| `.bantuan` | Tampilkan bantuan |

## Pengembangan

### Setup Lokal

```bash
# Gateway
cd gateway
npm install
npm run dev

# Worker (terminal terpisah)
cd worker
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000
```

### Testing

```bash
# Gateway tests
cd gateway
npm test

# Worker tests
cd worker
pytest
```

## Deployment

Lihat `docs/runbooks/` untuk panduan deployment, backup, dan pemulihan.

## Dokumentasi

- [PRD](PRD-BOT-WHATSAPP-KKN.md) — Product Requirements Document
- [Codebase Context](docs/CODEBASE-CONTEXT.md) — Arsitektur dan flow
- [Runbooks](docs/runbooks/) — Panduan operasional

## Lisensi

Private — Untuk penggunaan internal tim KKN dan komunitas desa.
