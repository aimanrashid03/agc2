
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function testChat() {
    console.log('Testing Chat API...');
    console.log('API Key Status:', process.env.OPENAI_API_KEY ? 'Present' : 'Missing');
    if (process.env.OPENAI_API_KEY) {
        console.log('API Key Length:', process.env.OPENAI_API_KEY.length);
        console.log('API Key Start:', process.env.OPENAI_API_KEY.substring(0, 3));
    }

    try {
        const { ChatOpenAI } = await import('@langchain/openai');
        const model = new ChatOpenAI({
            modelName: 'gpt-4o',
            temperature: 0.2,
            openAIApiKey: process.env.OPENAI_API_KEY,
        });

        console.log('Testing simple model invocation...');
        const res = await model.invoke("Hello, are you working?");
        console.log('Model response:', res.content);

    } catch (e) {
        console.error('Error during simple model test:', e);
        return;
    }

    // If simple test passes, try retrieval using PG directly
    try {
        const { OpenAIEmbeddings } = await import('@langchain/openai');
        const { Pool } = await import('pg');

        const pool = new Pool({
            connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
        });

        const embeddings = new OpenAIEmbeddings({
            modelName: 'text-embedding-3-small',
            openAIApiKey: process.env.OPENAI_API_KEY,
        });

        console.log('Generating embedding for query...');
        const queryEmbedding = await embeddings.embedQuery("kidnapping");

        // Convert to string format for vector/text input
        const vectorStr = `[${queryEmbedding.join(',')}]`;

        console.log('Executing match_documents via PG...');
        const res = await pool.query(`
            SELECT * FROM match_documents(
                $1,
                $2,
                $3
            );
        `, [vectorStr, 0.5, 2]);

        console.log(`Retrieved ${res.rows.length} documents.`);
        if (res.rows.length > 0) {
            console.log('First doc preview:', res.rows[0]?.content.substring(0, 100));
        }

        await pool.end();

    } catch (e: any) {
        console.error('Error during retrieval test:');
        console.error(e);
    }
}

testChat().catch(console.error);
