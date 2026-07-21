# Autopilot Product Implementation Plan

> **For agentic workers:** Use executing-plans or implement task-by-task. Steps use checkbox syntax.

**Goal:** RembugBot fully autopilot — no bot-as-admin, auto PDF/Word post, full-auto schedules, admin-only mode normal/roast.

**Architecture:** Gateway owns WA, SQLite, jobs; worker owns AI/PDF. Group.summary_mode drives summary tone. Schedule candidates with resolvable date auto-activate + reminders. Document jobs post to group immediately with redaction instead of held gate.

**Tech Stack:** Node/TS Baileys gateway, Python FastAPI worker, SQLite, luxon, python-docx optional.

**Spec:** `docs/superpowers/specs/2026-07-21-autopilot-product-design.md`

## Global Constraints

- Bot must NOT require group admin role
- Members: silent on commands
- Schedule full-auto (choice A): date required; missing time → 09:00 WIB + note
- PDF/Word: no admin confirm; redact sensitive; post to group
- summary_mode default `normal`
- Times: 08:00 & 20:00 Asia/Jakarta

---

### Task 1: summary_mode + groups repo

- Migration `groups.summary_mode`
- `setSummaryMode`, field on Group type

### Task 2: Remove bot-admin gate + simplify consent/help

### Task 3: Parse + router mode commands; member silent

### Task 4: Schedule auto-activate from candidates (runner)

### Task 5: PDF redaction + immediate group post; Word download

### Task 6: Worker roast prompt + summary mode; sensitivity redact

### Task 7: Tests + README; commit deploy

---
