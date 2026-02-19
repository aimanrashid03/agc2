
import { Pool } from 'pg';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const CONNECTION_STRING = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

async function main() {
    console.log('Resetting database schema...');
    const pool = new Pool({ connectionString: CONNECTION_STRING });

    try {
        await pool.connect();

        // Drop tables in reverse order of dependencies
        await pool.query(`DROP TABLE IF EXISTS allegations;`);
        await pool.query(`DROP TABLE IF EXISTS people;`);
        await pool.query(`DROP TABLE IF EXISTS cases;`);

        console.log('Dropped existing tables.');

        // Create CASES table
        await pool.query(`
            CREATE TABLE cases (
                id SERIAL PRIMARY KEY,
                source_id INTEGER, -- Original LKK_INFOID
                source_folder TEXT, -- To distinguish between different Acts
                file_no TEXT,
                status TEXT,
                case_name TEXT,
                court_desc TEXT,
                state_desc TEXT,
                file_open_date DATE,
                result TEXT,
                result_date DATE,
                appeal_date DATE, -- LKK_FINAL_DATE_FOR_APPEAL
                grounds_of_judgement TEXT,
                case_facts TEXT,
                issues_and_arguments TEXT,
                dpp_suggestion TEXT,
                dsp_suggestion TEXT,
                raw_data JSONB,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(source_id, source_folder) -- Prevent duplicates from same source
            );
        `);
        console.log('Created table: cases');

        // Create PEOPLE table
        await pool.query(`
            CREATE TABLE people (
                id SERIAL PRIMARY KEY,
                case_id INTEGER REFERENCES cases(id) ON DELETE CASCADE,
                source_id INTEGER, -- Original LTL_PERSON_ID
                role TEXT,
                category TEXT,
                name TEXT,
                id_no TEXT,
                email TEXT,
                phone TEXT,
                address TEXT,
                raw_data JSONB,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );
        `);
        console.log('Created table: people');

        // Create ALLEGATIONS table
        await pool.query(`
            CREATE TABLE allegations (
                id SERIAL PRIMARY KEY,
                case_id INTEGER REFERENCES cases(id) ON DELETE CASCADE,
                source_id INTEGER, -- Original LLA_ALLEGATION_ID
                type TEXT,
                section TEXT,
                act_desc TEXT,
                charge_notes TEXT,
                okt_name TEXT,
                charge_created_date TIMESTAMP,
                raw_data JSONB,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );
        `);
        console.log('Created table: allegations');

        console.log('Database schema successfully reset.');

    } catch (err) {
        console.error('Error setting up database:', err);
    } finally {
        await pool.end();
    }
}

main();
