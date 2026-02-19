
import { Pool } from 'pg';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const CONNECTION_STRING = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

async function main() {
    const pool = new Pool({ connectionString: CONNECTION_STRING });
    try {
        await pool.connect();

        // Reload Postgrest schema cache
        await pool.query("NOTIFY pgrst, 'reload schema'");
        console.log("Reloaded Postgrest schema cache");

        const res = await pool.query(`
            SELECT proname, pg_get_function_arguments(oid) as args
            FROM pg_proc 
            WHERE proname = 'match_documents';
        `);
        console.log('Function definition:', res.rows);

        const extRes = await pool.query("SELECT extversion FROM pg_extension WHERE extname = 'vector';");
        console.log('Vector extension version:', extRes.rows[0]?.extversion);

        try {
            const castRes = await pool.query("SELECT '[1,2,3]'::jsonb::vector as v");
            console.log('JSONB -> Vector cast supported:', castRes.rows[0].v);
        } catch (e: any) {
            console.log('JSONB -> Vector cast NOT supported:', e.message);
        }

        // Try calling it with dummy data
        const dummyEmbedding = Array(1536).fill(0.1);
        const vectorStrLiteral = `[${dummyEmbedding.join(',')}]`;

        console.log("Testing PG call...");
        try {
            // Pass string representation of vector
            const callRes = await pool.query(`
                SELECT * FROM match_documents(
                    $1, -- Pass as text, function handles casting
                    $2,
                    $3
                );
            `, [vectorStrLiteral, 0.5, 1]);
            console.log('PG Call Result:', callRes.rows);
        } catch (e: any) {
            console.error("PG Call Failed:", e.message);
        }

        // Test Supabase RPC
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // Test Supabase RPC with stringified vector
        // const { data, error } = await supabase.rpc('match_documents', {
        //     query_embedding: dummyEmbedding, // Try this first? It failed.
        //     match_threshold: 0.5,
        //     match_count: 1
        // });

        // Try formatted vector string '[0.1,0.1,...]'
        // or just JSON.stringify(dummyEmbedding) if it expects json?
        // pgvector inputs are usually '[1,2,3]' string.

        const vectorStr = `[${dummyEmbedding.join(',')}]`;

        console.log("Testing with string format...");
        const { data: dataStr, error: errorStr } = await supabase.rpc('match_documents', {
            query_embedding: vectorStr,
            match_threshold: 0.5,
            match_count: 1
        });

        if (errorStr) {
            console.error('Supabase RPC Error (String):', errorStr);
        } else {
            console.log('Supabase RPC Success (String):', dataStr);
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await pool.end();
    }
}

main();
