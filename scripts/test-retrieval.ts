/**
 * Retrieval smoke test on the on-prem stack: embeds queries with Ollama bge-m3 and
 * runs match_documents against the local pgvector DB. Prints top-5 similarity per
 * query so the REFUSE_GATE can be tuned (in-DB questions should sit clearly above
 * out-of-DB ones). No LLM call.
 *   npx tsx scripts/test-retrieval.ts
 */
import dotenv from 'dotenv';
import path from 'path';
import OpenAI from 'openai';
import { Pool } from 'pg';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434/v1';
const EMBED_MODEL = process.env.EMBED_MODEL || 'bge-m3';
const PG_CONN = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5432/postgres';

const QUERIES = [
    { label: 'IN : Wan Mohd Herdy (39B)', q: 'Di mahkamah mana kes PP lwn Wan Mohd Herdy bin Wan Hamid dibicarakan dan apakah hukumannya?' },
    { label: 'IN : dadah / 39B', q: 'kes pengedaran dadah di bawah Seksyen 39B' },
    { label: 'IN : bunuh / 302', q: 'kes bunuh di bawah Seksyen 302 Kanun Keseksaan dan hukumannya' },
    { label: 'IN : penculikan', q: 'kes penculikan di bawah Akta Penculikan 1961' },
    { label: 'IN : pemerdagangan orang', q: 'kes pemerdagangan orang dan hukuman yang dijatuhkan' },
    { label: 'IN : seksual kanak-kanak', q: 'kes kesalahan seksual terhadap kanak-kanak' },
    { label: 'IN : vague "kes dadah"', q: 'kes dadah' },
    { label: 'OUT: rasuah / SPRM', q: 'Apakah hukuman bagi kesalahan rasuah di bawah Akta SPRM 2009?' },
    { label: 'OUT: cyber hacking', q: 'hukuman bagi jenayah penggodaman komputer dan akses tanpa kebenaran' },
    { label: 'OUT: cukai SST', q: 'kadar cukai jualan dan perkhidmatan SST bagi restoran' },
    { label: 'OUT: nonsense', q: 'apakah ibu negara Perancis dan cuaca hari ini' },
];

async function main() {
    const embedder = new OpenAI({ baseURL: OLLAMA_URL, apiKey: 'ollama' });
    const pool = new Pool({ connectionString: PG_CONN });
    try {
        const [{ count }] = (await pool.query('SELECT count(DISTINCT case_id)::int FROM case_embeddings')).rows;
        console.log(`Embedded cases in DB: ${count}\n`);
        for (const { label, q } of QUERIES) {
            const emb = await embedder.embeddings.create({ model: EMBED_MODEL, input: q });
            const vectorStr = `[${(emb.data[0].embedding as number[]).join(',')}]`;
            const { rows } = await pool.query(`SELECT * FROM match_documents($1,$2,$3,$4)`, [vectorStr, 0.0, 5, {}]);
            console.log(`### ${label}`);
            console.log(`Q: ${q}`);
            if (!rows.length) { console.log('  (no matches)\n'); continue; }
            for (const r of rows) {
                const name = (r.content.match(/Case Name:\s*(.+)/)?.[1] || '').slice(0, 45);
                console.log(`  sim ${r.similarity.toFixed(3)}  case ${r.case_id}  ${name}`);
            }
            console.log('');
        }
    } catch (e: any) {
        console.error('Error:', e.message); if (e.detail) console.error('Detail:', e.detail);
    } finally { await pool.end(); }
}

main();
