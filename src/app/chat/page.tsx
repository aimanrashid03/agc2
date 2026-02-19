
import ChatInterface from '@/components/ChatInterface';

export default function ChatPage() {
    return (
        <div className="min-h-screen bg-white">
            <div className="border-b border-gray-100">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        <h1 className="text-xl font-semibold text-gray-900">Document Assistant</h1>
                    </div>
                </div>
            </div>
            <main className="bg-gray-50/50 min-h-[calc(100vh-4rem)]">
                <ChatInterface />
            </main>
        </div>
    );
}
