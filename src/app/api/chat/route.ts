
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import pool from '@/lib/db';

// Force usage of Node.js runtime for pg compatibility
export const runtime = 'nodejs';

// Initialize OpenAI client
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || 'dummy_key_for_build',
});

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { messages } = body;

        if (!messages || messages.length === 0) {
            return NextResponse.json({ error: 'No messages provided' }, { status: 400 });
        }

        const currentMessage = messages[messages.length - 1].content;

        // 1. Generate Embedding for the query
        const embeddingResponse = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: currentMessage,
        });

        const embedding = embeddingResponse.data[0].embedding;
        const vectorStr = `[${embedding.join(',')}]`;

        // 2. Retrieve relevant documents using PG
        // Use match_documents function
        const { rows: documents } = await pool.query(`
            SELECT * FROM match_documents(
                $1, -- query_embedding (text)
                $2, -- match_threshold
                $3, -- match_count
                $4  -- match_filter
            );
        `, [
            vectorStr,
            0.5, // Threshold
            5,   // Top 5
            {}   // Filter (passed as object, pg handles jsonb conversion)
        ]);

        // 3. Format Context
        const contextText = documents.map(doc => {
            const metadata = doc.metadata;
            const source = metadata?.source_folder || 'Unknown Act';
            const caseId = doc.case_id; // Use real Case ID from DB (was doc.id which is embedding ID)
            return `Case ID: ${caseId}\nSource: ${source}\nContent:\n${doc.content}`;
        }).join('\n\n---\n\n');

        // 4. Generate Response with Streaming
        // 4. Generate Response with Streaming
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

        if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'dummy_key_for_build') {
            throw new Error('OpenAI API Key is missing or invalid in server environment.');
        }

        const stream = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
                { role: 'system', content: systemPrompt },
                ...messages
            ],
            stream: true,
        });

        // 5. Return Stream
        const encoder = new TextEncoder();

        const readable = new ReadableStream({
            async start(controller) {
                for await (const chunk of stream) {
                    const content = chunk.choices[0]?.delta?.content || '';
                    if (content) {
                        controller.enqueue(encoder.encode(content));
                    }
                }
                controller.close();
            },
        });

        return new Response(readable, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            },
        });

    } catch (error: any) {
        console.error('Error in chat API:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
