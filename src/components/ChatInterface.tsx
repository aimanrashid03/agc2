
'use client';

import { useState, useRef, useEffect, type ReactNode } from 'react';
import { Send, FileText, User, Loader2, ChevronDown } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import MultiCaseExportButton from '@/components/MultiCaseExportButton';
import { DEFAULT_CHATBOT_SETTINGS, type ChatbotSettings } from '@/lib/chatbotDefaults';

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

function parseAssistantContent(content: string): {
    nodes: ReactNode[];
    caseIds: number[];
} {
    const citationPattern = /\[\[([^\[\]]+?)\]\]\((\d+)\)|\[(?!\[)([^\]]+)\]\((\d+)\)/g;
    const nodes: ReactNode[] = [];
    const uniqueCaseIds = new Set<number>();
    let lastIndex = 0;

    for (const match of content.matchAll(citationPattern)) {
        const fullMatch = match[0] || '';
        const startIndex = match.index ?? 0;

        if (startIndex > lastIndex) {
            nodes.push(
                <span key={`text-${startIndex}`}>{content.slice(lastIndex, startIndex)}</span>,
            );
        }

        const idString = match[2] || match[4];
        const caseId = Number.parseInt(idString, 10);
        if (Number.isInteger(caseId)) {
            uniqueCaseIds.add(caseId);
            const title = (match[1] || match[3] || 'Kes').trim();
            nodes.push(
                <Link
                    key={`citation-${startIndex}-${caseId}`}
                    href={`/cases/${caseId}`}
                    className="mx-1 inline-flex items-center gap-1 rounded bg-primary-50 px-1.5 py-0.5 text-sm font-medium text-primary-600 transition-colors hover:bg-primary-100"
                >
                    <FileText size={14} />
                    {title}
                </Link>,
            );
        }

        lastIndex = startIndex + fullMatch.length;
    }

    if (lastIndex < content.length) {
        nodes.push(<span key="text-tail">{content.slice(lastIndex)}</span>);
    }

    if (nodes.length === 0) {
        nodes.push(<span key="plain">{content}</span>);
    }

    return {
        nodes,
        caseIds: Array.from(uniqueCaseIds),
    };
}

export default function ChatInterface({
    botName = DEFAULT_CHATBOT_SETTINGS.botName,
    welcomeHeading = DEFAULT_CHATBOT_SETTINGS.welcomeHeading,
    welcomeSubtitle = DEFAULT_CHATBOT_SETTINGS.welcomeSubtitle,
    starterPrompts = DEFAULT_CHATBOT_SETTINGS.starterPrompts,
    maintenanceEnabled = DEFAULT_CHATBOT_SETTINGS.maintenanceEnabled,
    maintenanceMessage = DEFAULT_CHATBOT_SETTINGS.maintenanceMessage,
    avatarSrc = DEFAULT_CHATBOT_SETTINGS.avatarSrc,
    onClose,
}: Partial<ChatbotSettings> & { onClose?: () => void } = {}) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const clearChat = () => {
        setMessages([]);
        localStorage.removeItem('chat_messages');
    };

    // Load messages from localStorage on mount
    useEffect(() => {
        const saved = localStorage.getItem('chat_messages');
        if (saved) {
            try {
                setMessages(JSON.parse(saved));
            } catch (e) {
                console.error('Failed to parse chat messages', e);
            }
        }
    }, []);

    // Save messages to localStorage whenever they change.
    useEffect(() => {
        if (messages.length > 0) {
            localStorage.setItem('chat_messages', JSON.stringify(messages));
        }
    }, [messages]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    }, [messages]);

    const sendMessage = async (text: string) => {
        const trimmed = text.trim();
        if (!trimmed || isLoading || maintenanceEnabled) return;

        const userMessage: Message = { role: 'user', content: trimmed };
        const outgoingMessages = [...messages, userMessage];
        setMessages((prev) => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    messages: outgoingMessages,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Failed to send message');
            }
            if (!response.body) throw new Error('No response body');

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let assistantMessage = '';

            // Add placeholder for assistant message
            setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                assistantMessage += chunk;

                setMessages((prev) => {
                    const newMessages = [...prev];
                    newMessages[newMessages.length - 1] = {
                        role: 'assistant',
                        content: assistantMessage,
                    };
                    return newMessages;
                });
            }
        } catch (error) {
            console.error('Error sending message:', error);
            setMessages((prev) => [
                ...prev,
                { role: 'assistant', content: 'Maaf, berlaku ralat. Sila cuba lagi.' },
            ]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        sendMessage(input);
    };

    return (
        <div className="flex flex-col h-full w-full max-w-4xl mx-auto">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-white/50 backdrop-blur-sm">
                <div className="flex items-center gap-2">
                    <Image src={avatarSrc} alt={botName} width={36} height={36} unoptimized className="rounded-full object-cover" />
                    <h2 className="font-semibold text-gray-800">{botName}</h2>
                </div>
                <div className="flex items-center gap-1">
                    {messages.length > 0 && (
                        <button
                            onClick={clearChat}
                            className="text-xs font-medium text-gray-500 hover:text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
                        >
                            Kosongkan Chat
                        </button>
                    )}
                    {onClose && (
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Tutup chat"
                            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors"
                        >
                            <ChevronDown size={18} />
                        </button>
                    )}
                </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-6">
                {maintenanceEnabled && (
                    <div className="mx-auto max-w-md rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm text-amber-800">
                        {maintenanceMessage}
                    </div>
                )}
                {messages.length === 0 && !maintenanceEnabled && (
                    <div className="flex flex-col items-center justify-center h-full text-center text-gray-500 space-y-5">
                        <Image
                            src={avatarSrc}
                            alt={botName}
                            width={88}
                            height={88}
                            unoptimized
                            className="rounded-full object-cover shadow-sm"
                        />
                        <div>
                            <h2 className="text-xl font-semibold text-gray-900">{welcomeHeading}</h2>
                            <p className="max-w-md mt-2">{welcomeSubtitle}</p>
                        </div>
                        <div className="flex flex-wrap items-center justify-center gap-2 max-w-lg">
                            {starterPrompts.map((prompt) => (
                                <button
                                    key={prompt}
                                    type="button"
                                    onClick={() => sendMessage(prompt)}
                                    className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 shadow-sm transition-colors hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700"
                                >
                                    {prompt}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {messages.map((msg, i) => {
                    const parsedAssistantContent = msg.role === 'assistant'
                        ? parseAssistantContent(msg.content)
                        : null;
                    const recommendedCaseIds = parsedAssistantContent?.caseIds || [];

                    return (
                    <div
                        key={i}
                        className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'
                            }`}
                    >
                        <div
                            className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center overflow-hidden ${msg.role === 'user'
                                ? 'bg-gray-900 text-white'
                                : 'bg-primary-100 text-primary-600'
                                }`}
                        >
                            {msg.role === 'user' ? <User size={18} /> : <Image src={avatarSrc} alt={botName} width={40} height={40} unoptimized className="rounded-full object-cover" />}
                        </div>

                        <div
                            className={`max-w-[80%] rounded-2xl px-4 py-3 ${msg.role === 'user'
                                ? 'bg-gray-900 text-white'
                                : 'bg-white border border-gray-200 shadow-sm text-gray-800'
                                }`}
                        >
                            <div className="prose prose-sm max-w-none dark:prose-invert">
                                {msg.role === 'assistant' ? (
                                    <p className="whitespace-pre-wrap leading-relaxed">
                                        {parsedAssistantContent?.nodes}
                                    </p>
                                ) : (
                                    <div className="whitespace-pre-wrap">{msg.content}</div>
                                )}
                            </div>
                            {msg.role === 'assistant' && recommendedCaseIds.length > 0 && (
                                <div className="mt-3 border-t border-gray-100 pt-3">
                                    <MultiCaseExportButton
                                        selectedCaseIds={recommendedCaseIds}
                                        className="w-full justify-center"
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                    );
                })}
                {isLoading && messages[messages.length - 1]?.role === 'user' && (
                    <div className="flex gap-4 justify-start">
                        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center overflow-hidden">
                            <Image src={avatarSrc} alt={botName} width={40} height={40} unoptimized className="rounded-full object-cover" />
                        </div>
                        <div className="bg-white border border-gray-200 shadow-sm rounded-2xl px-4 py-3">
                            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className="p-4 bg-white border-t border-gray-100">
                <form onSubmit={handleSubmit} className="relative flex items-center gap-2">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder={maintenanceEnabled ? 'Sembang tidak tersedia buat masa ini' : 'Tanya soalan tentang kes...'}
                        className="flex-1 py-3 px-4 pr-12 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                        disabled={isLoading || maintenanceEnabled}
                    />
                    <button
                        type="submit"
                        disabled={!input.trim() || isLoading || maintenanceEnabled}
                        className="absolute right-2 p-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                    </button>
                </form>
            </div>
        </div>
    );
}
