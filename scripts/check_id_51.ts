
import { Pool } from 'pg';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const CONNECTION_STRING = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

async function main() {
    const pool = new Pool({ connectionString: CONNECTION_STRING });
    try {
        await pool.connect();
        const res = await pool.query('SELECT id, case_name, file_no, raw_data FROM cases WHERE id = 51');
        if (res.rows.length > 0) {
            console.log('Record found for ID 51:');
            console.log(JSON.stringify(res.rows[0], null, 2));
        } else {
            console.log('No record found for ID 51.');
        }
    } catch (err) {
        console.error('Error querying database:', err);
    } finally {
        await pool.end();
    }
}

main();
