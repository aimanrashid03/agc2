/**
 * By-name false-refusal measurement + gate-threshold sweep for the on-prem RAG gate.
 *
 * Motivation: the 0.59 refuse gate (aiConfig.refuseGate) is the right safety lever for
 * out-of-DB questions, but by-name / narrative questions about cases that ARE embedded can
 * score just below it (e.g. "Perasantha" landed at 0.573 -> false refusal even though the
 * case was the #1 hit). This quantifies how often that happens and shows where a threshold
 * would have to sit to fix it WITHOUT letting out-of-DB queries leak.
 *
 *   npx tsx scripts/diagnose-byname-gate.ts [sampleSize]   # default 30 embedded cases
 *
 * For each sampled embedded case it fires two realistic phrasings:
 *   V1 sentence : "Apakah hukuman dalam kes {name}?"
 *   V2 narrative: "Apa yang berlaku dalam kes {name}?"
 * and classifies the outcome vs the gate:
 *   GOOD          self case in top-5 AND top sim >= gate (LLM runs on the right case)
 *   FALSE-REFUSAL self case in top-5 BUT top sim < gate (case is right there, gate refuses)
 *   MISS          self case NOT in top-5 (recall/embedding problem, not the gate)
 * Then sweeps thresholds against a fixed out-of-DB set so you can read recall vs leak directly.
 * NO LLM call.
 */
import dotenv from 'dotenv';
import path from 'path';
import OpenAI from 'openai';
import { Pool } from 'pg';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// Known out-of-DB questions (must keep refusing) — same set used in test-retrieval.ts.
const OUT_QUERIES = [
    'Apakah hukuman bagi kesalahan rasuah di bawah Akta SPRM 2009?',
    'hukuman bagi jenayah penggodaman komputer dan akses tanpa kebenaran',
    'kadar cukai jualan dan perkhidmatan SST bagi restoran',
    'apakah ibu negara Perancis dan cuaca hari ini',
    'Apakah hukuman bagi kesalahan di bawah Akta Keterangan 1950?',
];

// Approximate what a user actually types: drop IC noise + co-defendant tails, cap length.
function shortName(raw: string): string {
    let n = raw.replace(/\(\s*NO\.?\s*KP[^)]*\)/gi, ' ').replace(/\s+/g, ' ').trim();
    n = n.replace(/^\d+\s*[.)]\s*/, '');                       // leading "1." numbering
    n = n.split(/\s+&\s+|\s+DAN\s+|…|\.\.\./)[0].trim();       // first party before co-defendants
    return n.slice(0, 70).trim();
}

async function main() {
    const { aiConfig } = await import('../src/lib/aiConfig');
    const { embed: EMBED, retrieval: RET } = aiConfig;
    const SAMPLE = parseInt(process.argv[2] || '30', 10);

    const embedder = new OpenAI({ baseURL: EMBED.baseUrl, apiKey: EMBED.apiKey });
    const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5432/postgres' });

    const embedQ = async (q: string) => {
        const e = await embedder.embeddings.create({ model: EMBED.model, input: q });
        return `[${(e.data[0].embedding as number[]).join(',')}]`;
    };
    const topMatch = async (vec: string) => {
        const { rows } = await pool.query(`SELECT case_id, similarity FROM match_documents($1,$2,$3,$4)`, [vec, 0.0, RET.matchCount, {}]);
        return rows as { case_id: number; similarity: number }[];
    };

    try {
        const { count } = (await pool.query('SELECT count(DISTINCT case_id)::int FROM case_embeddings')).rows[0];
        console.log(`Embedded cases: ${count} | gate ${RET.refuseGate} | sampling ${SAMPLE} embedded cases\n`);

        const { rows: sample } = await pool.query(
            `SELECT c.id, c.case_name FROM cases c
             WHERE c.result IS NOT NULL AND length(c.case_name) > 5
               AND EXISTS (SELECT 1 FROM case_embeddings e WHERE e.case_id = c.id)
             ORDER BY random() LIMIT $1`, [SAMPLE]);

        // Collect per-query top sim + whether the queried case is in the top-5 (recall).
        type Rec = { id: number; name: string; v: 1 | 2; top: number; selfInTop: boolean; selfRank: number };
        const recs: Rec[] = [];
        for (const c of sample) {
            const name = shortName(c.case_name);
            for (const [v, q] of [[1, `Apakah hukuman dalam kes ${name}?`], [2, `Apa yang berlaku dalam kes ${name}?`]] as const) {
                const rows = await topMatch(await embedQ(q));
                const top = rows[0]?.similarity ?? 0;
                const selfRank = rows.findIndex(r => r.case_id === c.id);              // 0-based, -1 if absent
                recs.push({ id: c.id, name, v: v as 1 | 2, top, selfInTop: selfRank >= 0, selfRank });
            }
        }

        // Out-of-DB top sims (for the leak side of the sweep).
        const outTops: number[] = [];
        for (const q of OUT_QUERIES) { const rows = await topMatch(await embedQ(q)); outTops.push(rows[0]?.similarity ?? 0); }

        const classify = (r: Rec, gate: number) => !r.selfInTop ? 'MISS' : (r.top >= gate ? 'GOOD' : 'FALSE-REFUSAL');

        // ---- per-case detail (V1 / V2) ----
        console.log('id     V1top  V1            V2top  V2            case');
        const byId = new Map<number, Rec[]>();
        for (const r of recs) { if (!byId.has(r.id)) byId.set(r.id, []); byId.get(r.id)!.push(r); }
        for (const [id, rs] of byId) {
            const v1 = rs.find(r => r.v === 1)!, v2 = rs.find(r => r.v === 2)!;
            const cell = (r: Rec) => `${r.top.toFixed(3)} ${classify(r, RET.refuseGate).padEnd(13)}`;
            console.log(`${String(id).padStart(4)}   ${cell(v1)} ${cell(v2)} ${v1.name.slice(0, 34)}`);
        }

        // ---- summary at the live gate ----
        const tally = (v: 1 | 2) => {
            const rs = recs.filter(r => r.v === v);
            const g = rs.filter(r => classify(r, RET.refuseGate) === 'GOOD').length;
            const f = rs.filter(r => classify(r, RET.refuseGate) === 'FALSE-REFUSAL').length;
            const m = rs.filter(r => classify(r, RET.refuseGate) === 'MISS').length;
            return { n: rs.length, g, f, m };
        };
        const t1 = tally(1), t2 = tally(2);
        console.log(`\n=== At gate ${RET.refuseGate} (n=${SAMPLE} cases x2 phrasings) ===`);
        console.log(`V1 sentence : GOOD ${t1.g}/${t1.n}  FALSE-REFUSAL ${t1.f}  MISS ${t1.m}`);
        console.log(`V2 narrative: GOOD ${t2.g}/${t2.n}  FALSE-REFUSAL ${t2.f}  MISS ${t2.m}`);
        console.log(`Out-of-DB top sims: ${outTops.map(t => t.toFixed(3)).sort().join(', ')} (max ${Math.max(...outTops).toFixed(3)})`);

        // ---- threshold sweep: recall (of retrievable cases) vs out-of-DB leaks ----
        console.log(`\n=== Threshold sweep ===`);
        console.log(`gate   real-answered(selfInTop & pass)   false-refusal(selfInTop & <gate)   out-leaks`);
        const retrievable = recs.filter(r => r.selfInTop);   // gate can only help/hurt cases actually retrieved
        for (let t = 0.50; t <= 0.64 + 1e-9; t += 0.01) {
            const answered = retrievable.filter(r => r.top >= t).length;
            const falseRef = retrievable.filter(r => r.top < t).length;
            const leaks = outTops.filter(s => s >= t).length;
            const recall = ((answered / retrievable.length) * 100).toFixed(0);
            console.log(`${t.toFixed(2)}   ${String(answered).padStart(3)}/${retrievable.length} (${recall}%)                    ${String(falseRef).padStart(3)}                              ${leaks}/${OUT_QUERIES.length}`);
        }
        const missTotal = recs.filter(r => !r.selfInTop).length;
        console.log(`\nNote: ${missTotal}/${recs.length} queries never retrieved their own case (MISS) — a recall/embedding gap no threshold fixes.`);
    } catch (e: any) {
        console.error('Error:', e.message); if (e.detail) console.error('Detail:', e.detail);
    } finally { await pool.end(); }
}

main();
