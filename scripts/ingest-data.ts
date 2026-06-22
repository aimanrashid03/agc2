/**
 * Embedding ingest (on-prem stack). Reads cases straight from Postgres (loaded by
 * scripts/sync-mysql.ts), chunks each case, embeds with Ollama `bge-m3` (1024d via
 * the OpenAI-compatible API), and writes to case_embeddings.
 *
 * Incremental: a case is (re)embedded only when it has no up-to-date embedding —
 * i.e. no case_embeddings row whose metadata.content_hash == cases.content_hash.
 * Changed cases have their stale chunks deleted and are re-embedded; unchanged
 * cases are skipped. Replaces the old full `DELETE FROM case_embeddings` + OpenAI.
 *
 *   npx tsx scripts/ingest-data.ts             # embed all cases needing it
 *   npx tsx scripts/ingest-data.ts --limit 200 # subset (fast validation first)
 */
import { Pool } from 'pg';
import OpenAI from 'openai';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const PG_CONN = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5432/postgres';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434/v1';
const EMBED_MODEL = process.env.EMBED_MODEL || 'bge-m3';
const BATCH = 32; // chunks per embeddings request

const args = process.argv.slice(2);
const LIMIT = (() => { const i = args.indexOf('--limit'); return i >= 0 ? parseInt(args[i + 1], 10) : 0; })();
// --sample N: stratified subset of N cases spread round-robin across source_folder (Act),
// so even the long-tail categories are represented (better than --limit's lowest-id slice).
const SAMPLE = (() => { const i = args.indexOf('--sample'); return i >= 0 ? parseInt(args[i + 1], 10) : 0; })();

const client = new OpenAI({ baseURL: OLLAMA_URL, apiKey: 'ollama' });

// Mirrors scripts/sync-mysql.ts buildCaseText so content_hash stays consistent.
function buildCaseText(c: any): string {
    return [
        `Case Name: ${c.case_name || 'N/A'}`,
        `Court: ${c.court_desc || 'N/A'}`,
        `State: ${c.state_desc || 'N/A'}`,
        `Facts: ${c.case_facts || 'N/A'}`,
        `Issues & Arguments: ${c.issues_and_arguments || 'N/A'}`,
        `Judgment: ${c.grounds_of_judgement || 'N/A'}`,
        `Decision: ${c.result || 'N/A'}`,
    ].filter(p => p.length > 20).join('\n\n');
}

async function embedBatch(inputs: string[]): Promise<number[][]> {
    const r = await client.embeddings.create({ model: EMBED_MODEL, input: inputs });
    return r.data.map(d => d.embedding as number[]);
}

async function main() {
    console.log(`Ingest via Ollama ${EMBED_MODEL} @ ${OLLAMA_URL}${LIMIT ? ` (limit ${LIMIT})` : ''}`);
    const pool = new Pool({ connectionString: PG_CONN });
    const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000, chunkOverlap: 200 });

    // Cases needing (re)embedding: no chunk carrying the current content_hash.
    const cols = `c.id, c.source_id, c.source_folder, c.case_name, c.court_desc, c.state_desc,
                  c.case_facts, c.issues_and_arguments, c.grounds_of_judgement, c.result, c.content_hash`;
    const notEmbedded = `NOT EXISTS (SELECT 1 FROM case_embeddings e
                         WHERE e.case_id = c.id AND e.metadata->>'content_hash' = c.content_hash)`;
    const sql = SAMPLE
        ? `WITH ranked AS (
               SELECT ${cols}, row_number() OVER (PARTITION BY c.source_folder ORDER BY c.id) AS rn
               FROM cases c WHERE ${notEmbedded})
           SELECT * FROM ranked ORDER BY rn, source_folder LIMIT ${SAMPLE}`
        : `SELECT ${cols} FROM cases c WHERE ${notEmbedded} ORDER BY c.id ${LIMIT ? `LIMIT ${LIMIT}` : ''}`;
    const { rows: cases } = await pool.query(sql);
    console.log(`${cases.length} case(s) need embedding.`);
    if (!cases.length) { await pool.end(); console.log('Nothing to do.'); return; }

    let done = 0, chunkTotal = 0;
    const t0 = Date.now();
    for (const c of cases) {
        const text = buildCaseText(c);
        if (text.length < 50) { done++; continue; }

        const docs = await splitter.createDocuments([text]);
        const enriched = docs.map(d =>
            `Case Name: ${c.case_name || 'N/A'}\nCourt: ${c.court_desc || 'N/A'}\nState: ${c.state_desc || 'N/A'}\n---\n${d.pageContent}`);

        // refresh: drop any stale chunks for this case, then insert fresh
        await pool.query('DELETE FROM case_embeddings WHERE case_id = $1', [c.id]);

        for (let i = 0; i < enriched.length; i += BATCH) {
            const slice = enriched.slice(i, i + BATCH);
            const embs = await embedBatch(slice);
            for (let j = 0; j < slice.length; j++) {
                const metadata = {
                    caseId: c.id, source_id: c.source_id, source_folder: c.source_folder, content_hash: c.content_hash,
                };
                await pool.query(
                    'INSERT INTO case_embeddings (case_id, content, metadata, embedding) VALUES ($1,$2,$3,$4)',
                    [c.id, slice[j], metadata, `[${embs[j].join(',')}]`]);
            }
        }
        chunkTotal += enriched.length;
        if (++done % 50 === 0) {
            const secs = (Date.now() - t0) / 1000;
            console.log(`  ${done}/${cases.length} cases, ${chunkTotal} chunks (${(chunkTotal / secs).toFixed(1)} chunks/s)`);
        }
    }

    const secs = (Date.now() - t0) / 1000;
    console.log(`\nDone: embedded ${chunkTotal} chunks across ${done} cases in ${secs.toFixed(0)}s (${(chunkTotal / secs).toFixed(1)} chunks/s).`);
    await pool.end();
}

main().catch(e => { console.error('INGEST ERROR:', e); process.exit(1); });
