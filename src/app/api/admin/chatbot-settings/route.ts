import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getAdminSession } from '@/lib/auth-guard';

// Admin-only chatbot settings. GET = current values, PUT = update (text/copy + maintenance).
// Avatar upload is a separate multipart route. RAG knobs (gate/model/temperature) are NOT here.
export const runtime = 'nodejs';

const MAX = { name: 60, heading: 120, subtitle: 800, refusal: 800, maintenance: 800, prompt: 240, prompts: 6 };

export async function GET() {
    if (!(await getAdminSession())) {
        return NextResponse.json({ error: 'Akses dilarang.' }, { status: 403 });
    }
    const { rows } = await pool.query(
        `SELECT bot_name, welcome_heading, welcome_subtitle, starter_prompts,
                refusal_message, maintenance_enabled, maintenance_message,
                (avatar_data IS NOT NULL) AS has_avatar, avatar_updated_at
         FROM chatbot_settings WHERE id = 1`);
    return NextResponse.json({ settings: rows[0] ?? null });
}

export async function PUT(req: NextRequest) {
    if (!(await getAdminSession())) {
        return NextResponse.json({ error: 'Akses dilarang.' }, { status: 403 });
    }
    try {
        const body = await req.json();
        const bad = (msg: string) => NextResponse.json({ error: msg }, { status: 400 });

        const botName = String(body.botName ?? '').trim();
        if (!botName) return bad('Nama bot tidak boleh kosong.');
        if (botName.length > MAX.name) return bad(`Nama bot terlalu panjang (maks ${MAX.name} aksara).`);

        const welcomeHeading = String(body.welcomeHeading ?? '').trim();
        if (!welcomeHeading) return bad('Tajuk aluan tidak boleh kosong.');
        if (welcomeHeading.length > MAX.heading) return bad(`Tajuk aluan terlalu panjang (maks ${MAX.heading} aksara).`);

        const welcomeSubtitle = String(body.welcomeSubtitle ?? '').trim();
        if (!welcomeSubtitle) return bad('Teks aluan tidak boleh kosong.');
        if (welcomeSubtitle.length > MAX.subtitle) return bad(`Teks aluan terlalu panjang (maks ${MAX.subtitle} aksara).`);

        const refusalMessage = String(body.refusalMessage ?? '').trim();
        if (!refusalMessage) return bad('Mesej penolakan tidak boleh kosong.');
        if (refusalMessage.length > MAX.refusal) return bad(`Mesej penolakan terlalu panjang (maks ${MAX.refusal} aksara).`);

        const maintenanceEnabled = !!body.maintenanceEnabled;
        const maintenanceMessage = String(body.maintenanceMessage ?? '').trim();
        if (!maintenanceMessage) return bad('Mesej penyelenggaraan tidak boleh kosong.');
        if (maintenanceMessage.length > MAX.maintenance) return bad(`Mesej penyelenggaraan terlalu panjang (maks ${MAX.maintenance} aksara).`);

        const rawPrompts = Array.isArray(body.starterPrompts) ? body.starterPrompts : [];
        const starterPrompts = rawPrompts.map((p: unknown) => String(p).trim()).filter(Boolean).slice(0, MAX.prompts);
        if (!starterPrompts.length) return bad('Sekurang-kurangnya satu soalan cadangan diperlukan.');
        if (starterPrompts.some((p: string) => p.length > MAX.prompt)) return bad(`Soalan cadangan terlalu panjang (maks ${MAX.prompt} aksara).`);

        const { rows } = await pool.query(
            `INSERT INTO chatbot_settings
                (id, bot_name, welcome_heading, welcome_subtitle, starter_prompts,
                 refusal_message, maintenance_enabled, maintenance_message, updated_at)
             VALUES (1, $1, $2, $3, $4::jsonb, $5, $6, $7, NOW())
             ON CONFLICT (id) DO UPDATE SET
                bot_name = EXCLUDED.bot_name,
                welcome_heading = EXCLUDED.welcome_heading,
                welcome_subtitle = EXCLUDED.welcome_subtitle,
                starter_prompts = EXCLUDED.starter_prompts,
                refusal_message = EXCLUDED.refusal_message,
                maintenance_enabled = EXCLUDED.maintenance_enabled,
                maintenance_message = EXCLUDED.maintenance_message,
                updated_at = NOW()
             RETURNING bot_name, welcome_heading, welcome_subtitle, starter_prompts,
                       refusal_message, maintenance_enabled, maintenance_message`,
            [botName, welcomeHeading, welcomeSubtitle, JSON.stringify(starterPrompts),
             refusalMessage, maintenanceEnabled, maintenanceMessage]);
        return NextResponse.json({ settings: rows[0] });
    } catch (err) {
        console.error('update chatbot settings error', err);
        return NextResponse.json({ error: 'Gagal menyimpan tetapan.' }, { status: 500 });
    }
}
