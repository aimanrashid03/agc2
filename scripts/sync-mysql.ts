/**
 * MySQL -> Postgres sync (on-prem migration). Reads the LKK_ case tables straight
 * from the client's ilims_usr MySQL, cleans them (HTML strip + entity unescape),
 * triages junk/test rows, derives Act categorization, and upserts into the local
 * pgvector Postgres (cases/people/allegations). Replaces the old SQL-dump ->
 * clean_legal_data.py -> seed-data.ts path for the live data source.
 *
 *   npx tsx scripts/sync-mysql.ts            # full load (all cases)
 *   npx tsx scripts/sync-mysql.ts --limit 200   # subset for fast iteration
 *   npx tsx scripts/sync-mysql.ts --dry         # report only, no writes
 *
 * Idempotent: cases upsert on (source_id, source_folder); people/allegations on
 * (case_id, source_id). content_hash is stored so ingest can skip unchanged cases.
 * Does NOT generate embeddings — run scripts/ingest-data.ts afterwards.
 */
import mysql from 'mysql2/promise';
import { Pool } from 'pg';
import crypto from 'crypto';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const PG_CONN = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5432/postgres';
const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const LIMIT = (() => { const i = args.indexOf('--limit'); return i >= 0 ? parseInt(args[i + 1], 10) : 0; })();
// Triage: drop a case whose COMBINED cleaned substantive text (facts+grounds+result+issues) is
// below this. Catches placeholder/dummy rows (e.g. facts="OK", result="-") while keeping real
// appeals that have a short facts field but a substantive result/grounds.
const MIN_SUBSTANTIVE = 30;

// ---------- cleaning (ported from scripts/clean_legal_data.py clean_text) ----------
const NAMED_ENTITIES: Record<string, string> = {
    nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'",
    ndash: '-', mdash: '-', hellip: '…', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', middot: '·',
};
function unescapeEntities(s: string): string {
    return s
        .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
        .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
        .replace(/&([a-zA-Z]+|#\d+);/g, (m, name) => (name in NAMED_ENTITIES ? NAMED_ENTITIES[name] : m));
}
function clean(text: any): string | null {
    if (text === null || text === undefined) return null;
    if (typeof text !== 'string') return text;
    if (!text.trim()) return null;
    let t = text.replace(/<[^>]+>/g, ' '); // strip HTML tags
    t = unescapeEntities(t);               // unescape entities (&nbsp; &amp; &#8217; ...)
    t = t.replace(/\\n/g, ' ');            // literal backslash-n from dumps
    t = t.replace(/\x02/g, '-');           // STX control char stands in for hyphen in this data
    t = t.replace(/\s+/g, ' ').trim();     // normalize whitespace
    return t || null;
}

// Drop leaked dropdown placeholders ("Sila pilih..", "-", "N/A", "Tiada") that aren't real
// values. Applied to court_desc/state_desc, which default to "Sila pilih.." when left unfilled
// in ILIMS (and which also feed buildCaseText, so this keeps them out of the embeddings too).
function denull(v: string | null): string | null {
    if (v === null) return null;
    const t = v.trim().toLowerCase();
    if (!t || t === '-' || t === 'n/a' || t === 'na' || t === 'tiada' || t.startsWith('sila pilih')) return null;
    return v;
}

function parseDate(d: any): string | null {
    if (!d) return null;
    const s = String(d);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);        // YYYY-MM-DD[...]
    const p = s.split('/');
    if (p.length === 3) return `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`; // DD/MM/YYYY
    return null;
}

// ---------- categorization ----------
// Fold amendment acts into their parent and bucket the long tail by its own act name.
function canonicalAct(actDesc: string): string {
    const a = actDesc.toUpperCase();
    if (a.includes('DADAH BERBAHAYA')) return 'AKTA DADAH BERBAHAYA 1952';
    if (a.includes('KANUN KESEKSAAN')) return 'KANUN KESEKSAAN';
    if (a.includes('PENCULIKAN')) return 'AKTA PENCULIKAN 1961';
    if (a.includes('ANTIPEMERDAGANGAN ORANG')) return 'AKTA ANTIPEMERDAGANGAN ORANG 2007';
    if (a.includes('SEKSUAL TERHADAP KANAK')) return 'AKTA KESALAHAN SEKSUAL KANAK-KANAK 2017';
    if (a.includes('KANAK-KANAK 2001')) return 'AKTA KANAK-KANAK 2001';
    if (a.includes('SENJATA API')) return 'AKTA SENJATA API 1971';
    if (a.includes('SENJATA')) return 'AKTA SENJATA 1960';
    return actDesc.replace(/^[A-Za-z]?\d+\s*\//, '').trim() || 'Lain-lain'; // strip "{id}/" prefix
}
// Primary Act = most serious charge. Lower index = more serious; unranked acts fall to the end.
const SEVERITY = [
    'AKTA DADAH BERBAHAYA 1952',
    'AKTA ANTIPEMERDAGANGAN ORANG 2007',
    'KANUN KESEKSAAN',
    'AKTA KESALAHAN SEKSUAL KANAK-KANAK 2017',
    'AKTA PENCULIKAN 1961',
    'AKTA SENJATA API 1971',
    'AKTA SENJATA 1960',
    'AKTA KANAK-KANAK 2001',
];
function primaryAct(cats: string[]): string {
    if (!cats.length) return 'Lain-lain';
    const rank = (c: string) => { const i = SEVERITY.indexOf(c); return i === -1 ? 999 : i; };
    return [...cats].sort((x, y) => rank(x) - rank(y))[0];
}

// ---------- embed-source text + hash (mirrors ingest-data.ts buildCaseText) ----------
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
const hash = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

async function main() {
    console.log(`MySQL -> Postgres sync${DRY ? ' (DRY RUN)' : ''}${LIMIT ? ` (limit ${LIMIT})` : ''}`);
    const my = await mysql.createConnection({
        host: process.env.MYSQL_HOST!, port: parseInt(process.env.MYSQL_PORT || '3306', 10),
        user: process.env.MYSQL_USER!, password: process.env.MYSQL_PASSWORD!,
        database: process.env.MYSQL_DATABASE || 'ilims_usr', dateStrings: true,
    });
    const pg = new Pool({ connectionString: PG_CONN });

    // 1. Pull source tables
    const [infoRows] = await my.query<any[]>('SELECT * FROM LT_LKK_INFO');
    const [allegRows] = await my.query<any[]>('SELECT * FROM LT_LKK_ALLEGATION');
    const [peopleRows] = await my.query<any[]>('SELECT * FROM LT_LKK_PERSON_INVOLVE');
    await my.end();
    console.log(`Pulled: ${infoRows.length} cases, ${allegRows.length} allegations, ${peopleRows.length} people`);

    // group children by case id
    const allegByCase = new Map<number, any[]>();
    for (const a of allegRows) {
        const k = Number(a.LKK_INFOID);
        if (!allegByCase.has(k)) allegByCase.set(k, []);
        allegByCase.get(k)!.push(a);
    }
    const peopleByCase = new Map<number, any[]>();
    for (const p of peopleRows) {
        const k = Number(p.LKK_INFOID);
        if (!peopleByCase.has(k)) peopleByCase.set(k, []);
        peopleByCase.get(k)!.push(p);
    }

    let cases = infoRows;
    if (LIMIT) cases = cases.slice(0, LIMIT);

    const stats = { inserted: 0, skippedEmpty: 0, peopleIns: 0, allegIns: 0 };
    const catDist = new Map<string, number>();
    const skippedSamples: string[] = [];

    for (const r of cases) {
        const data = r.LKK_DATA || {};
        const c = {
            source_id: Number(r.LKK_INFOID),
            file_no: clean(r.LKK_FILE_NO),
            status: clean(r.LKK_STATUS),
            case_name: clean(data.caseName),
            court_desc: denull(clean(data.courtDesc)),
            state_desc: denull(clean(data.stateDesc)),
            file_open_date: parseDate(data.fileOpenDate),
            result: clean(r.LKK_RESULT),
            result_date: parseDate(r.LKK_RESULT_DATE),
            appeal_date: parseDate(r.LKK_FINAL_DATE_FOR_APPEAL),
            grounds_of_judgement: clean(r.LKK_GROUNDS_OF_JUDGEMENT),
            case_facts: clean(r.LKK_CASE_FACT),
            issues_and_arguments: clean(r.LKK_ISSUES_AND_ARGUMENT),
            dpp_suggestion: clean(r.LKK_DPP_SUGGESTION),
            dsp_suggestion: clean(r.LKK_DSP_SUGGESTION),
        };

        // triage: skip cases with too little substantive RAG text (empty OR placeholder/dummy)
        const substantiveLen = (c.case_facts?.length || 0) + (c.grounds_of_judgement?.length || 0)
            + (c.result?.length || 0) + (c.issues_and_arguments?.length || 0);
        if (substantiveLen < MIN_SUBSTANTIVE) {
            stats.skippedEmpty++;
            if (skippedSamples.length < 20) skippedSamples.push(`${c.source_id}(${substantiveLen}c)`);
            continue;
        }

        // categorization from this case's allegations
        const myAllegs = allegByCase.get(c.source_id) || [];
        const cats = [...new Set(myAllegs.map(a => clean(a.LLA_ACT_DESC)).filter(Boolean).map(d => canonicalAct(d as string)))];
        const sourceFolder = primaryAct(cats);
        const actTags = cats.length ? cats.sort() : [];
        catDist.set(sourceFolder, (catDist.get(sourceFolder) || 0) + 1);

        const contentHash = hash(buildCaseText(c));

        if (DRY) { stats.inserted++; continue; }

        // upsert case
        const ins = await pg.query(`
            INSERT INTO cases (source_id, source_folder, file_no, status, case_name, court_desc, state_desc,
                file_open_date, result, result_date, appeal_date, grounds_of_judgement, case_facts,
                issues_and_arguments, dpp_suggestion, dsp_suggestion, raw_data, content_hash, act_tags)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
            ON CONFLICT (source_id, source_folder) DO UPDATE SET
                file_no=EXCLUDED.file_no, status=EXCLUDED.status, case_name=EXCLUDED.case_name,
                court_desc=EXCLUDED.court_desc, state_desc=EXCLUDED.state_desc, file_open_date=EXCLUDED.file_open_date,
                result=EXCLUDED.result, result_date=EXCLUDED.result_date, appeal_date=EXCLUDED.appeal_date,
                grounds_of_judgement=EXCLUDED.grounds_of_judgement, case_facts=EXCLUDED.case_facts,
                issues_and_arguments=EXCLUDED.issues_and_arguments, dpp_suggestion=EXCLUDED.dpp_suggestion,
                dsp_suggestion=EXCLUDED.dsp_suggestion, raw_data=EXCLUDED.raw_data, content_hash=EXCLUDED.content_hash,
                act_tags=EXCLUDED.act_tags, updated_at=NOW()
            RETURNING id`,
            [c.source_id, sourceFolder, c.file_no, c.status, c.case_name, c.court_desc, c.state_desc,
             c.file_open_date, c.result, c.result_date, c.appeal_date, c.grounds_of_judgement, c.case_facts,
             c.issues_and_arguments, c.dpp_suggestion, c.dsp_suggestion, JSON.stringify(r), contentHash, actTags]);
        const caseDbId = ins.rows[0].id;
        stats.inserted++;

        // people
        for (const p of peopleByCase.get(c.source_id) || []) {
            const d = p.LTL_DATA || {};
            const name = clean(d.namaPihak) || clean(d.namaPerayuResponden) || 'Unknown';
            const res = await pg.query(`
                INSERT INTO people (case_id, source_id, role, category, name, id_no, email, phone, address, raw_data)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
                ON CONFLICT (case_id, source_id) DO NOTHING`,
                [caseDbId, Number(p.LTL_PERSON_ID), clean(d.peranan), clean(d.category), name,
                 clean(d.noKP), clean(d.emailPerayuResponden), clean(d.noPhonePerayuResponden),
                 clean(d.officeAddressO), JSON.stringify(p)]);
            stats.peopleIns += res.rowCount || 0;
        }

        // allegations
        for (const a of myAllegs) {
            const res = await pg.query(`
                INSERT INTO allegations (case_id, source_id, type, section, act_desc, charge_notes, okt_name, charge_created_date, raw_data)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
                ON CONFLICT (case_id, source_id) DO NOTHING`,
                [caseDbId, Number(a.LLA_ALLEGATION_ID), clean(a.LLA_TYPE), clean(a.LLA_SECTION),
                 clean(a.LLA_ACT_DESC), clean(a.LLA_CHARGE_NOTES), clean(a.LLA_OKT_NAME),
                 a.CREATEDDATE || null, JSON.stringify(a)]);
            stats.allegIns += res.rowCount || 0;
        }

        if (stats.inserted % 250 === 0) console.log(`  ...${stats.inserted} cases`);
    }

    await pg.end();

    console.log(`\n=== SUMMARY${DRY ? ' (DRY)' : ''} ===`);
    console.log(`cases inserted/updated: ${stats.inserted}`);
    console.log(`cases skipped (no substantive text): ${stats.skippedEmpty}${skippedSamples.length ? ' e.g. source_id ' + skippedSamples.join(', ') : ''}`);
    console.log(`people inserted: ${stats.peopleIns} | allegations inserted: ${stats.allegIns}`);
    console.log(`\nPrimary-Act (source_folder) distribution:`);
    for (const [k, v] of [...catDist.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(5)}  ${k}`);
    console.log('\nDone.');
}

main().catch(e => { console.error('SYNC ERROR:', e); process.exit(1); });
