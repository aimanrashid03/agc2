
import { Pool } from 'pg';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const CONNECTION_STRING = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

async function main() {
    console.log('Fixing match_documents function...');
    const pool = new Pool({ connectionString: CONNECTION_STRING });

    try {
        await pool.connect();

        // Drop existing function to allow return type change
        await pool.query('DROP FUNCTION IF EXISTS match_documents(text, float, int, jsonb)');

        // Redefine function with returns TABLE(id integer, case_id integer, ...)
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

        console.log('Function match_documents updated successfully.');

    } catch (err) {
        console.error('Fatal error:', err);
    } finally {
        await pool.end();
    }
}

main();
