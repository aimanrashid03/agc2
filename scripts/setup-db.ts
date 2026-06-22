
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

        // Supabase defines anon/authenticated/service_role; a plain Postgres (local
        // pgvector container / the on-prem VM) does not, so the GRANTs below would abort.
        // Create them idempotently as NOLOGIN roles so this script runs on any Postgres.
        await pool.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
                IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
                IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
            END $$;
        `);
        console.log('Ensured anon/authenticated/service_role roles exist');

        // Drop tables in reverse order of dependencies
        // Drop function with correct signature (or use CASCADE on table drop if it depends on it, but function doesn't depend on table usually)
        await pool.query(`DROP FUNCTION IF EXISTS match_documents(vector(1536), float, int)`);
        await pool.query(`DROP FUNCTION IF EXISTS match_documents(text, float, int)`);
        await pool.query(`DROP FUNCTION IF EXISTS match_documents(text, float, int, jsonb)`);
        await pool.query(`DROP TABLE IF EXISTS case_embeddings;`);
        await pool.query(`DROP TABLE IF EXISTS allegations;`);
        await pool.query(`DROP TABLE IF EXISTS people;`);
        await pool.query(`DROP TABLE IF EXISTS cases;`);
        await pool.query(`DROP TABLE IF EXISTS users;`);

        console.log('Dropped existing tables.');

        // Enable Vector Extension
        await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
        console.log('Enabled vector extension');

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
                content_hash TEXT,  -- hash of embed-source text; lets ingest skip unchanged cases
                act_tags TEXT[],    -- every Act the case has charges under (primary Act -> source_folder)
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
                updated_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(case_id, source_id) -- Idempotency guard: safe re-seed of a folder
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
                updated_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(case_id, source_id) -- Idempotency guard: safe re-seed of a folder
            );
        `);
        console.log('Created table: allegations');

        // Create EMBEDDINGS table
        await pool.query(`
            CREATE TABLE case_embeddings (
                id SERIAL PRIMARY KEY,
                case_id INTEGER REFERENCES cases(id) ON DELETE CASCADE,
                content TEXT, -- Chunk of text from the case
                metadata JSONB, -- { source, title, etc. }
                embedding vector(1024), -- bge-m3 embedding size (Ollama); was 1536 (OpenAI text-embedding-3-small)
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);
        console.log('Created table: case_embeddings');

        // Auth.js Credentials user store (on-prem auth; replaces Supabase Auth)
        await pool.query(`
            CREATE TABLE users (
                id SERIAL PRIMARY KEY,
                email TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                name TEXT,
                role TEXT NOT NULL DEFAULT 'officer',
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );
        `);
        await pool.query(`CREATE UNIQUE INDEX users_email_lower_idx ON users (lower(email));`);
        console.log('Created table: users');

        // Create similarity search function
        // Note: Using text for query_embedding to be compatible with supabase-js/JSON serialization
        await pool.query(`
            CREATE OR REPLACE FUNCTION match_documents (
                query_embedding text,
                match_threshold float,
                match_count int,
                match_filter jsonb DEFAULT '{}'
            )
            RETURNS TABLE (
                id integer,
                case_id integer,
                content text,
                metadata jsonb,
                similarity float
            )
            LANGUAGE plpgsql
            AS $$
            BEGIN
                RETURN QUERY
                SELECT
                    case_embeddings.id,
                    case_embeddings.case_id,
                    case_embeddings.content,
                    case_embeddings.metadata,
                    1 - (case_embeddings.embedding <=> query_embedding::vector) AS similarity
                FROM case_embeddings
                WHERE 1 - (case_embeddings.embedding <=> query_embedding::vector) > match_threshold
                AND case_embeddings.metadata @> match_filter
                ORDER BY case_embeddings.embedding <=> query_embedding::vector
                LIMIT match_count;
            END;
            $$;
        `);
        // Grant execute permissions
        await pool.query(`GRANT EXECUTE ON FUNCTION match_documents TO anon, authenticated, service_role;`);
        console.log('Created function: match_documents');

        // Grant SELECT access to the web app roles
        await pool.query(`
            GRANT SELECT ON cases TO anon, authenticated;
            GRANT SELECT ON people TO anon, authenticated;
            GRANT SELECT ON allegations TO anon, authenticated;
            GRANT SELECT ON case_embeddings TO anon, authenticated;

            -- Enable RLS but allow reads (if RLS is strictly enforced)
            ALTER TABLE cases ENABLE ROW LEVEL SECURITY;
            ALTER TABLE people ENABLE ROW LEVEL SECURITY;
            ALTER TABLE allegations ENABLE ROW LEVEL SECURITY;
            ALTER TABLE case_embeddings ENABLE ROW LEVEL SECURITY;

            DROP POLICY IF EXISTS "Allow public read-only access" ON cases;
            CREATE POLICY "Allow public read-only access" ON cases FOR SELECT USING (true);
            
            DROP POLICY IF EXISTS "Allow public read-only access" ON people;
            CREATE POLICY "Allow public read-only access" ON people FOR SELECT USING (true);
            
            DROP POLICY IF EXISTS "Allow public read-only access" ON allegations;
            CREATE POLICY "Allow public read-only access" ON allegations FOR SELECT USING (true);
            
            DROP POLICY IF EXISTS "Allow public read-only access" ON case_embeddings;
            CREATE POLICY "Allow public read-only access" ON case_embeddings FOR SELECT USING (true);
        `);
        console.log('Granted anon/authenticated access to tables.');

        console.log('Database schema successfully reset.');

    } catch (err) {
        console.error('Error setting up database:', err);
    } finally {
        await pool.end();
    }
}

main();
