'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { ChevronDown } from 'lucide-react';
import ChatInterface from '@/components/ChatInterface';
import type { ChatbotSettings } from '@/lib/chatbotDefaults';

/**
 * Floating chat launcher mounted site-wide by AppShell (except on /chat, /settings,
 * /admin and /auth/*). It reuses <ChatInterface> verbatim, so the conversation —
 * persisted under the shared `chat_messages` localStorage key — continues seamlessly
 * between the widget and the full /chat page. History survives navigation and
 * open/close; only the in-chat "Kosongkan Chat" button resets it.
 */
export default function ChatWidget(settings: ChatbotSettings) {
    const [open, setOpen] = useState(false);
    const launcherRef = useRef<HTMLButtonElement>(null);

    // Esc closes the panel and returns focus to the launcher.
    useEffect(() => {
        if (!open) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [open]);

    const close = () => {
        setOpen(false);
        launcherRef.current?.focus();
    };

    return (
        <>
            {/* Chat panel */}
            <div
                role="dialog"
                aria-label={`Chat ${settings.botName}`}
                aria-hidden={!open}
                className={`fixed z-50 flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl transition-all duration-200 ease-out
                    ${open ? 'pointer-events-auto opacity-100 translate-y-0 scale-100' : 'pointer-events-none opacity-0 translate-y-3 scale-95'}
                    max-sm:inset-x-3 max-sm:bottom-3 max-sm:top-16
                    sm:bottom-24 sm:right-5 sm:w-95 sm:h-[min(620px,calc(100vh-7rem))]`}
            >
                {open && <ChatInterface {...settings} onClose={close} />}
            </div>

            {/* Launcher FAB */}
            <button
                ref={launcherRef}
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-label={open ? 'Tutup chat' : `Buka chat ${settings.botName}`}
                aria-expanded={open}
                className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary-600 text-white shadow-lg transition-transform hover:scale-105 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:ring-offset-2"
            >
                {open ? (
                    <ChevronDown size={24} />
                ) : (
                    <>
                        <Image
                            src={settings.avatarSrc}
                            alt={settings.botName}
                            width={56}
                            height={56}
                            unoptimized
                            className="h-full w-full rounded-full object-cover"
                        />
                        {/* Online accent dot */}
                        <span className="absolute bottom-0.5 right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-green-500" />
                    </>
                )}
            </button>
        </>
    );
}
