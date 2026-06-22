/**
 * Retrieval diagnostic for the on-prem RAG stack. MIRRORS src/app/api/chat/route.ts
 * retrieval exactly — same embed model, match_documents call, refuse gate, distinct-case
 * tagging, and verdict-join lookup — so what prints here is what the LLM would see, or the
 * refusal it would trigger. NO LLM call: this isolates retrieval from generation, which is
 * where most "hallucination" actually originates (thin/empty context).
 *
 *   npx tsx scripts/test-retrieval.ts                  # default labeled suite (gate calibration)
 *   npx tsx scripts/test-retrieval.ts "soalan saya"    # one or more ad-hoc queries
 *
 * Per query it reports:
 *   - GATE verdict (ANSWER / REFUSE vs aiConfig.refuseGate) + margin to the gate
 *   - top-N chunk similarities (rows below the retrieve floor are marked — not sent to the LLM)
 *   - DISTINCT cases covered by those chunks (retrieval diversity)
 *   - whether each distinct case carries an official verdict (the verdict-join source)
 * A summary table flags calibration failures: IN-corpus queries that REFUSE (false refusal)
 * and OUT-of-corpus queries that ANSWER (leak). Probe queries have no expectation — eyeball them.
 */
import dotenv from 'dotenv';
import path from 'path';
import OpenAI from 'openai';
import { Pool } from 'pg';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

type Expect = 'in' | 'out' | 'probe';
const DEFAULT_QUERIES: { label: string; q: string; exp: Expect }[] = [
    { label: 'Wan Mohd Herdy (39B)', exp: 'in', q: 'Di mahkamah mana kes PP lwn Wan Mohd Herdy bin Wan Hamid dibicarakan dan apakah hukumannya?' },
    { label: 'dadah / 39B', exp: 'in', q: 'kes pengedaran dadah di bawah Seksyen 39B' },
    { label: 'bunuh / 302', exp: 'in', q: 'kes bunuh di bawah Seksyen 302 Kanun Keseksaan dan hukumannya' },
    { label: 'penculikan', exp: 'in', q: 'kes penculikan di bawah Akta Penculikan 1961' },
    { label: 'pemerdagangan orang', exp: 'in', q: 'kes pemerdagangan orang dan hukuman yang dijatuhkan' },
    { label: 'seksual kanak-kanak', exp: 'in', q: 'kes kesalahan seksual terhadap kanak-kanak' },
    { label: 'vague "kes dadah"', exp: 'in', q: 'kes dadah' },
    // Comparative/aggregate — the documented weak spot (real cases retrieved thinly, model backfills with statute).
    { label: 'dadah vs Kanun Keseksaan', exp: 'in', q: 'Apakah perbezaan hukuman antara kes dadah berbahaya dan kes di bawah Kanun Keseksaan?' },
    // Probes from the 2026-06-22 eval — is the refusal correct (case absent) or a recall miss (case present)?
    { label: 'NG HOEY CHEN v PP', exp: 'probe', q: 'Apakah hukuman dalam kes NG HOEY CHEN V PP?' },
    { label: 'file-no JB-41H', exp: 'probe', q: 'Apakah hukuman dalam kes JB-41H-10-11/2025?' },
    { label: 'rasuah / SPRM', exp: 'out', q: 'Apakah hukuman bagi kesalahan rasuah di bawah Akta SPRM 2009?' },
    { label: 'cyber hacking', exp: 'out', q: 'hukuman bagi jenayah penggodaman komputer dan akses tanpa kebenaran' },
    { label: 'cukai SST', exp: 'out', q: 'kadar cukai jualan dan perkhidmatan SST bagi restoran' },
    { label: 'nonsense', exp: 'out', q: 'apakah ibu negara Perancis dan cuaca hari ini' },
];

async function main() {
    // dynamic import AFTER dotenv: aiConfig reads OLLAMA_URL/REFUSE_GATE at module-load time
    const { aiConfig } = await import('../src/lib/aiConfig');
    const { embed: EMBED, retrieval: RET } = aiConfig;

    // CLI args (if any) become ad-hoc probe queries; otherwise run the labeled suite.
    const cliQueries = process.argv.slice(2).filter(a => !a.startsWith('--'));
    const queries = cliQueries.length
        ? cliQueries.map((q, i) => ({ label: `CLI #${i + 1}`, q, exp: 'probe' as Expect }))
        : DEFAULT_QUERIES;

    const embedder = new OpenAI({ baseURL: EMBED.baseUrl, apiKey: EMBED.apiKey });
    const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5432/postgres' });

    const summary: { label: string; exp: Expect; top: number; gate: boolean; distinct: number; withVerdict: number }[] = [];
    try {
        const { count } = (await pool.query('SELECT count(DISTINCT case_id)::int FROM case_embeddings')).rows[0];
        console.log(`Embedded cases in DB: ${count}`);
        console.log(`Gate: refuse if top sim < ${RET.refuseGate} | retrieve floor ${RET.retrieveFloor} | top ${RET.matchCount} | model ${EMBED.model}\n`);

        for (const { label, q, exp } of queries) {
            const emb = await embedder.embeddings.create({ model: EMBED.model, input: q });
            const vectorStr = `[${(emb.data[0].embedding as number[]).join(',')}]`;
            // floor 0.0 (not retrieveFloor) so we always SEE how close out-of-DB queries get — vital for tuning.
            const { rows } = await pool.query(`SELECT * FROM match_documents($1,$2,$3,$4)`, [vectorStr, 0.0, RET.matchCount, {}]);

            const top = rows[0]?.similarity ?? 0;
            const refused = !rows.length || top < RET.refuseGate;          // exact route gate logic
            const margin = top - RET.refuseGate;

            // Distinct cases among rows ABOVE the retrieve floor (what the route would actually tag/send).
            const sent = rows.filter((r: any) => r.similarity >= RET.retrieveFloor);
            const distinctIds = [...new Set(sent.map((r: any) => r.case_id))] as number[];
            // Verdict-join: do those cases carry an official result? (sentence questions depend on it.)
            const verdicts = new Map<number, string | null>();
            if (distinctIds.length) {
                const vr = await pool.query(`SELECT id, result FROM cases WHERE id = ANY($1)`, [distinctIds]);
                for (const r of vr.rows) verdicts.set(r.id, r.result);
            }
            const hasVerdict = (id: number) => { const v = verdicts.get(id); return !!v && v.trim() !== '' && v.trim() !== 'Tidak dinyatakan'; };
            const withVerdict = distinctIds.filter(hasVerdict).length;

            const tag = exp === 'in' ? 'IN ' : exp === 'out' ? 'OUT' : 'PRB';
            const verdict = refused ? 'REFUSE' : 'ANSWER';
            console.log(`### [${tag}] ${label}  ->  ${verdict}  (top ${top.toFixed(3)}, margin ${margin >= 0 ? '+' : ''}${margin.toFixed(3)})`);
            console.log(`Q: ${q}`);
            if (!rows.length) { console.log('  (no matches)\n'); summary.push({ label, exp, top, gate: refused, distinct: 0, withVerdict: 0 }); continue; }
            for (const r of rows) {
                const name = (r.content.match(/Case Name:\s*(.+)/)?.[1] || '').slice(0, 42);
                const below = r.similarity < RET.retrieveFloor ? ' (below floor — not sent)' : '';
                const v = hasVerdict(r.case_id) ? '✓verdict' : '·no-verdict';
                console.log(`  sim ${r.similarity.toFixed(3)}  case ${String(r.case_id).padStart(4)}  ${name.padEnd(42)} ${v}${below}`);
            }
            console.log(`  distinct cases sent: ${distinctIds.length}/${sent.length} chunks | with official verdict: ${withVerdict}/${distinctIds.length}\n`);
            summary.push({ label, exp, top, gate: refused, distinct: distinctIds.length, withVerdict });
        }

        // ---- calibration summary ----
        console.log('=== SUMMARY (gate calibration) ===');
        console.log('exp  verdict  top    distinct  verdict-data  query');
        let mismatches = 0;
        for (const s of summary) {
            const v = s.gate ? 'REFUSE' : 'ANSWER';
            let flag = '';
            if (s.exp === 'in' && s.gate) { flag = '  ✗ FALSE REFUSAL'; mismatches++; }
            if (s.exp === 'out' && !s.gate) { flag = '  ✗ LEAK (out-of-DB answered)'; mismatches++; }
            const tag = s.exp === 'in' ? 'IN ' : s.exp === 'out' ? 'OUT' : 'PRB';
            console.log(`${tag}  ${v}  ${s.top.toFixed(3)}   ${String(s.distinct).padStart(2)}/${RET.matchCount}      ${String(s.withVerdict).padStart(2)}/${String(s.distinct).padStart(2)}        ${s.label}${flag}`);
        }
        const ins = summary.filter(s => s.exp === 'in');
        const outs = summary.filter(s => s.exp === 'out');
        const minIn = ins.length ? Math.min(...ins.map(s => s.top)) : NaN;
        const maxOut = outs.length ? Math.max(...outs.map(s => s.top)) : NaN;
        console.log(`\nIN range:  ${ins.length ? Math.min(...ins.map(s => s.top)).toFixed(3) + '–' + Math.max(...ins.map(s => s.top)).toFixed(3) : 'n/a'}`);
        console.log(`OUT range: ${outs.length ? Math.min(...outs.map(s => s.top)).toFixed(3) + '–' + Math.max(...outs.map(s => s.top)).toFixed(3) : 'n/a'}`);
        if (!Number.isNaN(minIn) && !Number.isNaN(maxOut)) {
            const gap = minIn - maxOut;
            console.log(`Gap (min IN - max OUT): ${gap >= 0 ? '+' : ''}${gap.toFixed(3)}  ${gap > 0 ? `(safe; gate ${RET.refuseGate} should sit inside)` : '(OVERLAP — no single gate separates them cleanly)'}`);
        }
        console.log(mismatches ? `\n${mismatches} mismatch(es) flagged above.` : '\nNo gate mismatches.');
    } catch (e: any) {
        console.error('Error:', e.message); if (e.detail) console.error('Detail:', e.detail);
    } finally { await pool.end(); }
}

main();
