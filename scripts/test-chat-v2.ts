/**
 * End-to-end smoke test of the on-prem chat pipeline (mirrors src/app/api/chat/route.ts):
 * bge-m3 query embed -> match_documents -> refusal gate -> tag+verdict context assembly ->
 * OpenRouter qwen -> expand [n] to [[name]](id). Validates the LLM call + citation expansion
 * without needing the authenticated Next route.
 *   npx tsx scripts/test-chat-v2.ts
 */
import dotenv from 'dotenv';
import path from 'path';
import OpenAI from 'openai';
import { Pool } from 'pg';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434/v1';
const EMBED_MODEL = process.env.EMBED_MODEL || 'bge-m3';
const CHAT_BASE_URL = process.env.CHAT_BASE_URL || 'https://openrouter.ai/api/v1';
const CHAT_MODEL = process.env.CHAT_MODEL || 'qwen/qwen-2.5-7b-instruct';
const CHAT_API_KEY = process.env.CHAT_API_KEY || process.env.OPENROUTER_API_KEY || '';
const REFUSE_GATE = parseFloat(process.env.REFUSE_GATE || '0.59');
const REFUSAL_MSG = 'Maaf, maklumat tersebut tiada dalam pangkalan data kes saya.';

const embedder = new OpenAI({ baseURL: OLLAMA_URL, apiKey: 'ollama' });
const chat = new OpenAI({ baseURL: CHAT_BASE_URL, apiKey: CHAT_API_KEY || 'missing' });

function expandTags(answer: string, tagMap: Map<number, { id: number; name: string }>): string {
    return answer.replace(/\[(\d{1,2})\]/g, (full, n) => {
        const t = tagMap.get(parseInt(n, 10));
        return t ? `[[${t.name}]](${t.id})` : full;
    });
}

async function ask(pool: Pool, q: string) {
    console.log(`\n${'='.repeat(80)}\nQ: ${q}`);
    const emb = await embedder.embeddings.create({ model: EMBED_MODEL, input: q });
    const vec = `[${(emb.data[0].embedding as number[]).join(',')}]`;
    const { rows: docs } = await pool.query(`SELECT * FROM match_documents($1,$2,$3,$4)`, [vec, 0.2, 5, {}]);
    const topSim = docs[0]?.similarity ?? 0;
    console.log(`top sim ${topSim.toFixed(3)} | retrieved ${docs.length}`);
    if (!docs.length || topSim < REFUSE_GATE) { console.log(`[GATED -> refuse] ${REFUSAL_MSG}`); return; }

    const tagOf = new Map<number, number>(); const ids: number[] = [];
    for (const d of docs) if (!tagOf.has(d.case_id)) { tagOf.set(d.case_id, tagOf.size + 1); ids.push(d.case_id); }
    const { rows: cr } = await pool.query(`SELECT id, case_name, result FROM cases WHERE id = ANY($1)`, [ids]);
    const info = new Map<number, { name: string; result: string }>();
    for (const r of cr) info.set(r.id, { name: r.case_name || 'Kes', result: r.result || 'Tidak dinyatakan dalam rekod' });
    const tagMap = new Map<number, { id: number; name: string }>();
    for (const [cid, tag] of tagOf) tagMap.set(tag, { id: cid, name: info.get(cid)?.name || 'Kes' });

    const ctx = docs.map(d => `[${tagOf.get(d.case_id)}] Case Name: ${info.get(d.case_id)?.name}\nKeputusan rasmi kes ini: ${info.get(d.case_id)?.result}\nContent:\n${d.content}`).join('\n\n---\n\n');
    const sys = `Anda pembantu undang-undang jenayah Malaysia. Jawab dalam Bahasa Melayu berdasarkan konteks SAHAJA. Rujuk kes dengan PENANDA nombor sahaja cth [1]. JANGAN reka fakta. Akhiri dengan "Rujukan: [n]".\n\nKonteks:\n${ctx}`;

    const res = await chat.chat.completions.create({
        model: CHAT_MODEL, temperature: 0,
        messages: [{ role: 'system', content: sys }, { role: 'user', content: q }],
    });
    const raw = res.choices[0]?.message?.content || '';
    const expanded = expandTags(raw, tagMap);
    console.log(`--- raw tags emitted: ${(raw.match(/\[\d{1,2}\]/g) || []).join(' ') || 'none'} ---`);
    console.log(expanded);
}

async function main() {
    if (!CHAT_API_KEY) { console.error('No OPENROUTER_API_KEY / CHAT_API_KEY set.'); process.exit(1); }
    console.log(`Chat model: ${CHAT_MODEL} @ ${CHAT_BASE_URL}`);
    const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5432/postgres' });
    try {
        await ask(pool, 'Di mahkamah mana kes PP lwn Wan Mohd Herdy bin Wan Hamid dibicarakan dan apakah hukumannya?');
        await ask(pool, 'Apakah hukuman bagi kesalahan rasuah di bawah Akta SPRM 2009?'); // out-of-DB -> should refuse
    } catch (e: any) { console.error('ERROR:', e.message); if (e.response?.data) console.error(e.response.data); }
    finally { await pool.end(); }
}

main();
