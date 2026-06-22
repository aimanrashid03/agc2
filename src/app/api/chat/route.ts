import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import pool from '@/lib/db';
import { aiConfig } from '@/lib/aiConfig';

// pg + streaming need the Node.js runtime
export const runtime = 'nodejs';

const { embed: EMBED, chat: CHAT, retrieval: RET, refusalMsg: REFUSAL_MSG } = aiConfig;

const embedder = new OpenAI({ baseURL: EMBED.baseUrl, apiKey: EMBED.apiKey });
const chat = new OpenAI({ baseURL: CHAT.baseUrl, apiKey: CHAT.apiKey || 'missing-key' });

function buildSystemPrompt(contextText: string): string {
    return `Anda adalah pembantu undang-undang AI pakar dalam undang-undang jenayah Malaysia (Kanun Keseksaan & Akta Penculikan).
Tugas anda:
1. Jawab soalan pengguna berdasarkan konteks yang diberikan SAHAJA.
2. Jawab dalam BAHASA MELAYU secara lalai (default), melainkan pengguna bertanya dalam Bahasa Inggeris.
3. Gunakan nada profesional, tepat, dan membantu.
4. JIKA TIADA satu pun kes berkaitan dalam konteks, katakan "${REFUSAL_MSG}" dan BERHENTI. Tetapi JIKA ADA kes berkaitan dalam konteks, JAWAB dengannya — jangan menolak.
5. SENTIASA rujuk kes menggunakan PENANDA nombornya sahaja, cth [1], [2]. JANGAN tulis nama kes atau id penuh — cukup penanda nombor dalam kurungan siku.
6. JIKA soalan pengguna terlalu ringkas dan terdapat beberapa kes berbeza dalam konteks, sila minta penjelasan lanjut.
7. Jika Nama Kes tiada, gunakan "kes ini".
8. WAJIB: akhiri setiap jawapan (kecuali penolakan di perkara 4) dengan satu baris "Rujukan: " yang menyenaraikan penanda SEMUA kes yang anda guna, cth: "Rujukan: [1], [2]".

PERATURAN ANTI-REKAAN (PALING PENTING — kes ini melibatkan keputusan undang-undang sebenar):
- JANGAN SEKALI-KALI mereka-reka nama kes, nama pihak (OKT/Pengadu), mahkamah, seksyen, tarikh, atau hukuman. Setiap fakta MESTI datang terus dari konteks di bawah.
- Apabila diminta memberi "contoh kes", pilih HANYA daripada kes yang ada dalam konteks dan sertakan penanda. Jika tiada kes berkaitan, katakan tiada.
- Jika hukuman/keputusan sesuatu kes TIDAK dinyatakan dalam konteks (atau bertanda "Tidak dinyatakan"), nyatakan "hukuman tidak dinyatakan dalam rekod" — JANGAN agak atau anggar.
- JANGAN gunakan pengetahuan luar. Hanya guna konteks di bawah.

CARA RUJUKAN KES:
- Setiap kes dalam konteks diberi PENANDA seperti [1], [2], [3].
- Setiap kali anda menyebut fakta sesuatu kes, letak penanda nombornya. Tulis HANYA nombor dalam kurungan siku — JANGAN tulis nama atau id.

Konteks:
${contextText}
`;
}

// Numbered-tag citation post-process: the model emits [1]; we deterministically expand it to the
// contract [[Real Case Name]](real_id) from a tag->case map the code controls. Cannot mis-attribute.
function expandTags(answer: string, tagMap: Map<number, { id: number; name: string }>): string {
    return answer.replace(/\[(\d{1,2})\]/g, (full, n) => {
        const t = tagMap.get(parseInt(n, 10));
        return t ? `[[${t.name}]](${t.id})` : full;
    });
}

function textStream(text: string): Response {
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
        start(controller) { controller.enqueue(encoder.encode(text)); controller.close(); },
    });
    return new Response(readable, {
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
    });
}

export async function POST(req: NextRequest) {
    try {
        const { messages } = await req.json();
        if (!messages?.length) return NextResponse.json({ error: 'No messages provided' }, { status: 400 });
        const currentMessage = messages[messages.length - 1].content;

        // 1. Embed the query (bge-m3)
        const emb = await embedder.embeddings.create({ model: EMBED.model, input: currentMessage });
        const vectorStr = `[${(emb.data[0].embedding as number[]).join(',')}]`;

        // 2. Retrieve top candidates (low floor; gate applied in code)
        const { rows: documents } = await pool.query(
            `SELECT * FROM match_documents($1, $2, $3, $4)`,
            [vectorStr, RET.retrieveFloor, RET.matchCount, {}]);

        // 3. Deterministic refusal gate — refuse without calling the LLM on out-of-DB questions
        const topSim = documents[0]?.similarity ?? 0;
        if (!documents.length || topSim < RET.refuseGate) {
            return textStream(REFUSAL_MSG);
        }

        // 4. Assign a numbered tag per distinct case (retrieval order) + look up name & official verdict
        const tagOf = new Map<number, number>();
        const orderedCaseIds: number[] = [];
        for (const d of documents) {
            if (!tagOf.has(d.case_id)) { tagOf.set(d.case_id, tagOf.size + 1); orderedCaseIds.push(d.case_id); }
        }
        const { rows: caseRows } = await pool.query(
            `SELECT id, case_name, result FROM cases WHERE id = ANY($1)`, [orderedCaseIds]);
        const caseInfo = new Map<number, { name: string; result: string }>();
        for (const r of caseRows) caseInfo.set(r.id, { name: r.case_name || 'Kes Tidak Diketahui', result: r.result || 'Tidak dinyatakan dalam rekod' });
        const tagMap = new Map<number, { id: number; name: string }>();
        for (const [caseId, tag] of tagOf) tagMap.set(tag, { id: caseId, name: caseInfo.get(caseId)?.name || 'Kes' });

        // 5. Assemble context: tag + name + verdict joined at assembly time (NOT embedded) + chunk
        const contextText = documents.map(d => {
            const tag = tagOf.get(d.case_id);
            const info = caseInfo.get(d.case_id);
            return `[${tag}] Case ID: ${d.case_id}\nCase Name: ${info?.name}\nPenanda rujukan: [${tag}]\nKeputusan rasmi kes ini: ${info?.result}\nContent:\n${d.content}`;
        }).join('\n\n---\n\n');

        if (!CHAT.apiKey) throw new Error('Chat API key missing (set OPENROUTER_API_KEY or CHAT_API_KEY).');

        // 6. Generate, then expand tags -> [[name]](id) before returning (expansion needs the full text)
        const completion = await chat.chat.completions.create({
            model: CHAT.model,
            messages: [{ role: 'system', content: buildSystemPrompt(contextText) }, ...messages],
            temperature: 0,
        });
        const answer = completion.choices[0]?.message?.content || '';
        return textStream(expandTags(answer, tagMap));

    } catch (error) {
        console.error('Error in chat API:', error);
        const msg = error instanceof Error ? error.message : 'Internal Server Error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
