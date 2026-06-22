/**
 * Default chatbot ("Arif") branding/copy + the runtime settings shape.
 * PURE data — no `pg`/server imports — so BOTH the client `ChatInterface` and the
 * server `getChatbotSettings()` helper can import it without leaking the pool into
 * the client bundle. Defaults mirror the hardcoded values that shipped before the
 * admin-configurable settings landed, so behavior is unchanged until an admin edits.
 */

export interface ChatbotSettings {
    botName: string;
    welcomeHeading: string;
    welcomeSubtitle: string;
    starterPrompts: string[];
    refusalMessage: string;
    maintenanceEnabled: boolean;
    maintenanceMessage: string;
    /** Resolved avatar URL: the custom-upload route (cache-busted) or the static default. */
    avatarSrc: string;
}

export const DEFAULT_AVATAR_SRC = '/arif/2.jpg';

export const DEFAULT_CHATBOT_SETTINGS: ChatbotSettings = {
    botName: 'Arif',
    welcomeHeading: 'Hai, saya Arif 👋',
    welcomeSubtitle:
        'Saya pembantu undang-undang AI anda. Tanyakan apa-apa tentang kes jenayah Malaysia (Kanun Keseksaan & Akta Penculikan) — saya beri jawapan tepat berdasarkan pangkalan data kes, lengkap dengan rujukan.',
    starterPrompts: [
        'Apakah hukuman bagi kesalahan di bawah seksyen 302 Kanun Keseksaan?',
        'Berikan contoh kes pecah amanah jenayah (seksyen 409).',
        'Apakah faktor yang dipertimbangkan mahkamah semasa menjatuhkan hukuman?',
    ],
    refusalMessage:
        'Maaf, saya tidak menemui maklumat itu dalam pangkalan data kes saya. Cuba nyatakan seksyen, jenis kes, atau kata kunci lain — saya sedia membantu.',
    maintenanceEnabled: false,
    maintenanceMessage: 'Maaf, sembang sedang dalam penyelenggaraan. Sila cuba sebentar lagi.',
    avatarSrc: DEFAULT_AVATAR_SRC,
};
