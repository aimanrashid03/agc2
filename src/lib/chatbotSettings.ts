// Server-only: importing the `pg` pool (@/lib/db) keeps this out of client bundles —
// never import this module from a 'use client' component (matches src/lib/cases.ts).
import pool from '@/lib/db';
import {
    DEFAULT_CHATBOT_SETTINGS,
    DEFAULT_AVATAR_SRC,
    type ChatbotSettings,
} from '@/lib/chatbotDefaults';

/**
 * Read the single-row `chatbot_settings` (id=1) and map it to the runtime shape.
 * Resilient: if the table is missing (migration not yet run) or any read fails, we
 * fall back to DEFAULT_CHATBOT_SETTINGS so the chat keeps working and the build is safe.
 * Avatar BYTES are intentionally NOT selected here — only whether one exists — to keep
 * this read cheap; the bytes are streamed by GET /api/chatbot/avatar.
 */
export async function getChatbotSettings(): Promise<ChatbotSettings> {
    try {
        const { rows } = await pool.query(
            `SELECT bot_name, welcome_heading, welcome_subtitle, starter_prompts,
                    refusal_message, maintenance_enabled, maintenance_message,
                    avatar_updated_at, (avatar_data IS NOT NULL) AS has_avatar
             FROM chatbot_settings WHERE id = 1`,
        );
        const r = rows[0];
        if (!r) return DEFAULT_CHATBOT_SETTINGS;

        const version = r.avatar_updated_at ? new Date(r.avatar_updated_at).getTime() : 0;
        return {
            botName: r.bot_name || DEFAULT_CHATBOT_SETTINGS.botName,
            welcomeHeading: r.welcome_heading || DEFAULT_CHATBOT_SETTINGS.welcomeHeading,
            welcomeSubtitle: r.welcome_subtitle || DEFAULT_CHATBOT_SETTINGS.welcomeSubtitle,
            starterPrompts: Array.isArray(r.starter_prompts) && r.starter_prompts.length
                ? r.starter_prompts
                : DEFAULT_CHATBOT_SETTINGS.starterPrompts,
            refusalMessage: r.refusal_message || DEFAULT_CHATBOT_SETTINGS.refusalMessage,
            maintenanceEnabled: !!r.maintenance_enabled,
            maintenanceMessage: r.maintenance_message || DEFAULT_CHATBOT_SETTINGS.maintenanceMessage,
            avatarSrc: r.has_avatar ? `/api/chatbot/avatar?v=${version}` : DEFAULT_AVATAR_SRC,
        };
    } catch {
        return DEFAULT_CHATBOT_SETTINGS;
    }
}
