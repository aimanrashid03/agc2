
import dotenv from 'dotenv';
import path from 'path';
import OpenAI from 'openai';
import { Pool } from 'pg';

// Load env
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// Dummy request body simulation
const messages = [
    { role: 'user', content: 'Apakah hukuman bagi penculikan?' }
];

async function main() {
    console.log('Testing Chat Logic...');

    // 1. Check Env
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'dummy_key_for_build') {
        throw new Error('OpenAI API Key is missing or invalid in server environment.');
    }
    const CONNECTION_STRING = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const pool = new Pool({ connectionString: CONNECTION_STRING });

    try {
        console.log('1. Embedding...');
        const embeddingResponse = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: messages[0].content,
        });
        const vectorStr = `[${embeddingResponse.data[0].embedding.join(',')}]`;

        console.log('2. Querying...');
        // match_documents now returns case_id
        const { rows: documents } = await pool.query(`
            SELECT * FROM match_documents($1, $2, $3, $4);
        `, [vectorStr, 0.5, 3, {}]);

        console.log(`Found ${documents.length} docs.`);
        if (documents.length > 0) {
            console.log('Sample Doc IDs:', documents.map(d => ({ id: d.id, case_id: d.case_id })));
        }

        console.log('3. Generating Response (Malay Prompt)...');
        const contextText = documents.map((doc: any) => {
            const metadata = doc.metadata;
            const source = metadata?.source_folder || 'Unknown Act';
            const caseId = doc.case_id; // Using case_id as per new schema
            return `Case ID: ${caseId}\nSource: ${source}\nContent:\n${doc.content}`;
        }).join('\n\n---\n\n');

        const systemPrompt = `Anda adalah pembantu undang-undang AI pakar dalam undang-undang jenayah Malaysia (Kanun Keseksaan & Akta Penculikan).
Tugas anda:
1. Jawab soalan pengguna berdasarkan konteks yang diberikan SAHAJA.
2. Jawab dalam BAHASA MELAYU secara lalai (default), melainkan pengguna bertanya dalam Bahasa Inggeris.
3. Gunakan nada profesional, tepat, dan membantu.
4. JIKA anda tidak tahu jawapan berdasarkan konteks, katakan "Maaf, maklumat tersebut tiada dalam pangkalan data kes saya."
5. SENTIASA sertakan rujukan (citation) kepada kes yang digunakan.
6. Format rujukan: [[Nama Kes]](case_id). Nama Kes dan case_id ada dalam konteks.
7. Jika Nama Kes tiada, gunakan "kes ini".

PENTING: Jangan reka fakta. Hanya guna maklumat dari konteks di bawah.

Konteks:
${contextText}
`;

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
                { role: 'system', content: systemPrompt },
                ...messages
            ] as any,
            stream: false,
        });

        console.log('\nResponse:\n', completion.choices[0].message.content);

    } catch (e: any) {
        console.error('Test Failed:', e.message);
        if (e.detail) console.error('Detail:', e.detail);
        if (e.hint) console.error('Hint:', e.hint);
    } finally {
        await pool.end();
    }
}

main();
