# On-Prem Migration — AGC2

> **Status: IN PROGRESS (started 2026-06-21).** The **data + RAG** half of the on-prem stack is now
> implemented and runs **locally** (see "What's landed" below). The **deployed** app is unchanged —
> Vercel + hosted Supabase **Auth** + the ~5 supabase-js page reads still use the cloud path, and
> `master` has not been cut over. Check the code before assuming any item ships in production.

## What's landed (local dev, 2026-06-22)
Runs against a local `pgvector` container + Ollama, sourced from the client's MySQL:
- **DB:** `docker-compose.yml` → `pgvector/pgvector:pg16` on `127.0.0.1:5432`; `setup-db.ts` now creates `vector(1024)`, bootstraps the `anon/authenticated/service_role` roles (so plain Postgres doesn't choke on the Supabase grants), and adds `cases.content_hash` + `cases.act_tags`.
- **Data source:** `scripts/sync-mysql.ts` reads `ilims_usr` MySQL directly (`LT_LKK_INFO`/`LT_LKK_ALLEGATION`/`LT_LKK_PERSON_INVOLVE`), cleans HTML/entities, triages junk rows, derives **primary Act → `source_folder`** (+ all acts in `act_tags`), and upserts. Replaces the `clean_legal_data.py` → `seed-data.ts` SQL-dump path (kept but **legacy/unused**).
- **Embeddings:** `scripts/ingest-data.ts` now embeds with Ollama `bge-m3` (1024d), **incremental** via `content_hash` (no more blanket `DELETE`), with `--sample N`/`--limit N`.
- **Chat:** `src/app/api/chat/route.ts` v2 — query embed via bge-m3, **refusal gate** (`sim < 0.59` → refuse, no LLM; recalibrated from the bake-off's 0.55, which leaked an out-of-DB hallucination at 849 cases), **verdict-join** (`cases.result` per case at assembly), **numbered-tag citations** (`[1]`→`[[name]](id)`), chat via OpenRouter `qwen2.5-7b` (env-driven). All knobs in `src/lib/aiConfig.ts`.
- **Page reads:** home / dashboard / case-detail now read Postgres via `src/lib/cases.ts` (`pg`, `to_jsonb` to match supabase's nested shape + ISO dates) — no supabase-js anywhere. Citations resolve to local cases.
- **Auth:** **Supabase Auth fully replaced by Auth.js v5** (Credentials + JWT) against a Postgres `users` table (bcrypt via `bcryptjs`). `src/auth.ts` (+ edge-safe `src/auth.config.ts`), gate in **`src/proxy.ts`** (Next 16 renamed `middleware`→`proxy`; in a `src/` project it MUST live at `src/proxy.ts` — a root file is silently ignored, which is why the old Supabase middleware likely never actually gated). Login/sign-up/sign-out/change-password rewired; `/api/auth/{[...nextauth],register,change-password}`. **Supabase packages + env vars removed**, `transpilePackages` dropped.
- **Validated:** in-DB Q → correct verdict + citation; out-of-DB Q → refusal. Auth: unauth→login redirect (preserves `next`), credentials login sets a session, authed access works, wrong/unknown creds rejected. Build green. CPU embed ≈ **1.2 chunks/s** (full corpus ≈ 10h — dev uses a stratified subset; full embed deferred to the VM).

**Still not done:** deploying to the VM, the recurring/scheduled MySQL sync (script is manual), the full 4,126-case embed **+ gate re-tune** (on the VM — see "DECIDE AT VM SETUP" item 6), and login rate-limiting.

## ⚠️ DECIDE AT VM SETUP (deferred to client deployment)
Local dev made pragmatic choices that should be **re-confirmed with the client before VM deployment**:
1. **Account provisioning** — dev keeps **open self-service sign-up** (`/auth/sign-up` + `/api/auth/register`, auto-confirm) **in addition to** the new admin-provisioning UI (`/admin` → Pengurusan Pengguna, admin-only). The login UI says access is "limited to authorized AGC officers" → on the VM **decide whether to disable public sign-up** (remove the route + the "Daftar di sini" link on the login page) so accounts are **admin-provisioned only**. *(Confirmed 2026-06-22: leave open for local dev; revisit at cutover.)* Admins are bootstrapped via `scripts/setup-auth.ts --promote <email>` (or `--seed … admin`).
2. **Password reset** — dev uses **self-reset** (logged-in change-password, under `/settings` → Keselamatan) plus **admin reset** (`/admin` → reset-password per user); forgotten passwords with no session still show a "contact admin" notice (no email infra). On the VM decide **SMTP-based reset** (needs an outbound mail relay — unknown, like the egress/GPU blockers) **vs admin reset only**.
3. **Auth strategy** — Credentials is self-contained; the client may want **AGC SSO/AD** instead (add a provider in `auth.ts`).
4. **Hardening** — add login **rate-limiting**, ensure HTTPS + secure cookies, rotate `AUTH_SECRET`.
5. **Recurring MySQL sync** — dev runs the pipeline **manually** (`scripts/sync-mysql.ts` then `scripts/ingest-data.ts`; new/changed MySQL rows flow via upsert-on-`source_id` + `content_hash` incremental re-embed). On the VM, decide and build: **(a) a scheduler** — systemd timer/cron chaining the two scripts (e.g. nightly); **(b) source-side change-detection** — currently each run re-reads *all* MySQL rows (`SELECT *`, no `WHERE modified > last_run`), correct but a full scan every time; **(c) deletion handling** — neither script removes cases that disappear from MySQL (inserts/updates only), so deletes won't propagate. Inserts + edits are already covered; only scheduling + (b)/(c) are open. See checklist `[~] Sync` below.
6. **Full embed + gate re-tune (do on the VM, in this order).** Dev embedded only a **stratified ~849-case subset**; the `cases` table already holds the full **4,126** (sync ran), so today **~79% of cases are browsable but un-queryable by chat** (they exist in `cases`, have no row in `case_embeddings` → chat false-refuses or retrieves form-similar wrong cases, e.g. real case "NG HOEY CHEN V PP" id 4067). Decision **2026-06-22: defer the full embed to the VM** (CPU embed ≈ 1.2 chunks/s ⇒ ~10h for the corpus; do it where it runs once, not on the dev laptop). After the embed:
   - **Re-tune `REFUSE_GATE`** — it is **corpus-dependent**. Measured on the 849 subset (`scripts/diagnose-byname-gate.ts` + `scripts/test-retrieval.ts`, 2026-06-22): real by-name queries land 0.62–0.78, out-of-DB top out at **0.589** — so **0.59 is optimal at 849 (100% recall on retrievable cases, 0 leaks) but the margin is gone (1/1000)**. As the corpus grows, out-of-DB queries find closer spurious neighbours and will cross 0.59 → **leaks become the risk, not false refusals**, and a higher scalar can't compensate (0.62 already false-refuses real cases).
   - **How:** run `npx tsx scripts/diagnose-byname-gate.ts 100` and read the threshold-sweep table (recall vs out-leaks columns) to pick the gate. **If out-of-DB max climbs past ~0.60**, a single threshold no longer separates in- vs out-of-DB — switch to a **presence-aware gate** (admit when top-N chunks are dominated by one case; refuse when scattered low-sim) instead of just raising the number.
   - Known small tail (accept): narrative by-name phrasing on a weakly-embedded case can dip ~0.57 and false-refuse (e.g. "Perasantha" 0.573); the LLM's second-line refusal stays clean, so it's a tolerable recall cost.

## Why
The client (Attorney General's Chambers, Malaysia) requires the app to run **on their own on-prem VM**, not in foreign cloud — it handles government criminal-case data (incl. PII of accused persons). Vercel and hosted Supabase are therefore being dropped in favour of a fully self-hosted stack the client controls.

## Current vs Target

| Concern | Current (cloud, in code today) | Target (on-prem, planned) |
|---|---|---|
| Host | Vercel | Client Ubuntu VM (self-hosted Next.js) |
| Database | Hosted Supabase Postgres | **Self-hosted Postgres + pgvector on the VM** |
| Auth | Supabase Auth (`@supabase/ssr`) | **Auth.js (NextAuth)** or AGC SSO/AD |
| Data reads | supabase-js in ~5 pages | **`pg` pool** (already used by RAG/ingest) |
| Data source | Manual JSON → clean → seed | **Recurring sync from client's view-only MySQL** |
| Embeddings | OpenAI `text-embedding-3-small`, **1536d** | **`bge-m3`, 1024d** (dev *and* VM) via Ollama |
| Chat LLM | OpenAI `gpt-4o` | **`qwen2.5:7b-instruct`** via Ollama (VM); OpenRouter in local dev |
| LLM serving | OpenAI API | **Ollama** (OpenAI-compatible API) |

The `pg` pool path (`src/lib/db.ts`, RAG route, ingest, scripts) is **provider-neutral and moves for free** — it just needs `DATABASE_URL` pointed at the VM's Postgres. The real migration work is Auth + the ~5 supabase-js reads + the embedding swap + the MySQL sync.

## VM specs (client-provided, non-negotiable)
- **OS:** Ubuntu 24.04 LTS x86_64 · Kernel 6.8
- **CPU:** 16 vCPUs (masked/under-reported as "Core 2 Duo T7700" — may limit AVX; benchmark before trusting any tok/s estimate)
- **GPU:** Cirrus Logic GD 5446 (emulated display adapter) → **no usable GPU; all inference is CPU-only**
- **RAM:** 48 GB (plenty; CPU throughput is the bottleneck, not RAM)
- **Users:** ~10 concurrent (AGC officers/lawyers)
- **Access:** client VPN → SSH into the VM; repo installs onto the VM

## Decisions & rationale

### 1. Postgres + pgvector (not self-hosted Supabase)
One dependency to harden/patch on a gov box vs Supabase's ~6-container stack. Auth has to be reworked regardless (likely AGC SSO/AD), which erases Supabase's only convenience. Install `pgvector` on the VM's Postgres; point `DATABASE_URL` at it.

### 2. Embeddings: `bge-m3` (1024d) in BOTH environments
Embedding vectors are **not portable across models** — if dev embeds with model A and the VM serves model B, local RAG tests don't predict prod. So dev must use the *same* embedder it ships. `bge-m3` is multilingual (handles Malay), self-hostable, CPU-friendly, and confirmed **1024 dims** via Ollama.
**Consequence:** schema `vector(1536)` → **`vector(1024)`**, full re-ingest, and re-tune the `0.3` match threshold (similarity distributions differ by model).

### 3. Chat LLM: `qwen2.5:7b-instruct`, served by Ollama
Ollama exposes an **OpenAI-compatible** `/v1` API, so the app's existing `new OpenAI({...})` clients only change `baseURL` + `model` + `apiKey` — local↔VM becomes config, not code forks. Local dev may use OpenRouter for the chat model; **embeddings stay on `bge-m3` via Ollama everywhere**.

### 4. Data source: recurring sync from client MySQL (view-only)
Replaces the manual "client emails JSON → hand-clean" loop. MySQL is an **extraction source, not a runtime dependency** — the app still reads Postgres. Build an idempotent ETL on the VM (cron/systemd timer) that **upserts on `source_id` and only re-embeds changed rows** (the current `ingest-data.ts` does a full `DELETE FROM case_embeddings` + re-embed — fine once, wasteful per-sync). Their schema uses the `LKK_` prefix (~1732 cases), which matches what `ingest-data.ts` already expects, so mapping is likely near 1:1 — confirm exact column names.

## Bake-off findings (model + grounding) — 2026-06-21
Ran a DB-free feasibility harness (`scripts/feasibility-bakeoff.ts`): bge-m3 embeddings, in-memory top-5, 8 grounded Malay legal Q&A, mirroring the real chat route's context + prompt.

- **Speed (laptop CPU, slow):** qwen-3b ~5.2 tok/s > qwen-7b ~2.4 > SEA-LION-9B ~1.2. CPU inference is the project's biggest risk for 10 concurrent users.
- **Models:** SEA-LION (Gemma2-9B, SEA-tuned) had the **best Malay + cleanest refusals** but is slowest. **qwen2.5-3b dropped** — Indonesian-language bleed + weakest grounding. **qwen2.5-7b chosen** — best citation compliance, acceptable Malay.
- **The core lesson — hallucination is ~80% a retrieval/prompting problem, not model size.** Every model fabricated legal facts (invented cases, wrong sentences, even a Brunei case) when retrieval returned thin/procedural context. Root cause: 1000/200 chunking separates a case's **facts** from its **verdict** (`LKK_RESULT`), so a retrieved chunk often lacks the outcome.

### Grounding approach (validated direction)
- **v1 (rejected):** baking `Decision` into every chunk header co-located the verdict but made a case's chunks self-similar → **collapsed top-5 diversity** (other cases crowded out), and prompt-only anti-fabrication **failed** (an out-of-DB question confabulated fake corruption law).
- **v2 (adopted):**
  1. Keep embedded chunks diverse (do **not** bake the verdict into embeddings).
  2. **Join the verdict at context-assembly time** — after retrieving top-5 chunks, look up each distinct case's `LKK_RESULT` and add one "Keputusan rasmi:" line per case (a join to the `cases` table in the real route).
  3. **Deterministic refusal gate** — if top cosine similarity < ~`0.55`, return the refusal message *without calling the LLM* (out-of-DB questions scored ~0.53; real in-DB questions ≥0.59). The model can't be trusted to refuse reliably; the gate can.
  4. Keep the hard anti-fabrication prompt rules as defence-in-depth.

**v2 validated (2026-06-21, qwen-7b):** the similarity gate gave an instant clean refusal on the out-of-DB question (no LLM call, no fabrication); diversity was restored (the target case came back in retrieval); the verdict-join produced correct sentences (e.g. "gantung sampai mati", "6 tahun + 2 sebatan"); and the previously-invented "Brunei case" was replaced by a real retrieved case. **Conclusion: the model was never the main lever — retrieval discipline + the gate were.**

### Citation enforcement (tested 2026-06-22) — adopt the tag scheme
Tried two approaches on qwen-7b:
- **Name-match post-process (rejected):** auto-linking case names in the answer to retrieved IDs **fails** here — case names are messy (multi-defendant lists, embedded IC numbers) and the model refers to cases by short labels / invents its own format ("(Case ID: 134)"). Verbatim matching can't keep up.
- **Numbered-tag scheme (ADOPT):** label retrieved cases `[1] [2] [3]` in the assembled context; instruct the model to cite with the bare tag (`[1]`); a deterministic post-process expands `[1]` → `[[Real Case Name]](real_id)` from a tag→case map the code controls. **Result: every emitted tag expanded to a correct citation — 0 wrong IDs, 0 hallucinated IDs, and the cross-case attribution bug disappeared** (the model never handles IDs). Also added a mandatory "Rujukan: [n]" footer and tightened the refuse rule (fixed over-refusal).

**Residual (a model-adherence ceiling, not a format bug):** the 7B cites reliably on confident answers (~5/8) but **omits citations on hedging/uncertain answers** (~3/8). A naive "auto-cite if missing" backstop is **unsafe** — it mis-attributes, because the answer's actual case isn't always the top-ranked retrieved chunk (e.g. a question about case 17 where case 3203 ranked first). To raise coverage >95%, the real options are: (1) a **dedicated citation/verification pass** (2nd focused LLM call — accurate but **doubles latency**, costly on the GPU-less VM), (2) a **bigger model** (slower on CPU), or (3) accept ~70% inline + a transparent "Sumber dirujuk" footer listing all retrieved cases. **This is a quality/latency tradeoff to settle alongside the GPU decision.** The tag architecture is the foundation — adopt it regardless.

**Other open item:** refuse-vs-answer logic is improved but the gate should own refusal so the LLM only runs when there's real context.

## Migration checklist (files to change when implementing)
- [x] **Schema** (`scripts/setup-db.ts`): `vector(1536)` → `vector(1024)`; + role bootstrap, `content_hash`, `act_tags`. (`supabase/migrations/` left at 1536 — superseded by setup-db.ts.)
- [x] **Embeddings**: `scripts/ingest-data.ts` + the query embedding in `src/app/api/chat/route.ts` → Ollama `bge-m3` (changed together). `ingest-data-continue.ts` now redundant (ingest is incremental) — still legacy.
- [x] **Chat model + client**: `route.ts` v2 — OpenRouter `qwen2.5-7b` (dev) via env; verdict-join + similarity gate added.
- [x] **Auth**: Supabase Auth → Auth.js v5 (Credentials+JWT, `users` table, bcrypt). `auth.ts`/`auth.config.ts`, `src/proxy.ts` gate, rewired `/auth/*` pages + Sidebar, `/api/auth/*`. Supabase removed. **See "DECIDE AT VM SETUP" above** for provisioning/reset/SSO.
- [x] **Data reads**: the page `SELECT`s (`page.tsx`, `dashboard/page.tsx`, `cases/[id]/page.tsx`) → `pg` via `src/lib/cases.ts`. (Sidebar used Supabase only for auth, now Auth.js.)
- [~] **Sync**: `scripts/sync-mysql.ts` does MySQL extract → clean → categorize → upsert on `source_id` + incremental re-embed. **Manual run only** — still needs a systemd timer/cron on the VM, source-side change-detection (currently re-reads all rows), and deletion propagation. See **"DECIDE AT VM SETUP" item 5** above.
- [x] **Config**: env-driven model/baseURL/dimension in `src/lib/aiConfig.ts`. Drop `transpilePackages: ['@supabase/ssr']` only after Supabase is fully removed (**still in use**).
- [~] **Docs/skills**: `docs/{on-prem-migration,database,data-pipeline,rag-chat,local-setup}.md` updated 2026-06-22. Skill banners note local-dev-vs-deployed split.

## Open blockers (need the client; user can't engage them yet as of 2026-06-21)
1. **GPU** — CPU-only inference is too slow for 10 concurrent users at acceptable latency. Either get a GPU on the VM, or set hard expectations (queue + slow). No model choice fixes this.
2. **VM egress** — does the locked-down gov VM allow outbound to OpenRouter/Voyage? If not, those are dead on the VM (on-prem Ollama is assumed for the VM regardless; this only affects whether dev-style cloud APIs are reachable there).

## Continuing inside the VM with Claude CLI
The user's `~/.claude` **memory does not transfer** to the VM — this doc is the handoff. When starting a Claude CLI session on the VM:
1. Read this doc first, then `CLAUDE.md` + the relevant skill.
2. Expect a different env: `DATABASE_URL` → local VM Postgres; an `OLLAMA`/OpenAI-compatible base URL for chat + embeddings; **no** Supabase vars once Auth is migrated.
3. `ollama list` should show `bge-m3` and `qwen2.5:7b-instruct`. If not, `ollama pull` them.
4. The feasibility harness `scripts/feasibility-bakeoff.ts` is DB-free and a good first smoke test of the local model stack (uses Ollama `/v1`).
5. Verify CPU tok/s on the VM early — it is the binding constraint.
