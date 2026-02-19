
import dotenv from 'dotenv';
import path from 'path';
import OpenAI from 'openai';
import { Pool } from 'pg';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function main() {
    console.log('Testing Retrieval Logic (OpenAI + PG Direct)...');

    // 1. Setup OpenAI
    const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
    });

    // 2. Setup PG
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
    });

    try {
        const query = "kidnapping";
        console.log(`Query: "${query}"`);

        // 3. Generate Embedding
        console.log('Generating embedding...');
        const embeddingResponse = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: query,
        });
        const embedding = embeddingResponse.data[0].embedding;
        const vectorStr = `[${embedding.join(',')}]`;
        console.log('Embedding generated.');

        // 4. Query DB
        console.log('Querying database...');
        const res = await pool.query(`
            SELECT * FROM match_documents(
                $1,
                $2,
                $3,
                $4
            );
        `, [vectorStr, 0.5, 3, JSON.stringify({})]);

        console.log(`Retrieved ${res.rows.length} documents.`);
        if (res.rows.length > 0) {
            console.log('--- Top Result ---');
            const doc = res.rows[0];
            console.log(`ID: ${doc.id}`);
            console.log(`Similarity: ${doc.similarity}`);
            console.log(`Content Preview: ${doc.content.substring(0, 150)}...`);
            console.log('------------------');
        } else {
            console.log('No documents found.');
        }

    } catch (e: any) {
        console.error('Error:', e.message);
        if (e.hint) console.error('Hint:', e.hint);
        if (e.detail) console.error('Detail:', e.detail);
    } finally {
        await pool.end();
    }
}

main();
