import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

// Public (see PUBLIC_PATHS in src/proxy.ts) — serves the admin-uploaded chatbot avatar from
// Postgres, or 307-redirects to the static default. Branding image, not sensitive. The chat
// references it as /api/chatbot/avatar?v=<avatar_updated_at-ms> so new uploads bust the cache.
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
    try {
        const { rows } = await pool.query(
            `SELECT avatar_data, avatar_mime FROM chatbot_settings WHERE id = 1`);
        const data: Buffer | null = rows[0]?.avatar_data ?? null;
        if (!data) {
            return NextResponse.redirect(new URL('/arif/2.jpg', req.url));
        }
        return new NextResponse(new Uint8Array(data), {
            status: 200,
            headers: {
                'Content-Type': rows[0].avatar_mime || 'image/jpeg',
                'Cache-Control': 'public, max-age=31536000, immutable',
            },
        });
    } catch {
        return NextResponse.redirect(new URL('/arif/2.jpg', req.url));
    }
}
