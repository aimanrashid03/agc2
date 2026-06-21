# On-Prem Migration — AGC2

> **Status: PLANNING / IN PROGRESS (started 2026-06-21).** The code in `master`/`exp` today still
> runs the **cloud** stack (Vercel + hosted Supabase + OpenAI, `vector(1536)`). This doc describes
> where we are going. **Do not assume any of the "Target" column is implemented yet** — check the
> code. When a target item lands, move it out of "planned" here and update the matching skill/doc.

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
- **Schema** (`scripts/setup-db.ts`, authoritative rebuild path; also `supabase/migrations/`): `vector(1536)` → `vector(1024)`. `match_documents` body is dimension-agnostic but the column isn't.
- **Embeddings**: `scripts/ingest-data.ts`, `scripts/ingest-data-continue.ts`, and the query embedding in `src/app/api/chat/route.ts` — point all at Ollama `bge-m3`. **Change all together** (query + stored embeddings must be the same model).
- **Chat model + client**: `src/app/api/chat/route.ts` — `baseURL`/`model`/`apiKey` to Ollama (VM) / OpenRouter (dev chat). Add the verdict-join + similarity gate from v2 above.
- **Auth**: replace `src/lib/supabase/{client,server,middleware}.ts` + `/auth/*` pages + Sidebar sign-out with Auth.js (or AGC SSO).
- **Data reads**: convert the ~5 supabase-js `SELECT`s (`src/app/page.tsx`, `dashboard/page.tsx`, `cases/[id]/page.tsx`, Sidebar) to `pg`.
- **Sync**: new script — MySQL extract → clean → upsert on `source_id` → incremental re-embed; schedule via systemd timer/cron on the VM.
- **Config**: introduce env-driven model/baseURL/dimension (stop hardcoding `1536`/model names across files). Drop `transpilePackages: ['@supabase/ssr']` only after Supabase is fully removed.
- **Docs/skills**: update `rag-chat`, `database`, `data-pipeline` skills + `docs/{rag-chat,database,data-pipeline,local-setup}.md` pinned numbers once each item lands.

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
