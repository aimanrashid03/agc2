
import { Pool } from 'pg';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
console.log('CWD:', process.cwd());
console.log('CWD:', process.cwd());
const CONNECTION_STRING = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const pool = new Pool({ connectionString: CONNECTION_STRING });
async function main() {
    try {
        const res = await pool.query('SELECT COUNT(*) FROM cases');
        console.log('Cases count:', res.rows[0].count);
        const resP = await pool.query('SELECT COUNT(*) FROM people');
        console.log('People count:', resP.rows[0].count);
        const resA = await pool.query('SELECT COUNT(*) FROM allegations');
        console.log('Allegations count:', resA.rows[0].count);
        const resE = await pool.query('SELECT COUNT(*) FROM case_embeddings');
        console.log('Embeddings count:', resE.rows[0].count);
    } catch (e) { console.error(e); } finally { await pool.end(); }
}
main();
