import ChatInterface from '@/components/ChatInterface';
import { getChatbotSettings } from '@/lib/chatbotSettings';

// Read admin-configured chatbot settings at request time (not statically cached) so edits
// in /admin show on the next load. Falls back to defaults if the table is missing.
export const dynamic = 'force-dynamic';

export default async function ChatPage() {
    const settings = await getChatbotSettings();
    return (
        <div className="h-full bg-gray-50/50">
            <ChatInterface {...settings} />
        </div>
    );
}
