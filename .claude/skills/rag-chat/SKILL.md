---
name: rag-chat
description: Use when working on the AI chat, RAG retrieval, embeddings, prompts, or model config — src/app/api/chat/route.ts, match_documents, ChatInterface, ingest scripts, OpenAI usage.
---

# RAG / Chat Work — AGC2

## Before writing any code (mandatory pre-flight)
1. Read [docs/rag-chat.md](../../../docs/rag-chat.md) — full pipeline, prompt contract, pinned numbers.
2. Read `src/app/api/chat/route.ts` end-to-end (it's ~125 lines) before touching any part of it.
3. If the change affects retrieval quality, also read [docs/database.md](../../../docs/database.md) (`match_documents` signature) and `scripts/ingest-data.ts` (chunking).

> **⚠️ Planned migration (see [docs/on-prem-migration.md](../../../docs/on-prem-migration.md)).** The numbers below describe the CURRENT (cloud/OpenAI) code. The on-prem target swaps embeddings to `bge-m3` (**1024d**, via Ollama), chat to `qwen2.5:7b-instruct` (Ollama) / OpenRouter in dev, and adds a verdict-join-at-assembly + ~0.55 similarity refusal gate. Don't apply those until you're doing the migration — and when you do, update these pinned numbers.

## Pinned numbers (do not drift)
- Embedding: OpenAI `text-embedding-3-small`, **1536 dims** — must match `case_embeddings.embedding vector(1536)` AND the ingest script. Changing the model requires re-embedding everything; say so explicitly.
- Match threshold **0.3** (deliberately lowered from 0.5 for vague Malay queries — raising it back will silently empty results for conversational questions).
- Match count **5**. Chat model `gpt-4o`.
- Chunking: 1000 chars / 200 overlap (`RecursiveCharacterTextSplitter` in ingest).

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
2. Smoke-test retrieval without burning the UI: `npx tsx scripts/test-retrieval.ts` or `scripts/test-chat-logic.ts`.
3. If prompt or parsing changed: run one real chat in the dev server and confirm citations render as links to `/cases/:id`.

## Common mistakes
- Raising the match threshold to "improve precision" → vague Malay queries return zero context and the bot refuses everything.
- Changing chunk format in ingest without re-running ingest → old chunks unparseable for citations.
- Adding supabase-js calls inside the route instead of the pool → bypasses `match_documents`, breaks under RLS.
