# RAG Chat Pipeline — AGC2

End-to-end flow for the AI chat (`/chat` page → `POST /api/chat`).

## Request path
1. `ChatInterface.tsx` sends the full message history to `POST /api/chat`.
2. Route (`src/app/api/chat/route.ts`, **Node runtime** — required for `pg`; all knobs in `src/lib/aiConfig.ts`):
   - Embeds the **last user message** with Ollama `bge-m3` (1024d).
   - Vector search via `match_documents()` (see docs/database.md) through the `pg` pool — retrieves top-5 above a low floor (0.2).
   - **Refusal gate**: if top similarity `< REFUSE_GATE` (0.59), returns the refusal string **without calling the LLM** (out-of-DB questions score below in-DB ones). Deterministic — the LLM can't be trusted to refuse. **Corpus-dependent — recalibrate when the corpus grows** (see pinned table).
   - **Verdict-join**: looks up each distinct retrieved case's `cases.result` and adds a "Keputusan rasmi kes ini:" line at assembly (NOT embedded — embedding the verdict collapses retrieval diversity).
   - **Numbered-tag citations**: context labels cases `[1] [2]`; the model cites bare tags; a deterministic post-process expands `[1]` → `[[Real Case Name]](real_id)` from a code-controlled tag→case map (0 hallucinated ids).
   - **Token-streamed** to the client (`stream: true`) so the answer appears word-by-word. Tags are expanded `[1]` → `[[name]](id)` on the fly, holding back any trailing not-yet-closed `[…` so a tag is never split across chunks (expansion stays deterministic). The refusal/maintenance paths still send a single `textStream` chunk.
3. Frontend parses `[[name]](id)` citations into `/cases/:id` links.

## Pinned numbers (calibrated — do not change casually)
| Constant | Value | Where |
|---|---|---|
| Embedding model | `bge-m3` (1024d) via Ollama | `aiConfig.embed` + `scripts/ingest-data.ts` — must match `case_embeddings.embedding vector(1024)` |
| Retrieve floor | **0.2** (candidate pull) | `aiConfig.retrieval.retrieveFloor` |
| Refuse gate | **0.59** (top sim below → refuse, no LLM) — calibrated on 849-case corpus: in-DB 0.64–0.69, out-of-DB 0.50–0.55. **Re-tune as the corpus grows** (out-of-DB queries find closer spurious matches with more data). | `aiConfig.retrieval.refuseGate` / `REFUSE_GATE` env |
| Match count | **5** | `aiConfig.retrieval.matchCount` |
| Chat model | `qwen/qwen-2.5-7b-instruct` via OpenRouter (dev); Ollama `qwen2.5:7b-instruct` on VM | `aiConfig.chat` / `CHAT_*` env |

If you change the embedding model, ALL embeddings must be regenerated (`scripts/ingest-data.ts`) — and the `vector()` dimension + `REFUSE_GATE` retuned (similarity distributions differ by model).

## System prompt contract
- Persona: Malay legal assistant (Kanun Keseksaan & Akta Penculikan), answers in Bahasa Melayu by default, English if asked in English.
- Answers from provided context ONLY; refusal phrase: "Maaf, maklumat tersebut tiada dalam pangkalan data kes saya."
- **Citation contract is load-bearing, two-stage**: the prompt tells the model to emit bare numbered tags `[1]`; the route's `expandTags()` rewrites them to `[[Nama Kes]](case_id)`; `ChatInterface.tsx` parses `[[Name]](123)` (tolerates single-bracket `[Name](123)`) → `/cases/:id` links. So three things must stay in sync: the prompt's tag rule, `expandTags`, and the frontend regex. The `id` is the **DB `cases.id`** (what `match_documents` returns), not `source_id`.
- Asks for clarification when the query is too vague and multiple cases match.

## Frontend behavior (`src/components/ChatInterface.tsx`)
- Messages persisted to `localStorage` under key `chat_messages`; "clear chat" wipes both state and storage.
- Cited case IDs are collected from assistant messages (used for export integration).
- Auto-scrolls to bottom on new content.

## Build-time guard
The chat client is constructed with a `'missing-key'` fallback so `next build` succeeds without secrets; the route throws at request time if `CHAT.apiKey` (`OPENROUTER_API_KEY`/`CHAT_API_KEY`) is missing. Keep this pattern when adding model calls.

> Maintenance: if you change a threshold, model, prompt rule, or the citation format, update this file in the same change.
