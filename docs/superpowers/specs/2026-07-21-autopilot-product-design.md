# Design: RembugBot Autopilot Product

**Date:** 2026-07-21  
**Status:** Approved in conversation (user chose schedule full-auto **A**, then approved design)  
**Goal:** Bot otomatis merangkum chat, membaca PDF/Word, dan follow-up jadwal — anggota tidak request; admin jarang campur dengan frasa sederhana.

---

## 1. Product principles

1. **Automation first** — ringkasan periodik, dokumen, dan jadwal jalan tanpa permintaan anggota.
2. **Admin-only control surface** — hanya admin/superadmin grup WhatsApp yang boleh perintah.
3. **Bot need not be group admin** — bot cukup anggota; yang dicek adalah role **pengirim** perintah.
4. **Minimal admin UX** — frasa natural pendek; hapus flow konfirmasi yang tidak perlu (PDF held, usulan jadwal YA).
5. **Smart defaults** — confidence gate untuk jadwal; redaksi data sensitif pada ringkasan dokumen; mode ringkasan default `normal`.

---

## 2. Out of scope (this change set)

- Per-group custom summary hours (tetap 08.00 & 20.00 WIB).
- Roast default on (admin harus pilih).
- DM bot, multi-tenant dashboard web.
- OCR berat untuk scan PDF image-only di luar kemampuan worker saat ini (tetap best-effort).
- Word format di luar `.docx` / mime Word umum (`.doc` legacy optional later).

---

## 3. Roles & activation

### 3.1 Bot membership

| Requirement | Decision |
|-------------|----------|
| Bot must be WhatsApp group admin | **Removed** — not required |
| Bot must be group member + allowlisted | **Required** |
| Detect command sender admin via `groupMetadata` + LID-aware match | **Required** |

### 3.2 Activation flow

1. Admin: `aktifkan bot`
2. Bot: short privacy notice (retention, purpose) — **no** “jadikan bot admin” message
3. Admin: `YA` / `setuju`
4. Group → `active`; automation starts

Members typing activate phrases: ignore silently (or one soft admin-only style reply is optional; **default: silent** for members).

### 3.3 Admin detection

- Use existing `findParticipant` / `jidsMatch` / `roleFromParticipant`.
- `isBotGroupAdmin` checks removed from activation and command gates.
- If metadata fetch fails: treat sender as non-admin (fail closed for commands only; still store messages if group already active).

---

## 4. Message pipeline (group active)

```
Inbound group message (allowlisted)
  → if inactive: only activation phrases for admin
  → store message (silent)
  → if document PDF/DOCX: enqueue analyze → post summary to group
  → if text: available for summary window + schedule detect
  → if admin command phrase: handle command (no store as “noise” for activation cmds)
```

Members never get a command menu unless they are admin.

---

## 5. Routine summary

### 5.1 Schedule

- Unchanged: cron morning `0 8 * * *`, evening `0 20 * * *`, timezone `Asia/Jakarta`.
- Windows unchanged: morning `[prev 20:00, today 08:00)`, evening `[today 08:00, today 20:00)`.
- Empty window: skip send (existing).

### 5.2 Summary mode (`normal` | `roast`)

- New column `groups.summary_mode TEXT NOT NULL DEFAULT 'normal'` with check constraint.
- Admin commands:
  - `mode normal` → set + confirm
  - `mode roast` → set + confirm
  - `mode` → show current
- Worker/prompt: select system prompt variant by mode.
- Render: roast header/sections may use lighter roast labels; still include decisions/tasks/links when present.
- **Roast safety rules (prompt):** friendly only; no bullying, no SARA, no sensitive data, no inventing drama.

### 5.3 Manual summary

- Admin only: `ringkas` — same rate limits (30 min / 4 per day).
- Members: no effect.

### 5.4 Output shape

Keep community-inspired sections: Inti diskusi / Sorotan / Keputusan / Tugas / Jadwal / Dokumen / Pertanyaan / Link / Top pengirim; names remapped; roast varies tone not structure radically.

---

## 6. Documents (PDF / Word) — auto post

### 6.1 Trigger

- `type === document` and filename/mime matches:
  - PDF: `application/pdf` or `.pdf`
  - Word: `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `application/msword`, `.docx`, optionally `.doc`

### 6.2 Flow

1. Download media → hash → dedupe by `(group_id, hash)`
2. Persist file under temp
3. Job `pdf_analyze` (rename later optional; handles Word too) → worker extract + summarize
4. On success: **immediately** `sendMessage` to group with short document summary card
5. Also available for periodic summary document lines (dedupe by id)

### 6.3 Sensitivity (no admin confirm)

- Remove chat UX: `held` → ask admin `pdf izinkan`.
- Scanner still runs: **redact** sensitive patterns in model input/output (mask NIK/account numbers); post safe summary.
- If extraction fails: job retry; do not block group chat; no member-facing error spam.

### 6.4 Example post

```
📄 *Ringkasan dokumen*
File: Proposal_KKN.pdf
• Tujuan: …
• Poin utama: …
• Tindak lanjut (jika ada): …
```

---

## 7. Schedule — full auto (choice A)

### 7.1 Detection sources

- After summary job: candidates from AI output
- Dedicated `schedule_detect` job on window
- Optional: light detect on high-signal messages later (not required MVP of this design)

### 7.2 Confidence gate (publish to active schedule)

Auto-activate only if **all** hold:

1. Non-empty title
2. Resolvable absolute date (`YYYY-MM-DD` or clear relative resolved with reference time)
3. Time present **or** default `09:00` only when message clearly is all-day / “pagi” with admin-set policy: **prefer require time or explicit “sepanjang hari”**; if only date without time → include in periodic summary as soft note, **do not** create two-hours-before reminder (day-before optional at 19:00 still OK with default 09:00 — **decision: require date; if time missing use 09:00 WIB and mark `notes` “jam default 09.00”**)

**Locked decision:** require **date**; if time missing → `09:00` WIB + note `jam default`; if date missing/unresolvable → do **not** auto-activate (may appear only in summary open questions / soft schedule line).

### 7.3 On auto-activate

- Insert/update `schedules` status `active`
- `scheduleRemindersFor` → day_before 19:00 WIB + two_hours before
- **Do not** require admin `YA`
- **Do not** spam group on every detection (reminders only)

### 7.4 Dedup

- Same group + similar title + same starts_at day/time → skip duplicate candidate

### 7.5 Admin correction

- `jadwal` — list active (and soft pending if any)
- `jadwal batal <n>` — cancel + cancel reminders
- `jadwal tambah "Judul" DD-MM-YYYY HH:mm "lokasi"` — manual add
- Remove primary path: schedule_pick pending YA for candidates

### 7.6 Reminder messages

Unchanged tone:

- `📅 Besok: *{title}* …`
- `⏰ 2 jam lagi: *{title}* …`

---

## 8. Admin command surface (minimal)

| Phrase | Action |
|--------|--------|
| `aktifkan bot` → `YA` | Activate + privacy |
| `bantuan` / `admin` | Short help |
| `mode` / `mode normal` / `mode roast` | Summary tone |
| `ringkas` | Manual summary |
| `jadwal` / `jadwal batal n` / `jadwal tambah …` | Schedule list/fix/add |
| `jeda` / `lanjut` | Pause/resume automation |
| `status` | Connection + group status + last summary |
| `hapus data` → `YA` | Wipe group data |

**Removed from default help / primary flows:**

- Bot-must-be-admin gate
- `pdf` allow/held confirmation flow (optional keep silent list for debug later — not in help)
- Candidate YA confirm as main path

**Member commands:** no response (silent).

---

## 9. Data model changes

```sql
-- migration
ALTER TABLE groups ADD COLUMN summary_mode TEXT NOT NULL DEFAULT 'normal'
  CHECK (summary_mode IN ('normal', 'roast'));
```

Optional later: `schedules.source` / `confidence` — not required if notes field carries default-time flag.

Documents: allow Word mime in app logic; status `held` may remain in schema for legacy rows but new path should not set `held` for admin gate (use `analyzed` with redaction or `error`/`unprocessable`).

---

## 10. Worker changes

1. **Summary prompts:** `summary.yaml` + roast variant (`summary_roast.yaml` or mode branch in service).
2. **SummaryService:** accept `mode` in request; pick prompt.
3. **PDF service:** sensitivity → redact rather than block publish; return summary text for immediate post.
4. **Word:** extract text (e.g. python-docx) before same summarize path.
5. **Schedule parser:** resolve relative dates; return confidence/date/time for auto-activate rules on gateway.

Gateway `callWorkerSummary` body adds `mode: 'normal' | 'roast'`.

---

## 11. Gateway changes (files likely touched)

| Area | Files |
|------|--------|
| Drop bot-admin gate | `auth/consent.ts`, `commands/router.ts` |
| Mode commands | `commands/parse.ts`, `router.ts`, `groups.repo.ts`, `migrate.ts` |
| Summary mode wiring | `jobs/runner.ts`, `worker-client`, summary prompts |
| PDF immediate post + no held UX | `jobs/runner.ts`, `message-handler.ts`, worker sensitivity |
| Word download | `message-handler.ts`, worker extract |
| Schedule auto-activate | `jobs/runner.ts`, `schedules.repo.ts` |
| Help copy | `router.ts`, `consent.ts`, `README.md` |
| Tests | parse, render roast header, schedule auto rules |

---

## 12. Example end-to-end simulations

### 12.1 Activation (bot is only member)

```
Admin: aktifkan bot
Bot:   🔒 Privasi singkat… balas YA
Admin: YA
Bot:   ✅ Aktif. Ringkasan 08.00 & 20.00. Mode: normal.
       Ketik *mode roast* jika mau gaya santai/roasting.
```

### 12.2 Day of chat + PDF

```
Member: Besok rapat balai jam 3 sore
Bot:    (silent store)
Member: [sends Proposal.pdf]
Bot:    📄 Ringkasan dokumen … (auto)
… 20.00 …
Bot:    *Ringkasan grup — …* (mode normal or roast)
… next day 13.00 if event 15.00 …
Bot:    ⏰ 2 jam lagi: *Rapat balai*
```

### 12.3 Mode switch

```
Admin: mode roast
Bot:   Mode ringkasan: *roast* 🔥
Admin: mode normal
Bot:   Mode ringkasan: *normal*
```

### 12.4 Wrong schedule

```
Admin: jadwal
Bot:   1. Rapat balai — …
Admin: jadwal batal 1
Bot:   Jadwal dibatalkan.
```

---

## 13. Error handling

| Case | Behavior |
|------|----------|
| WA metadata fail on command | Treat as non-admin; no command |
| Summary AI fail | Retry job; no fake summary |
| PDF fail after retries | `error` status; no group spam |
| Ambiguous schedule | Skip auto-activate; may mention in summary |
| Group paused | No summary send, no new doc posts, no new schedule activate (store optional: still store messages? **Decision: still store messages while paused so resume has history; skip outbound automation**) |

---

## 14. Testing plan

- Unit: parse `mode normal|roast`; admin gate without bot-admin.
- Unit: schedule auto-activate rules (date missing → no; date only → 09:00 + note).
- Unit: render roast vs normal headers.
- Worker: sensitivity redacts not blocks; link/top_senders still work.
- Integration smoke on staging: activate without bot admin; send PDF → group post; set roast; `ringkas`.

---

## 15. Rollout

1. Implement + tests locally  
2. Commit / push main  
3. Deploy staging  
4. Pilot group “Tes bott”: verify no bot-admin requirement, PDF post, mode, auto schedule reminder  

---

## 16. Spec self-review

- [x] No TBD placeholders for critical paths  
- [x] Schedule time-missing rule locked (default 09:00 + note)  
- [x] Bot-admin removed consistently  
- [x] PDF: no admin confirm; redact instead of hold  
- [x] Roast is opt-in via admin command  
- [x] Scope single implementation plan (one PR-sized feature set)  

---

## 17. Approval record

- Schedule automation: user chose **A** (full auto)  
- Overall design: user replied **setuju** (2026-07-21 conversation)  
