
import { Pool } from 'pg';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const CONNECTION_STRING = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

async function main() {
    const pool = new Pool({ connectionString: CONNECTION_STRING });
    try {
        await pool.connect();
        const casesRes = await pool.query('SELECT COUNT(*) FROM cases');
        const peopleRes = await pool.query('SELECT COUNT(*) FROM people');

        console.log('Verification Results:');
        console.log(`Cases Count: ${casesRes.rows[0].count}`);
        console.log(`People Count: ${peopleRes.rows[0].count}`);
    } catch (err) {
        console.error('Error verifying data:', err);
    } finally {
        await pool.end();
    }
}

main();
