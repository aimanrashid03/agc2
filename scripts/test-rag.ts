
import dotenv from 'dotenv';
import path from 'path';
import OpenAI from 'openai';
import { Pool } from 'pg';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
    try {
        console.log('--- RAG Pipeline Test ---');

        // 1. Config Check
        if (!process.env.OPENAI_API_KEY) throw new Error('Missing OPENAI_API_KEY');
        // if (!process.env.DATABASE_URL) throw new Error('Missing DATABASE_URL'); // Relax check due to fallback

        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const CONNECTION_STRING = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
        const pool = new Pool({ connectionString: CONNECTION_STRING });

        const query = "What is kidnapping?";

        console.log(`Query: "${query}"`);

        // 3. Generate Embedding
        console.log('Generating embedding...');
        const embRes = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: query,
        });
        const vectorStr = `[${embRes.data[0].embedding.join(',')}]`;
        console.log('Embedding generated.');

        // 4. Search DB
        console.log('Searching database...');
        const { rows } = await pool.query(`
            SELECT * FROM match_documents($1, $2, $3, $4)
        `, [vectorStr, 0.5, 3, {}]);

        console.log(`Found ${rows.length} documents.`);

        if (rows.length === 0) {
            console.warn('No documents found. Ingestion might be empty.');
            return;
        }

        // 5. Generate Answer (Mocking the stream for simple test)
        console.log('Generating answer with GPT-4o...');
        const context = rows.map(r => r.content).join('\n---\n');
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
                { role: 'system', content: 'Answer based on context.' },
                { role: 'user', content: `Context:\n${context}\n\nQuestion: ${query}` }
            ],
        });

        console.log('\nAnswer:', completion.choices[0].message.content);
        console.log('\n--- Test Passed ---');

    } catch (e: any) {
        console.error('Test Failed:', e.message);
    } finally {
        await pool.end();
    }
})();
