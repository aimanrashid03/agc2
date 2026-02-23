
import { Pool } from 'pg';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
const CONNECTION_STRING = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

async function main() {
    const pool = new Pool({ connectionString: CONNECTION_STRING });
    try {
        await pool.connect();
        const res = await pool.query('SELECT count(*) FROM case_embeddings');
        console.log(`Current embeddings: ${res.rows[0].count}`);
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
main();
