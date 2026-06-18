# RAG Chat Pipeline — AGC2

End-to-end flow for the AI chat (`/chat` page → `POST /api/chat`).

## Request path
1. `ChatInterface.tsx` sends the full message history to `POST /api/chat`.
2. Route (`src/app/api/chat/route.ts`, **Node runtime** — required for `pg`):
   - Embeds the **last user message** with OpenAI `text-embedding-3-small` (1536 dims).
   - Vector search via the `match_documents()` PG function (see docs/database.md), called through the `pg` pool — NOT supabase-js.
   - Builds a context block per matched chunk: Case ID, Case Name (parsed from the chunk's first `Case Name:` line), citation format hint, source folder, content.
   - Streams `gpt-4o` completion as a plain text stream (`text/event-stream` header but raw text chunks, not SSE events).
3. Frontend renders the stream incrementally and parses citations.

## Pinned numbers (calibrated — do not change casually)
| Constant | Value | Where |
|---|---|---|
| Embedding model | `text-embedding-3-small` (1536d) | chat route + `scripts/ingest-data.ts` — must match `case_embeddings.embedding vector(1536)` |
| Match threshold | **0.3** (deliberately lowered from 0.5 for vague/Malay conversational queries) | chat route |
| Match count | **5** | chat route |
| Chat model | `gpt-4o` | chat route |

If you change the embedding model, ALL existing embeddings must be regenerated (`scripts/ingest-data.ts`) and the vector column dimension may change.

## System prompt contract
- Persona: Malay legal assistant (Kanun Keseksaan & Akta Penculikan), answers in Bahasa Melayu by default, English if asked in English.
- Answers from provided context ONLY; refusal phrase: "Maaf, maklumat tersebut tiada dalam pangkalan data kes saya."
- **Citation format is load-bearing**: `[[Nama Kes]](case_id)` — double square brackets + numeric case id. The frontend regex in `ChatInterface.tsx` parses `[[Name]](123)` (and tolerates single-bracket `[Name](123)`) and renders links to `/cases/:id`. Changing the prompt's citation instructions or the regex breaks clickable citations silently.
- Asks for clarification when the query is too vague and multiple cases match.

## Frontend behavior (`src/components/ChatInterface.tsx`)
- Messages persisted to `localStorage` under key `chat_messages`; "clear chat" wipes both state and storage.
- Cited case IDs are collected from assistant messages (used for export integration).
- Auto-scrolls to bottom on new content.

## Build-time guard
The OpenAI client is constructed with `'dummy_key_for_build'` fallback so `next build` succeeds without secrets; the route throws at request time if `OPENAI_API_KEY` is missing. Keep this pattern when adding OpenAI calls.

> Maintenance: if you change a threshold, model, prompt rule, or the citation format, update this file in the same change.
