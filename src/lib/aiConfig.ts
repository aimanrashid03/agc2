/**
 * Centralized AI/RAG config for the on-prem stack. Env-driven so local dev and the
 * client VM differ by configuration, not code. Defaults target local dev:
 *   - embeddings: Ollama bge-m3 (1024d) — MUST match the ingest model + vector(1024) column
 *   - chat: OpenRouter qwen2.5-7b in dev; on the VM set CHAT_BASE_URL -> Ollama, CHAT_MODEL -> qwen2.5:7b-instruct
 * Scripts (ingest-data.ts, test-*.ts) mirror these same env vars/defaults.
 */
export const aiConfig = {
    embed: {
        baseUrl: process.env.OLLAMA_URL || 'http://127.0.0.1:11434/v1',
        model: process.env.EMBED_MODEL || 'bge-m3',
        apiKey: 'ollama',
    },
    chat: {
        baseUrl: process.env.CHAT_BASE_URL || 'https://openrouter.ai/api/v1',
        model: process.env.CHAT_MODEL || 'qwen/qwen-2.5-7b-instruct',
        apiKey: process.env.CHAT_API_KEY || process.env.OPENROUTER_API_KEY || '',
    },
    retrieval: {
        matchCount: 5,
        retrieveFloor: 0.2,                                      // pull candidates above this; gate applied in code
        refuseGate: parseFloat(process.env.REFUSE_GATE || '0.59'), // top sim below this -> refuse without the LLM
        // Calibrated on the 849-case corpus (2026-06-22): in-DB Qs score 0.64-0.69, out-of-DB 0.50-0.55.
        // 0.59 sits in the gap. Bias slightly high — a false refusal is safe; a hallucination is not.
    },
    refusalMsg: 'Maaf, saya tidak menemui maklumat itu dalam pangkalan data kes saya. Cuba nyatakan seksyen, jenis kes, atau kata kunci lain — saya sedia membantu.',
};
