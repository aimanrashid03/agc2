/**
 * READ-ONLY MySQL inspection for the on-prem migration.
 * Discovers the database, lists tables + row counts, describes the LKK_ tables,
 * and surfaces the distinct act/section values that will drive categorization.
 * No writes. Run: npx tsx scripts/inspect-mysql.ts
 */
import mysql from 'mysql2/promise';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const HOST = process.env.MYSQL_HOST!;
const PORT = parseInt(process.env.MYSQL_PORT || '3306', 10);
const USER = process.env.MYSQL_USER!;
const PASSWORD = process.env.MYSQL_PASSWORD!;
const DB = process.env.MYSQL_DATABASE || undefined; // may be empty -> discover

function trunc(v: any, n = 120): string {
    if (v === null || v === undefined) return String(v);
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    return s.length > n ? s.slice(0, n) + `…(${s.length} chars)` : s;
}

async function main() {
    const conn = await mysql.createConnection({ host: HOST, port: PORT, user: USER, password: PASSWORD, database: DB });
    console.log(`Connected to ${HOST}:${PORT}${DB ? '/' + DB : ' (no db selected)'}\n`);

    // 1. Databases
    const [dbs] = await conn.query<any[]>('SHOW DATABASES');
    console.log('=== DATABASES ===');
    console.log(dbs.map(r => Object.values(r)[0]).join(', '), '\n');

    // Pick a working db: env one, else first non-system db
    const sysDbs = new Set(['information_schema', 'performance_schema', 'mysql', 'sys']);
    const candidate = DB || dbs.map(r => String(Object.values(r)[0])).find(d => !sysDbs.has(d));
    if (!candidate) { console.log('No user database found.'); await conn.end(); return; }
    await conn.changeUser({ database: candidate });
    console.log(`>>> Using database: ${candidate}\n`);

    // 2. Tables + row counts
    const [tables] = await conn.query<any[]>('SHOW TABLES');
    const tableNames = tables.map(r => String(Object.values(r)[0]));
    console.log('=== TABLES (row counts) ===');
    for (const t of tableNames) {
        try {
            const [c] = await conn.query<any[]>(`SELECT COUNT(*) AS n FROM \`${t}\``);
            console.log(`  ${t.padEnd(40)} ${c[0].n}`);
        } catch (e: any) { console.log(`  ${t.padEnd(40)} ERR ${e.code}`); }
    }
    console.log('');

    // 3. Describe LKK_-ish tables + one sample row each
    const lkkTables = tableNames.filter(t => /LKK|ALLEGATION|PERSON|INFO/i.test(t));
    for (const t of lkkTables) {
        console.log(`=== DESCRIBE ${t} ===`);
        const [cols] = await conn.query<any[]>(`DESCRIBE \`${t}\``);
        for (const col of cols) console.log(`  ${String(col.Field).padEnd(28)} ${col.Type}${col.Key ? '  [' + col.Key + ']' : ''}`);
        try {
            const [sample] = await conn.query<any[]>(`SELECT * FROM \`${t}\` LIMIT 1`);
            if (sample[0]) {
                console.log(`  --- sample row ---`);
                for (const [k, v] of Object.entries(sample[0])) console.log(`    ${k.padEnd(28)} ${trunc(v)}`);
            }
        } catch { /* ignore */ }
        console.log('');
    }

    // 4. Distinct act/section values (categorization signal) — try common allegation tables/cols
    const allegTable = tableNames.find(t => /ALLEGATION/i.test(t));
    if (allegTable) {
        const [cols] = await conn.query<any[]>(`DESCRIBE \`${allegTable}\``);
        const colNames = cols.map(c => String(c.Field));
        const actCol = colNames.find(c => /ACT_DESC|ACT|AKTA/i.test(c));
        const secCol = colNames.find(c => /SECTION|SEKSYEN/i.test(c));
        if (actCol) {
            console.log(`=== DISTINCT ${allegTable}.${actCol} (top 40 by count) ===`);
            const [acts] = await conn.query<any[]>(
                `SELECT \`${actCol}\` AS act, COUNT(*) AS n FROM \`${allegTable}\` GROUP BY \`${actCol}\` ORDER BY n DESC LIMIT 40`);
            for (const a of acts) console.log(`  ${String(a.n).padStart(6)}  ${trunc(a.act, 80)}`);
            console.log('');
        }
        if (secCol) {
            console.log(`=== DISTINCT ${allegTable}.${secCol} (top 30 by count) ===`);
            const [secs] = await conn.query<any[]>(
                `SELECT \`${secCol}\` AS sec, COUNT(*) AS n FROM \`${allegTable}\` GROUP BY \`${secCol}\` ORDER BY n DESC LIMIT 30`);
            for (const s of secs) console.log(`  ${String(s.n).padStart(6)}  ${trunc(s.sec, 60)}`);
            console.log('');
        }
    }

    await conn.end();
    console.log('Done (read-only).');
}

main().catch(e => { console.error('INSPECT ERROR:', e.code || '', e.message); process.exit(1); });
