/**
 * READ-ONLY focused inspection of the LKK_ case tables in ilims_usr.
 * Describes columns, samples a row (truncated), and surfaces distinct act/section
 * values from LT_LKK_ALLEGATION for categorization. No writes.
 * Run: npx tsx scripts/inspect-lkk.ts
 */
import mysql from 'mysql2/promise';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const TABLES = [
    'LT_LKK_INFO',
    'LT_LKK_ALLEGATION',
    'LT_LKK_PERSON_INVOLVE',
    'LKK_PERSON_RESPONSIBLE',
    'LT_LKK_DOCUMENT',
    'LT_LKK_CATEGORY',
    'LT_LKK_SUBCATEGORY',
];

function trunc(v: any, n = 200): string {
    if (v === null || v === undefined) return String(v);
    const s = typeof v === 'string' ? v : (v instanceof Date ? v.toISOString() : JSON.stringify(v));
    return s.length > n ? s.slice(0, n) + `…(${s.length} chars)` : s;
}

async function main() {
    const conn = await mysql.createConnection({
        host: process.env.MYSQL_HOST!, port: parseInt(process.env.MYSQL_PORT || '3306', 10),
        user: process.env.MYSQL_USER!, password: process.env.MYSQL_PASSWORD!, database: 'ilims_usr',
    });
    console.log('Connected to ilims_usr\n');

    for (const t of TABLES) {
        console.log(`\n${'='.repeat(70)}\n=== ${t} ===`);
        try {
            const [cols] = await conn.query<any[]>(`DESCRIBE \`${t}\``);
            for (const c of cols) console.log(`  ${String(c.Field).padEnd(30)} ${c.Type}${c.Key ? '  [' + c.Key + ']' : ''}${c.Null === 'NO' ? '  NOT NULL' : ''}`);
            const [sample] = await conn.query<any[]>(`SELECT * FROM \`${t}\` LIMIT 1`);
            if (sample[0]) {
                console.log('  --- sample row ---');
                for (const [k, v] of Object.entries(sample[0])) console.log(`    ${k.padEnd(30)} ${trunc(v)}`);
            } else console.log('  (no rows)');
        } catch (e: any) { console.log(`  ERR ${e.code}: ${e.message}`); }
    }

    // Categorization signal from the REAL allegation table
    console.log(`\n${'='.repeat(70)}\n=== LT_LKK_ALLEGATION distinct ACT_DESC (top 50) ===`);
    try {
        const [acts] = await conn.query<any[]>(
            `SELECT LLA_ACT_DESC AS act, COUNT(*) n FROM LT_LKK_ALLEGATION GROUP BY LLA_ACT_DESC ORDER BY n DESC LIMIT 50`);
        for (const a of acts) console.log(`  ${String(a.n).padStart(6)}  ${trunc(a.act, 90)}`);
    } catch (e: any) { console.log(`  ERR (LLA_ACT_DESC?): ${e.message}`); }

    console.log(`\n=== LT_LKK_ALLEGATION distinct LLA_SECTION (top 40) ===`);
    try {
        const [secs] = await conn.query<any[]>(
            `SELECT LLA_SECTION AS sec, COUNT(*) n FROM LT_LKK_ALLEGATION GROUP BY LLA_SECTION ORDER BY n DESC LIMIT 40`);
        for (const s of secs) console.log(`  ${String(s.n).padStart(6)}  ${trunc(s.sec, 70)}`);
    } catch (e: any) { console.log(`  ERR (LLA_SECTION?): ${e.message}`); }

    // How many INFO rows actually carry substantive text (the RAG payload)?
    console.log(`\n=== LT_LKK_INFO content coverage ===`);
    try {
        const [[cov]] = await conn.query<any[]>(`
            SELECT COUNT(*) total,
                   SUM(LKK_CASE_FACT IS NOT NULL AND LKK_CASE_FACT <> '') has_facts,
                   SUM(LKK_GROUNDS_OF_JUDGEMENT IS NOT NULL AND LKK_GROUNDS_OF_JUDGEMENT <> '') has_grounds,
                   SUM(LKK_RESULT IS NOT NULL AND LKK_RESULT <> '') has_result
            FROM LT_LKK_INFO`) as any;
        console.log(`  total=${cov.total} has_facts=${cov.has_facts} has_grounds=${cov.has_grounds} has_result=${cov.has_result}`);
    } catch (e: any) { console.log(`  ERR: ${e.message}`); }

    await conn.end();
    console.log('\nDone (read-only).');
}

main().catch(e => { console.error('ERROR:', e.code || '', e.message); process.exit(1); });
