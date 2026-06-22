# VM Deployment Runbook — AGC2 (on-prem)

> **This is the executable runbook for deploying AGC2 to the client's on-prem Ubuntu VM.**
> It is ordered — do the steps top to bottom. The *why* behind every decision lives in
> [on-prem-migration.md](on-prem-migration.md); read that for rationale, this for actions.

---

## 0. Read me first (especially if you are a Claude CLI running inside the VM)

You are on the client's VM. You do **not** have the dev laptop's chat history or `~/.claude`
memory — **the repo is your only inherited knowledge.** Before editing anything:

1. Read [on-prem-migration.md](on-prem-migration.md) (the plan + every "DECIDE AT VM SETUP"
   item), then the root `CLAUDE.md`, then the skill matching your task
   (`database`, `rag-chat`, `data-pipeline`, `frontend`, `pdf-export`).
2. **The environment differs from dev.** Chat moves OpenRouter → local Ollama; there are no
   Supabase vars; `DATABASE_URL` points at the VM's own Postgres. See [.env.vm.example](../.env.vm.example).
3. **`scripts/setup-db.ts` is destructive** — it `DROP TABLE`s `cases`, `users`,
   `case_embeddings`, `chatbot_settings`, etc. Run it **only** on a fresh/empty DB, and
   **never** against a populated DB without confirming `DATABASE_URL` first. Re-syncing later
   uses `sync-mysql.ts` + `ingest-data.ts` (both idempotent), **not** `setup-db.ts`.
4. The gate `npm run build` must pass with **zero errors** before anything is "done".

### The plan in one paragraph
Install the stack (Node, Postgres+pgvector, Ollama) → clone + configure env → smoke the model
stack → bootstrap the DB schema + first admin → load data from the client's MySQL and run the
**full** embed (~10h CPU) → **re-tune the refusal gate** for the full corpus → build + serve →
schedule the recurring sync → settle the client decision points → verify end-to-end.

### VM facts (from the client; see migration doc §"VM specs")
Ubuntu 24.04 · 16 vCPU (AVX support uncertain — benchmark, don't trust tok/s estimates) ·
**no usable GPU → all inference is CPU-only** · 48 GB RAM · ~10 concurrent users · VPN+SSH access.
CPU throughput is the binding constraint — measure it early (Step 3).

---

## 1. Install prerequisites on the VM

```bash
# Node 20+ (project tested on 20/24). Use NodeSource or nvm.
node -v          # expect >= v20

# Postgres 16 + pgvector. Native install preferred over Docker on a locked-down gov box.
#   apt install postgresql-16 postgresql-16-pgvector   (package name varies by repo)
# Confirm the extension is installable; setup-db.ts runs CREATE EXTENSION vector for you.
psql -V

# Ollama (serves BOTH embeddings and chat on the VM):
#   curl -fsSL https://ollama.com/install.sh | sh
ollama pull bge-m3                 # embeddings, 1024d — MUST match the vector(1024) column
ollama pull qwen2.5:7b-instruct    # chat
ollama list                        # verify both are present
```

- The local dev `docker-compose.yml` (pgvector container) is a **dev convenience**. On the VM,
  a native Postgres service is the supported path; if you do use Docker, replicate the same
  `vector(1024)` schema via `setup-db.ts`.
- **VPN / MySQL reachability:** `sync-mysql.ts` reads the client's `ilims_usr` MySQL over the
  network. Confirm the VM can reach `MYSQL_HOST:MYSQL_PORT` before Step 5.

---

## 2. Clone, install deps, configure env

```bash
git clone <repo> agc2 && cd agc2
npm install                        # .npmrc already sets legacy-peer-deps=true
cp .env.vm.example .env.local      # then edit .env.local
npx auth secret                    # generates AUTH_SECRET — paste into .env.local
```

Fill `.env.local` from [.env.vm.example](../.env.vm.example). The values that **must** change
from dev:

| Var | VM value |
|---|---|
| `DATABASE_URL` | the VM's local Postgres (`postgresql://USER:PASS@127.0.0.1:5432/DBNAME`) |
| `AUTH_URL` | the real URL officers hit (e.g. `https://agc2.internal.gov.my`) |
| `AUTH_TRUST_HOST` | `true` |
| `CHAT_BASE_URL` | `http://127.0.0.1:11434/v1` (local Ollama, **not** OpenRouter) |
| `CHAT_MODEL` | `qwen2.5:7b-instruct` |
| `CHAT_API_KEY` | empty (Ollama needs none) |
| `OLLAMA_URL` / `EMBED_MODEL` | `http://127.0.0.1:11434/v1` / `bge-m3` |
| `MYSQL_*` | the client's real DB host/credentials |
| `REFUSE_GATE` | leave at `0.59` for now — **re-tuned in Step 6** after the full embed |

---

## 3. Smoke the model stack BEFORE loading data

Verify Ollama answers and **measure CPU throughput** — this is the project's biggest risk for
10 concurrent users, so record the number now.

```bash
# Embeddings reachable + 1024-dim?
curl -s http://127.0.0.1:11434/api/embeddings \
  -d '{"model":"bge-m3","prompt":"ujian"}' | head -c 200

# Chat reachable + measure tok/s (watch eval_count / eval_duration in the response):
curl -s http://127.0.0.1:11434/api/generate \
  -d '{"model":"qwen2.5:7b-instruct","prompt":"Terangkan seksyen 302 Kanun Keseksaan secara ringkas.","stream":false}' \
  | python3 -c 'import sys,json;d=json.load(sys.stdin);print("tok/s:", d["eval_count"]/(d["eval_duration"]/1e9))'
```

- A DB-free end-to-end harness exists at
  [docs/archive/legacy-pipeline/feasibility-bakeoff.ts](archive/legacy-pipeline/feasibility-bakeoff.ts)
  (archived; uses Ollama `/v1`) if you want a fuller grounded-Q&A smoke before any data is loaded.
- **If tok/s is too low for acceptable latency at ~10 users**, escalate the GPU/egress blockers
  (migration doc §"Open blockers") with the client before going live — no model swap fixes CPU speed.

---

## 4. Bootstrap the database

```bash
# ⚠️ DESTRUCTIVE — confirm DATABASE_URL points at the fresh VM DB first.
npx tsx scripts/setup-db.ts          # schema: vector(1024), roles, match_documents,
                                     #         cases/people/allegations/case_embeddings/users/chatbot_settings
npx tsx scripts/verify_new_schema.ts # confirm tables + dims

# First admin login (role 'admin'); change the password immediately after first login.
npx tsx scripts/setup-auth.ts --seed admin@agc.gov.my "<strong-password>" "Pentadbir" admin
```

`setup-db.ts` already creates and seeds `chatbot_settings` — you do **not** need
`migrate-chatbot-settings.ts` on a fresh VM (that script is only for adding the table to an
already-populated DB).

---

## 5. Load data + full embed

```bash
# Extract + clean + categorize + upsert from the client's MySQL.
# If column names differ, inspect first: scripts/inspect-mysql.ts, scripts/inspect-lkk.ts
npx tsx scripts/sync-mysql.ts

# FULL embed — no --sample. ~10h on CPU (≈1.2 chunks/s). Run detached; it is resumable
# (incremental via content_hash), so a re-run after interruption continues where it stopped.
nohup npx tsx scripts/ingest-data.ts > ingest.log 2>&1 &
tail -f ingest.log

# Verify counts
npx tsx scripts/count-cases.ts       # cases per source_folder
npx tsx scripts/check-embeddings.ts  # embedded chunk counts (should cover the full corpus)
```

> **Why the full embed matters:** dev only embedded a stratified subset, so most cases were
> browsable but un-queryable by chat. On the VM you embed the **whole** corpus once. (See
> migration doc §"DECIDE AT VM SETUP" item 6.)

---

## 6. Re-tune the refusal gate (MANDATORY after the full embed)

The `REFUSE_GATE` is **corpus-dependent** — it was calibrated on the dev subset and **will be
wrong** for the full corpus. Re-tune it:

```bash
npx tsx scripts/diagnose-byname-gate.ts 100   # prints a threshold sweep: recall vs out-of-DB leaks
npx tsx scripts/test-retrieval.ts             # cross-check in-DB vs out-of-DB similarity scores
```

- Read the sweep table; pick the gate that keeps **0 out-of-DB leaks** at the **highest recall**.
  Set it in `.env.local` (`REFUSE_GATE=…`) — a hallucination is worse than a false refusal, so
  bias slightly high.
- **If out-of-DB max similarity climbs past ~0.60**, a single scalar can no longer separate
  in- vs out-of-DB (raising it false-refuses real cases). Switch to a **presence-aware gate**
  (admit when top-N chunks are dominated by one case; refuse when scattered low-sim). See
  migration doc item 6 + the `rag-chat` skill.

---

## 7. Build and serve

```bash
npm run build      # MUST be zero errors
npm run start      # serves the production build (Next on port 3001 unless overridden)
```

Run it as a managed service (systemd unit or PM2) so it restarts on boot/crash, **behind a
reverse proxy (nginx/caddy) terminating HTTPS** so cookies are secure. `AUTH_URL` must match the
public HTTPS URL or login callbacks break.

---

## 8. Schedule the recurring MySQL sync

Dev runs the pipeline by hand. On the VM, schedule `sync → ingest` so new/edited MySQL cases
flow in automatically. Ready-to-edit artifacts are in [`deploy/`](../deploy/):

```bash
# Edit deploy/sync-cron.sh: set APP_DIR to the repo path on the VM.
sudo cp deploy/agc2-sync.service deploy/agc2-sync.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now agc2-sync.timer
systemctl list-timers agc2-sync.timer     # confirm next run
journalctl -u agc2-sync.service -f        # watch a run
```

**Known open gaps** in the sync (migration doc item 5 — decide with the client):
- **(b) source-side change-detection** — each run re-reads *all* MySQL rows (`SELECT *`, no
  `WHERE modified > last_run`). Correct but a full scan every time.
- **(c) deletion propagation** — neither script removes cases that disappear from MySQL
  (inserts/updates only). Deletes won't propagate.

Inserts + edits already work via upsert-on-`source_id` + `content_hash` incremental re-embed.

---

## 9. Client decision points — STOP and confirm before go-live

These were deliberately deferred to deployment (full detail: migration doc §"DECIDE AT VM SETUP").
Each needs the **client's** answer, not a default:

1. **Public sign-up** — dev leaves `/auth/sign-up` + `/api/auth/register` open. Decide whether to
   **disable it** (admin-provisioned accounts only via `/admin` → Pengurusan Pengguna) and remove
   the "Daftar di sini" link on the login page.
2. **Password reset** — SMTP-based self-reset (needs an outbound mail relay — confirm egress) vs
   **admin-reset only** (already built under `/admin`).
3. **Auth strategy** — Credentials (built) vs **AGC SSO/AD** (add a provider in `src/auth.ts`).
4. **Hardening** — add login **rate-limiting**, ensure HTTPS + secure cookies (Step 7), and
   **rotate `AUTH_SECRET`** to a fresh value for prod.
5. **GPU / egress blockers** — CPU-only latency at 10 users; whether the VM allows any outbound.

---

## 10. End-to-end verification (the real gate)

Do not declare done on green types alone — exercise the live app:

- **Chat, in-DB question:** ask about a case you know is loaded → correct verdict + a working
  `[[Nama Kes]](case_id)` citation that links to the case page.
- **Chat, out-of-DB question:** ask about something not in the corpus → the Malay refusal, with
  **no** fabricated case (the gate should refuse before calling the LLM).
- **Auth:** unauthenticated access redirects to login (preserving `next`); valid creds log in;
  wrong creds rejected; admin sees `/admin`, officer does not.
- **PDF export:** generate and open a Laporan PDF for a long case (check pagination).
- **Smoke scripts:** `count-cases.ts`, `check-embeddings.ts`, `test-retrieval.ts`,
  `test-chat-v2.ts`, `test-pages-data.ts`, `test-auth.ts`.

---

### Quick command reference

| Goal | Command |
|---|---|
| Schema (fresh DB, destructive) | `npx tsx scripts/setup-db.ts` |
| First admin | `npx tsx scripts/setup-auth.ts --seed <email> <pw> "<name>" admin` |
| Promote to admin | `npx tsx scripts/setup-auth.ts --promote <email>` |
| Pull data from MySQL | `npx tsx scripts/sync-mysql.ts` |
| Full embed | `npx tsx scripts/ingest-data.ts` |
| Gate re-tune | `npx tsx scripts/diagnose-byname-gate.ts 100` |
| Build / serve | `npm run build` · `npm run start` |
