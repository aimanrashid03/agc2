
import { Pool } from 'pg';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
const CONNECTION_STRING = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

async function main() {
    const pool = new Pool({ connectionString: CONNECTION_STRING });
    try {
        await pool.connect();

        const cases = await pool.query('SELECT COUNT(*), source_folder FROM cases GROUP BY source_folder');
        const people = await pool.query('SELECT COUNT(*) FROM people');
        const allegations = await pool.query('SELECT COUNT(*) FROM allegations');

        console.log('--- Verification Results ---');
        console.log('Cases per Folder:');
        console.table(cases.rows);

        console.log(`Total People: ${people.rows[0].count}`);
        console.log(`Total Allegations: ${allegations.rows[0].count}`);

        // Check a random case with allegations
        const sample = await pool.query(`
            SELECT c.id, c.case_name, count(a.id) as allegation_count 
            FROM cases c 
            JOIN allegations a ON c.id = a.case_id 
            GROUP BY c.id, c.case_name 
            LIMIT 1
        `);
        if (sample.rows.length > 0) {
            console.log('\nSample Case with Allegations:', sample.rows[0]);
        }

    } catch (err) { console.error(err); } finally { await pool.end(); }
}
main();
