
import { Pool } from 'pg';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
const CONNECTION_STRING = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
async function main() {
    const pool = new Pool({ connectionString: CONNECTION_STRING });
    try {
        await pool.connect();
        const res = await pool.query('SELECT case_name FROM cases WHERE id = 51');
        if (res.rows.length > 0) {
            console.log('Case Name:', res.rows[0].case_name);
        } else {
            console.log('No record found.');
        }
    } catch (err) { console.error(err); } finally { await pool.end(); }
}
main();
