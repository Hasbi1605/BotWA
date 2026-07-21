# BotWhatsapp — Codebase Context

## Status saat ini

Repository berisi release candidate RembugBot — asisten grup WhatsApp untuk KKN dan komunitas desa.

Catatan post-scaffold fixes (2026-07-21): job retry (`pending`+`retrying`), PDF download+job, reminder scheduling, schedule_detect enqueue, Docker paths/network, evidence message IDs di prompt, dependency `zod`, HMAC di `.env.example`.

Catatan release hardening (2026-07-21): test deterministik gateway/worker, ESLint 9 dan Ruff, ISO timestamp query untuk retry/reminder, reminder 19.00 WIB yang independen dari timezone host, evidence validation fail-closed, parser jam eksplisit, Hatch editable install, Docker build context, serta controlled upgrade Baileys 7 RC13 dengan QR listener eksplisit. Upgrade Baileys dilakukan karena legacy 6.7.16 gagal registrasi `405`; image ARM64 Node 20/Python 3.11 dan QR generation telah diverifikasi melalui smoke test tanpa pairing akun.

## Struktur

```text
BotWhatsapp/
├── gateway/                    # Node.js/TypeScript WhatsApp Gateway
│   ├── src/
│   │   ├── index.ts           # Entry point
│   │   ├── config/            # Config loader
│   │   ├── whatsapp/          # Baileys connection, message handler, normalizer
│   │   ├── auth/              # Admin auth, rate limiter, consent
│   │   ├── commands/          # Command router (.jadwal, .ringkas, etc.)
│   │   ├── scheduler/         # Cron scheduler for summaries
│   │   ├── jobs/              # Job queue and runner
│   │   ├── db/                # SQLite, migrations, repositories
│   │   ├── worker-client/     # HTTP client to AI worker
│   │   ├── security/          # HMAC, retention cleanup
│   │   └── health/            # Health endpoints
│   ├── package.json
│   ├── tests/                 # Vitest unit/integration tests
│   ├── tsconfig.json
│   └── Dockerfile
├── worker/                     # Python/FastAPI AI Worker
│   ├── app/
│   │   ├── main.py            # FastAPI app
│   │   ├── config.py          # Settings
│   │   ├── auth.py            # Token verification
│   │   ├── routers/           # API endpoints (summary, pdf, schedule)
│   │   ├── services/          # Business logic
│   │   │   ├── summary_service.py
│   │   │   ├── pdf_service.py
│   │   │   ├── schedule_parser.py
│   │   │   ├── preprocessor.py
│   │   │   ├── validator.py
│   │   │   └── sensitivity.py
│   │   ├── providers/         # AI provider cascade with circuit breaker
│   │   └── schemas/           # Pydantic models
│   ├── config/prompts/        # YAML prompts for AI
│   ├── pyproject.toml
│   ├── tests/                 # Pytest unit/API tests
│   └── Dockerfile
├── docker/                     # Docker Compose files
├── scripts/                    # Backup, restore, deploy scripts
├── docs/
│   ├── runbooks/              # Operational guides
│   └── CODEBASE-CONTEXT.md
├── issue/                     # Issue tracking
└── PRD-BOT-WHATSAPP-KKN.md   # Product Requirements Document
```

## Arsitektur

### Gateway (Node.js/TypeScript)
- **WhatsApp Connection:** Baileys 7 RC yang dipin, multi-file auth state, QR listener eksplisit, exponential backoff reconnect
- **Message Processing:** Allowlist check, normalization, HMAC pseudonymization, SQLite persistence
- **Admin Commands:** `.aktifkan`, `.ringkas sekarang`, `.jadwal`, `.pdf`, `.status`, `.pause`, `.resume`, `.hapusdata`
- **Scheduler:** node-cron for 08:00 and 20:00 WIB summaries
- **Job Queue:** SQLite-backed persistent queue with retry logic
- **Health:** Fastify HTTP server with `/health/live` and `/health/ready`

### Worker (Python/FastAPI)
- **Summary Service:** Preprocesses messages, calls AI cascade, validates output (anti-hallucination)
- **PDF Service:** pdfplumber + Tesseract OCR, sensitivity gate, AI analysis
- **Schedule Parser:** Local Indonesian date parser + AI fallback for ambiguous cases
- **Provider Cascade:** GitHub Models with circuit breaker (429→30min cooldown, 401/403→disabled, 5xx→5min cooldown)

### Database (SQLite)
- WAL mode, single-writer (gateway only)
- 12 tables: groups, participants, messages, documents, summary_windows, summary_evidence, schedule_candidates, schedules, reminders, admin_actions, provider_health, jobs
- Retention: messages 14d, PDFs 24h, summaries 90d, audit 90d

## Flow Utama

1. **Ingest:** WhatsApp → Baileys → allowlist check → normalize → HMAC sender → persist to SQLite
2. **Summary:** Cron 08:00/20:00 → snapshot messages → preprocess (alias, noise filter) → AI cascade → validate evidence → render → send to group
3. **PDF:** Document received → extract text (pdfplumber/OCR) → sensitivity scan → AI analysis → include in summary
4. **Schedule:** Messages parsed for dates/times → candidate created → admin confirms → reminders scheduled
5. **Reminder:** 19:00 day-before + 2hr-before → send to group

## Keputusan Teknis

- **Monorepo:** Gateway + worker dalam satu repo untuk koordinasi schema
- **SQLite single-writer:** Gateway owns database, worker stateless via HTTP
- **HMAC pseudonymization:** Nomor telepon tidak disimpan langsung
- **Evidence validation:** Setiap fakta penting harus punya source_message_id
- **Circuit breaker:** Per-route, per-model cooldown untuk GitHub Models
- **Safe splitting:** Ringkasan dipotong di batas section, tidak pernah di tengah kutipan
- **Time normalization:** Jadwal disimpan UTC; input dan reminder day-before ditafsirkan eksplisit sebagai Asia/Jakarta
- **Release gate:** Vitest/Pytest, ESLint/Ruff, dependency audit, image build ARM64, dan health smoke test wajib sebelum provisioning

## Konfigurasi

- Environment variables di `docker/.env`
- Prompts di `worker/config/prompts/*.yaml`
- Model routes di `app/providers/cascade.py`

## Deployment

```bash
cd docker
docker compose up --build -d
```

Lihat `docs/runbooks/` untuk panduan lengkap.

## Dokumentasi Terkait

- [`PRD-BOT-WHATSAPP-KKN.md`](../PRD-BOT-WHATSAPP-KKN.md) — Product Requirements Document
- [`docs/runbooks/`](../docs/runbooks/) — Operational runbooks
