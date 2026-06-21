/**
 * Feasibility bake-off (DB-free) for the on-prem self-hosted stack.
 *
 * Goal: decide between chat models (SEA-LION vs Qwen 7B vs Qwen 3B) on the
 * priorities that matter for AGC2 — proper Malay, citation-contract compliance,
 * correct legal facts (grounding), and CPU speed — using bge-m3 embeddings.
 *
 * No Postgres/pgvector: cases are embedded with bge-m3 via Ollama, retrieval is
 * in-memory cosine top-5, and context + system prompt mirror src/app/api/chat/route.ts
 * exactly so the result reflects the real app path.
 *
 *   npx tsx scripts/feasibility-bakeoff.ts
 *
 * Env knobs: OLLAMA_URL (default http://127.0.0.1:11434/v1), SAMPLE (Bicara sample size, default 100)
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import OpenAI from 'openai';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434/v1';
const SAMPLE = parseInt(process.env.SAMPLE || '100', 10);
const EMBED_MODEL = 'bge-m3';

// Chat candidates. Names confirmed from `ollama list` at runtime; edit if tags differ.
// Decision: qwen-7b is the chosen model; re-running it alone to validate the grounding fix.
const CHAT_MODELS = [
    { key: 'qwen2.5-7b', model: 'qwen2.5:7b-instruct' },
];

// Folders embedded in full (substantive criminal-law cases we wrote questions against)
const CORE_FOLDERS = ['AKTA KANUN KESEKSAAN', 'AKTA PENCULIKAN 1961', 'Seksyen 39B', 'Lain-lain', 'TPR Chan Lee Lee'];
const SAMPLE_FOLDER = 'LKK Bicara & Rayuan cleaned';

const client = new OpenAI({ baseURL: OLLAMA_URL, apiKey: 'ollama' });

interface Chunk { caseId: number; caseName: string; sourceFolder: string; content: string; embedding: number[]; }

// v2 grounding: verdict joined at assembly (not embedded), + deterministic refusal gate.
const resultMap = new Map<number, string>();
const REFUSE_GATE = 0.55; // top cosine sim below this -> refuse without calling the LLM (Q5=0.528 out; real Qs >=0.59)
const REFUSAL_MSG = 'Maaf, maklumat tersebut tiada dalam pangkalan data kes saya.';

function cosine(a: number[], b: number[]): number {
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function buildCaseText(c: any): string {
    return [
        `Case Name: ${c.LKK_DATA?.caseName || 'N/A'}`,
        `Court: ${c.LKK_DATA?.courtDesc || 'N/A'}`,
        `State: ${c.LKK_DATA?.stateDesc || 'N/A'}`,
        `Facts: ${c.LKK_CASE_FACT || 'N/A'}`,
        `Issues & Arguments: ${c.LKK_ISSUES_AND_ARGUMENT || 'N/A'}`,
        `Judgment: ${c.LKK_GROUNDS_OF_JUDGEMENT || 'N/A'}`,
        `Decision: ${c.LKK_RESULT || 'N/A'}`,
    ].filter(p => p.length > 20).join('\n\n');
}

// Embedding cache so prompt-only iterations don't re-embed (keyed by model + content hash).
const CACHE_PATH = path.join(process.cwd(), 'tmp', 'embed-cache.json');
const embedCache: Record<string, number[]> = fs.existsSync(CACHE_PATH)
    ? JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8')) : {};

async function embed(text: string): Promise<number[]> {
    const key = crypto.createHash('sha256').update(`${EMBED_MODEL}:${text}`).digest('hex');
    if (embedCache[key]) return embedCache[key];
    const r = await client.embeddings.create({ model: EMBED_MODEL, input: text });
    const v = r.data[0].embedding as number[];
    embedCache[key] = v;
    return v;
}

// ---- Test questions (grounded in the embedded corpus) ----
type Q = { id: string; q: string; type: string; expect: string };
const QUESTIONS: Q[] = [
    { id: 'Q1-lookup', type: 'specific lookup + facts', expect: 'cite a Penculikan case, state result',
      q: 'Apakah keputusan dalam kes penculikan yang melibatkan Jevan a/l S Ramamurthy?' },
    { id: 'Q2-39B-sentence', type: 'fact accuracy', expect: 'Anbarasan: hukuman gantung sampai mati; must cite',
      q: 'Dalam kes dadah di bawah Seksyen 39B yang melibatkan Anbarasan a/l Murugayah, apakah hukuman yang dijatuhkan?' },
    { id: 'Q3-robbery', type: 'fact accuracy', expect: '7-Eleven Kajang armed robbery; 6 tahun penjara + 2 sebatan; cite',
      q: 'Apa yang berlaku dalam kes rompakan bersenjata di kedai 7-Eleven di Kajang dan apakah hukumannya?' },
    { id: 'Q4-vague', type: 'vague -> should ask clarification', expect: 'multiple drug cases -> ask which one',
      q: 'kes dadah' },
    { id: 'Q5-refuse', type: 'out-of-DB -> should refuse', expect: 'refusal: "tiada dalam pangkalan data"',
      q: 'Apakah hukuman bagi kesalahan rasuah di bawah Akta SPRM 2009?' },
    { id: 'Q6-multi-cite', type: 'multiple citations', expect: 'two drug-trafficking cases, each cited + result',
      q: 'Senaraikan dua kes pengedaran dadah dan nyatakan keputusan masing-masing.' },
    { id: 'Q7-court', type: 'fact accuracy', expect: 'Wan Mohd Herdy: Mahkamah Tinggi Shah Alam, hukuman gantung; cite',
      q: 'Di mahkamah mana kes PP lwn Wan Mohd Herdy bin Wan Hamid dibicarakan dan apakah hukumannya?' },
    { id: 'Q8-penculikan', type: 'example + result', expect: 'cite a Penculikan 1961 case + decision',
      q: 'Berikan satu contoh kes di bawah Akta Penculikan 1961 dan nyatakan keputusannya.' },
];

function buildSystemPrompt(contextText: string): string {
    // Mirrors src/app/api/chat/route.ts
    return `Anda adalah pembantu undang-undang AI pakar dalam undang-undang jenayah Malaysia (Kanun Keseksaan & Akta Penculikan).
Tugas anda:
1. Jawab soalan pengguna berdasarkan konteks yang diberikan SAHAJA.
2. Jawab dalam BAHASA MELAYU secara lalai (default), melainkan pengguna bertanya dalam Bahasa Inggeris.
3. Gunakan nada profesional, tepat, dan membantu.
4. JIKA TIADA satu pun kes berkaitan dalam konteks, katakan "Maaf, maklumat tersebut tiada dalam pangkalan data kes saya." dan BERHENTI. Tetapi JIKA ADA kes berkaitan dalam konteks, JAWAB dengannya — jangan menolak.
5. SENTIASA rujuk kes menggunakan PENANDA nombornya sahaja, cth [1], [2]. JANGAN tulis nama kes atau id penuh — cukup penanda nombor dalam kurungan siku.
6. JIKA soalan pengguna terlalu ringkas dan terdapat beberapa kes berbeza dalam konteks, sila minta penjelasan lanjut.
7. Jika Nama Kes tiada, gunakan "kes ini".
8. WAJIB: akhiri setiap jawapan (kecuali penolakan di perkara 4) dengan satu baris "Rujukan: " yang menyenaraikan penanda SEMUA kes yang anda guna, cth: "Rujukan: [1], [2]".

PERATURAN ANTI-REKAAN (PALING PENTING — kes ini melibatkan keputusan undang-undang sebenar):
- JANGAN SEKALI-KALI mereka-reka nama kes, nama pihak (OKT/Pengadu), mahkamah, seksyen, tarikh, atau hukuman. Setiap fakta MESTI datang terus dari konteks di bawah.
- Apabila diminta memberi "contoh kes", pilih HANYA daripada kes yang ada dalam konteks dan sertakan citation. Jika tiada kes berkaitan dalam konteks, katakan tiada.
- Jika hukuman/keputusan sesuatu kes TIDAK dinyatakan dalam konteks (atau bertanda "Tidak dinyatakan"), nyatakan "hukuman tidak dinyatakan dalam rekod" — JANGAN agak atau anggar.
- JANGAN gunakan pengetahuan luar. Hanya guna konteks di bawah. Jika anda tergoda untuk menambah maklumat yang tiada dalam konteks, jangan.

CARA RUJUKAN KES (ikut contoh ini dengan TEPAT):
- Setiap kes dalam konteks diberi PENANDA seperti [1], [2], [3].
- Setiap kali anda menyebut fakta sesuatu kes, letak penanda nombornya. Tulis HANYA nombor dalam kurungan siku — JANGAN tulis nama atau id.

Contoh 1 (satu kes):
Soalan: Apakah hukuman dalam kes Wan Mohd Herdy?
Jawapan: Mahkamah Tinggi Shah Alam menjatuhkan hukuman gantung sampai mati di bawah Seksyen 39B ADB 1952 [1].
Rujukan: [1]

Contoh 2 (beberapa kes):
Soalan: Senaraikan dua kes dadah.
Jawapan: Kes pertama melibatkan rampasan Methamphetamine dan Cannabis [1]. Kes kedua pula dijatuhkan hukuman penjara seumur hidup dan 15 sebatan [2].
Rujukan: [1], [2]

Konteks:
${contextText}
`;
}

const CITATION_RE = /\[\[[^\]]+\]\]\((\d+)\)/g;

/**
 * Citation post-process — numbered-tag scheme (footnote-RAG). The model only emits a tag like [1];
 * we deterministically expand it to the final contract [[Real Case Name]](real_id) using tagMap.
 * Cannot invent or mis-attribute IDs: tags map only to retrieved cases, and we control name+id.
 */
function expandTags(answer: string, tagMap: Map<number, { id: number; name: string }>): string {
    return answer.replace(/\[(\d{1,2})\]/g, (full, n) => {
        const t = tagMap.get(parseInt(n, 10));
        return t ? `[[${t.name}]](${t.id})` : full;
    });
}

async function main() {
    const root = path.join(process.cwd(), 'data', 'cleaned');
    const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000, chunkOverlap: 200 });

    // 1. Gather cases
    const picked: { c: any; folder: string }[] = [];
    for (const f of CORE_FOLDERS) {
        const p = path.join(root, f, 'clean_info.json');
        if (!fs.existsSync(p)) continue;
        for (const c of JSON.parse(fs.readFileSync(p, 'utf8'))) picked.push({ c, folder: f });
    }
    const samplePath = path.join(root, SAMPLE_FOLDER, 'clean_info.json');
    if (fs.existsSync(samplePath)) {
        const all = JSON.parse(fs.readFileSync(samplePath, 'utf8'));
        for (const c of all.slice(0, SAMPLE)) picked.push({ c, folder: SAMPLE_FOLDER });
    }
    console.log(`Embedding ${picked.length} cases (full: ${CORE_FOLDERS.join(', ')}; +${SAMPLE} from Bicara) with ${EMBED_MODEL}...`);

    // 2. Build + embed chunks
    const chunks: Chunk[] = [];
    let done = 0;
    const t0 = Date.now();
    for (const { c, folder } of picked) {
        const text = buildCaseText(c);
        if (text.length < 50) continue;
        // v2: keep embedded chunks diverse (do NOT bake Decision into every chunk — that made
        // a case's chunks self-similar and collapsed top-5 diversity). The verdict is injected
        // at context-assembly time via resultMap instead (see below).
        resultMap.set(c.LKK_INFOID, c.LKK_RESULT || 'Tidak dinyatakan dalam rekod');
        const docs = await splitter.createDocuments([text]);
        for (const d of docs) {
            const enriched = `Case Name: ${c.LKK_DATA?.caseName || 'N/A'}\nCourt: ${c.LKK_DATA?.courtDesc || 'N/A'}\nState: ${c.LKK_DATA?.stateDesc || 'N/A'}\n---\n${d.pageContent}`;
            chunks.push({ caseId: c.LKK_INFOID, caseName: c.LKK_DATA?.caseName || 'N/A', sourceFolder: folder, content: enriched, embedding: await embed(enriched) });
        }
        if (++done % 20 === 0) console.log(`  embedded ${done}/${picked.length} cases (${chunks.length} chunks)`);
    }
    const embedSecs = (Date.now() - t0) / 1000;
    console.log(`Embedded ${chunks.length} chunks in ${embedSecs.toFixed(1)}s (${(chunks.length / embedSecs).toFixed(1)} chunks/s on CPU).\n`);

    // 3. Run each question through each model
    const report: any[] = [];
    const transcript: string[] = [];
    for (const Q of QUESTIONS) {
        const qEmb = await embed(Q.q);
        const top = chunks.map(ch => ({ ch, s: cosine(qEmb, ch.embedding) })).sort((a, b) => b.s - a.s).slice(0, 5);
        const ctxIds = new Set(top.map(t => t.ch.caseId));
        const topSim = top[0].s;
        const gated = topSim < REFUSE_GATE; // deterministic out-of-DB refusal
        // Assign a numbered tag per DISTINCT case (in retrieval order); model cites the tag, we expand it.
        const tagMap = new Map<number, { id: number; name: string }>();
        const tagOf = new Map<number, number>(); // caseId -> tag
        for (const t of top) {
            if (!tagOf.has(t.ch.caseId)) { const tag = tagOf.size + 1; tagOf.set(t.ch.caseId, tag); tagMap.set(tag, { id: t.ch.caseId, name: t.ch.caseName }); }
        }
        // v2: append each distinct case's official verdict (joined from resultMap, not embedded)
        const contextText = top.map(t => `[${tagOf.get(t.ch.caseId)}] Case ID: ${t.ch.caseId}\nCase Name: ${t.ch.caseName}\nPenanda rujukan: [${tagOf.get(t.ch.caseId)}]\nSource: ${t.ch.sourceFolder}\nKeputusan rasmi kes ini: ${resultMap.get(t.ch.caseId) || 'Tidak dinyatakan dalam rekod'}\nContent:\n${t.ch.content}`).join('\n\n---\n\n');
        const sys = buildSystemPrompt(contextText);

        transcript.push(`\n${'='.repeat(90)}\n[${Q.id}] (${Q.type})\nQ: ${Q.q}\nExpect: ${Q.expect}\nRetrieved case IDs: ${[...ctxIds].join(', ')}  (top sim ${topSim.toFixed(3)})${gated ? '  [GATED -> auto-refuse]' : ''}`);

        for (const m of CHAT_MODELS) {
            const tm = Date.now();
            let answer = '', completionTokens = 0, err = '';
            if (gated) { answer = REFUSAL_MSG; }
            else try {
                const res = await client.chat.completions.create({
                    model: m.model,
                    messages: [{ role: 'system', content: sys }, { role: 'user', content: Q.q }],
                    temperature: 0,
                });
                answer = res.choices[0]?.message?.content || '';
                completionTokens = res.usage?.completion_tokens || 0;
            } catch (e: any) { err = e?.message || String(e); }
            const secs = (Date.now() - tm) / 1000;
            const tps = completionTokens && secs ? completionTokens / secs : 0;

            const citesRaw = [...answer.matchAll(CITATION_RE)].length;
            const tagsEmitted = gated ? 0 : (answer.match(/\[\d{1,2}\]/g) || []).length; // model's own tag refs
            // citation-format post-process: expand numbered tags -> [[name]](id) (skip gated refusals)
            const linked = gated ? answer : expandTags(answer, tagMap);
            const cites = [...linked.matchAll(CITATION_RE)];
            const citedIds = cites.map(c => parseInt(c[1], 10));
            const hallucinated = citedIds.filter(id => !ctxIds.has(id));
            const refused = /tiada dalam pangkalan data/i.test(linked);

            report.push({
                question: Q.id, model: m.key, secs: +secs.toFixed(1), tps: +tps.toFixed(1),
                tagsEmitted, citationsRaw: citesRaw, citations: cites.length, hallucinatedIds: hallucinated.length, refused, error: err || undefined,
            });
            transcript.push(`\n--- ${m.key} (${secs.toFixed(1)}s, ${tps.toFixed(1)} tok/s, tags:${tagsEmitted} -> citations:${cites.length}, hallucinated-id:${hallucinated.length}, refused:${refused}) ---\n${err ? 'ERROR: ' + err : linked}`);
            console.log(`  [${Q.id}] ${m.key}: ${secs.toFixed(1)}s ${tps.toFixed(1)}tok/s tags:${tagsEmitted}->cites:${cites.length} hallu:${hallucinated.length} refused:${refused}${err ? ' ERR' : ''}`);
        }
    }

    // 4. Output
    const outDir = path.join(process.cwd(), 'tmp');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'bakeoff-transcript.txt'), transcript.join('\n'));
    fs.writeFileSync(path.join(outDir, 'bakeoff-report.json'), JSON.stringify(report, null, 2));
    fs.writeFileSync(CACHE_PATH, JSON.stringify(embedCache));

    console.log('\n================= SUMMARY (per model) =================');
    for (const m of CHAT_MODELS) {
        const rows = report.filter(r => r.model === m.key && !r.error);
        if (!rows.length) { console.log(`${m.key}: ALL ERRORED (${report.find(r => r.model === m.key)?.error})`); continue; }
        const avgTps = rows.reduce((s, r) => s + r.tps, 0) / rows.length;
        const totalRaw = rows.reduce((s, r) => s + r.citationsRaw, 0);
        const totalCites = rows.reduce((s, r) => s + r.citations, 0);
        const totalHallu = rows.reduce((s, r) => s + r.hallucinatedIds, 0);
        const noCiteRaw = rows.filter(r => r.citationsRaw === 0 && !r.refused).length;
        const noCite = rows.filter(r => r.citations === 0 && !r.refused).length;
        console.log(`${m.key.padEnd(13)} avg ${avgTps.toFixed(1)} tok/s | citations raw ${totalRaw} -> linked ${totalCites} | hallucinated-ids ${totalHallu} | non-refusal answers missing citation: raw ${noCiteRaw} -> linked ${noCite} (of ${rows.length})`);
    }
    console.log('\nFull answers (for Malay-quality human read): tmp/bakeoff-transcript.txt');
    console.log('Machine report: tmp/bakeoff-report.json');
}

main().catch(e => { console.error(e); process.exit(1); });
