'use client';

import { useState } from 'react';
import { FileText, Gavel, Scale, AlignLeft } from 'lucide-react';

export default function CaseContentTabs({ facts, judgement, issues, suggestions }: { facts: string | null, judgement: string | null, issues: string | null, suggestions: string | null }) {
    const [activeTab, setActiveTab] = useState('fakta');

    const tabs = [
        { id: 'fakta', label: 'Fakta Kes', icon: AlignLeft, content: facts },
        { id: 'alasan', label: 'Alasan Penghakiman', icon: Gavel, content: judgement },
        { id: 'hujahan', label: 'Isu & Hujahan', icon: Scale, content: issues },
        { id: 'cadangan', label: 'Cadangan', icon: FileText, content: suggestions },
    ].filter(t => t.content); // Only show tabs with content

    if (tabs.length === 0) return null;

    // Set initial custom active tab if default 'fakta' has no content
    if (!tabs.find(t => t.id === activeTab) && tabs.length > 0) {
        setActiveTab(tabs[0].id);
    }

    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex flex-col h-[600px]"> {/* Fixed height container */}
            <div className="flex border-b border-gray-200 bg-gray-50">
                {tabs.map((tab) => {
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center px-6 py-3 text-xs font-bold uppercase tracking-wider transition-colors border-r border-gray-100 outline-none ${activeTab === tab.id
                                    ? 'bg-white text-purple-600 border-t-2 border-t-purple-600'
                                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                                }`}
                        >
                            <Icon className="w-4 h-4 mr-2" />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-gray-50/30 custom-scrollbar">
                {tabs.map((tab) => (
                    <div key={tab.id} className={activeTab === tab.id ? 'block' : 'hidden'}>
                        <div className="prose max-w-none text-gray-700 text-sm whitespace-pre-wrap leading-relaxed">
                            {tab.content?.replace(/\\n/g, '\n')}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
