/**
 * Idempotent, NON-destructive migration: adds the single-row `chatbot_settings` table
 * (admin-editable chatbot branding/copy + maintenance + uploaded avatar) to an EXISTING
 * database without touching any other table. Safe to run on the live 849-case DB.
 *
 *   npx tsx scripts/migrate-chatbot-settings.ts
 *
 * Unlike scripts/setup-db.ts (a full destructive reset), this only CREATE TABLE IF NOT
 * EXISTS + seeds row id=1 ON CONFLICT DO NOTHING. Re-running is a no-op. Column DEFAULTs
 * mirror src/lib/chatbotDefaults.ts so the seeded row reproduces today's hardcoded values.
 */
import { Pool } from 'pg';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const CONNECTION_STRING =
    process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5432/postgres';

async function main() {
    const pool = new Pool({ connectionString: CONNECTION_STRING });
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS chatbot_settings (
                id INT PRIMARY KEY DEFAULT 1,
                bot_name TEXT NOT NULL DEFAULT 'Arif',
                welcome_heading TEXT NOT NULL DEFAULT 'Hai, saya Arif 👋',
                welcome_subtitle TEXT NOT NULL DEFAULT 'Saya pembantu undang-undang AI anda. Tanyakan apa-apa tentang kes jenayah Malaysia (Kanun Keseksaan & Akta Penculikan) — saya beri jawapan tepat berdasarkan pangkalan data kes, lengkap dengan rujukan.',
                starter_prompts JSONB NOT NULL DEFAULT '["Apakah hukuman bagi kesalahan di bawah seksyen 302 Kanun Keseksaan?", "Berikan contoh kes pecah amanah jenayah (seksyen 409).", "Apakah faktor yang dipertimbangkan mahkamah semasa menjatuhkan hukuman?"]'::jsonb,
                refusal_message TEXT NOT NULL DEFAULT 'Maaf, saya tidak menemui maklumat itu dalam pangkalan data kes saya. Cuba nyatakan seksyen, jenis kes, atau kata kunci lain — saya sedia membantu.',
                maintenance_enabled BOOLEAN NOT NULL DEFAULT false,
                maintenance_message TEXT NOT NULL DEFAULT 'Maaf, sembang sedang dalam penyelenggaraan. Sila cuba sebentar lagi.',
                avatar_data BYTEA,
                avatar_mime TEXT,
                avatar_updated_at TIMESTAMPTZ,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                CONSTRAINT chatbot_settings_singleton CHECK (id = 1)
            );
        `);
        await pool.query(`INSERT INTO chatbot_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;`);

        const { rows } = await pool.query(
            `SELECT bot_name, maintenance_enabled, (avatar_data IS NOT NULL) AS has_avatar, updated_at
             FROM chatbot_settings WHERE id = 1`);
        console.log('chatbot_settings ready:', rows[0]);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}

main();
