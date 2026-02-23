
'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, FileText, User, Bot, Loader2 } from 'lucide-react';
import Link from 'next/link';

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

export default function ChatInterface() {
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

    // Save messages to localStorage whenever they change
    useEffect(() => {
        if (messages.length > 0) {
            localStorage.setItem('chat_messages', JSON.stringify(messages));
        }
    }, [messages]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        const userMessage: Message = { role: 'user', content: input };
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
                    messages: [...messages, userMessage],
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
                { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' },
            ]);
        } finally {
            setIsLoading(false);
        }
    };

    // Helper to render markdown-like citations
    // Format: [[Case Name]](case_id)
    const renderContent = (content: string) => {
        const parts = content.split(/(\[\[.*?\]\]\(\d+\))/g);
        return parts.map((part, index) => {
            const match = part.match(/\[\[(.*?)\]\]\((\d+)\)/);
            if (match) {
                const [, title, id] = match;
                return (
                    <Link
                        key={index}
                        href={`/cases/${id}`}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-1 text-sm font-medium text-purple-600 bg-purple-50 rounded hover:bg-purple-100 transition-colors"
                    >
                        <FileText size={14} />
                        {title}
                    </Link>
                );
            }
            return <span key={index}>{part}</span>;
        });
    };

    return (
        <div className="flex flex-col h-[calc(100vh-6rem)] max-w-4xl mx-auto">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-white/50 backdrop-blur-sm">
                <div className="flex items-center gap-2">
                    <Bot size={20} className="text-purple-600" />
                    <h2 className="font-semibold text-gray-800">Legal Assistant</h2>
                </div>
                {messages.length > 0 && (
                    <button
                        onClick={clearChat}
                        className="text-xs font-medium text-gray-500 hover:text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
                    >
                        Clear Chat
                    </button>
                )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-center text-gray-500 space-y-4">
                        <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center">
                            <Bot size={32} className="text-purple-600" />
                        </div>
                        <div>
                            <h2 className="text-xl font-semibold text-gray-900">Legal Assistant</h2>
                            <p className="max-w-md mt-2">
                                Ask me questions about penal code cases. I can provide summaries and direct citations to relevant cases.
                            </p>
                        </div>
                    </div>
                )}

                {messages.map((msg, i) => (
                    <div
                        key={i}
                        className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'
                            }`}
                    >
                        <div
                            className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${msg.role === 'user'
                                ? 'bg-gray-900 text-white'
                                : 'bg-purple-100 text-purple-600'
                                }`}
                        >
                            {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
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
                                        {renderContent(msg.content)}
                                    </p>
                                ) : (
                                    <div className="whitespace-pre-wrap">{msg.content}</div>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
                {isLoading && messages[messages.length - 1]?.role === 'user' && (
                    <div className="flex gap-4 justify-start">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center">
                            <Bot size={16} />
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
                        placeholder="Ask a question about cases..."
                        className="flex-1 py-3 px-4 pr-12 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all"
                        disabled={isLoading}
                    />
                    <button
                        type="submit"
                        disabled={!input.trim() || isLoading}
                        className="absolute right-2 p-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                    </button>
                </form>
            </div>
        </div>
    );
}
