---
name: rag-chat
description: Use when working on the AI chat, RAG retrieval, embeddings, prompts, or model config — src/app/api/chat/route.ts, match_documents, ChatInterface, ingest scripts, OpenAI usage.
---

# RAG / Chat Work — AGC2

## Before writing any code (mandatory pre-flight)
1. Read [docs/rag-chat.md](../../../docs/rag-chat.md) — full pipeline, prompt contract, pinned numbers.
2. Read `src/app/api/chat/route.ts` end-to-end (it's ~125 lines) before touching any part of it.
3. If the change affects retrieval quality, also read [docs/database.md](../../../docs/database.md) (`match_documents` signature) and `scripts/ingest-data.ts` (chunking).

> **⚠️ Migration LANDED for local dev (2026-06-22).** `route.ts` now runs the on-prem stack — `bge-m3` (1024d) via Ollama, OpenRouter `qwen2.5-7b`, a 0.59 refusal gate, verdict-join, and numbered-tag citations — knobs in `src/lib/aiConfig.ts`. **The pinned numbers below are SUPERSEDED**; see [docs/rag-chat.md](../../../docs/rag-chat.md) for current values. Auth + the deployed app are still cloud/Supabase.

## Pinned numbers (CURRENT — on-prem)
- Embedding: Ollama `bge-m3`, **1024 dims** — must match `case_embeddings.embedding vector(1024)` AND `scripts/ingest-data.ts`. Changing the model requires re-embedding everything + retuning the gate; say so explicitly.
- **Refuse gate 0.59** (top sim below → deterministic refusal, no LLM). Retrieve floor 0.2. **Corpus-dependent — re-tune via `scripts/test-retrieval.ts` when the corpus grows** (more cases → out-of-DB queries find closer spurious matches; 0.55 was unsafe at 849 cases).
- Match count **5**. Chat model `qwen/qwen-2.5-7b-instruct` (OpenRouter dev) / `qwen2.5:7b-instruct` (Ollama VM).
- Chunking: 1000 chars / 200 overlap (`RecursiveCharacterTextSplitter` in ingest).
- _(Superseded cloud values: `text-embedding-3-small`/1536, `gpt-4o`, threshold 0.3.)_

## Hard rules
- The route stays on **Node runtime** (`export const runtime = 'nodejs'`) — `pg` does not run on Edge.
- DB access in this route goes through the `pg` pool (`@/lib/db`), not supabase-js — `match_documents` is called with a stringified vector.
- **Citation contract**: the system prompt mandates `[[Nama Kes]](case_id)`; `ChatInterface.tsx` parses exactly that. Change both together or neither.
- Case names are parsed from each chunk's first `Case Name:` line — chunk header format (ingest) and parser (route) are coupled.
- The response is a raw text stream (not OpenAI SSE-event format) — the frontend appends chunks verbatim. Don't switch wire format without rewriting the frontend reader.
- Keep the `'dummy_key_for_build'` fallback on the OpenAI client (build must succeed without secrets); the runtime guard throws instead.
- Persona answers in Bahasa Melayu by default; keep prompt edits in that register and keep the "context-only, no fabrication" rule.

## After the change (mandatory verification)
1. `npm run build` — zero errors.
2. Smoke-test retrieval without burning the UI: `npx tsx scripts/test-retrieval.ts` or `scripts/test-chat-v2.ts`.
3. If prompt or parsing changed: run one real chat in the dev server and confirm citations render as links to `/cases/:id`.

## Common mistakes
- Raising the match threshold to "improve precision" → vague Malay queries return zero context and the bot refuses everything.
- Changing chunk format in ingest without re-running ingest → old chunks unparseable for citations.
- Adding supabase-js calls inside the route instead of the pool → bypasses `match_documents`, breaks under RLS.
