'use client';

import { FileText, Gavel, Scale, AlignLeft } from 'lucide-react';
import { useState } from 'react';

const ALL_TABS = [
    { id: 'fakta', label: 'Fakta Kes', icon: AlignLeft },
    { id: 'alasan', label: 'Alasan Penghakiman', icon: Gavel },
    { id: 'hujahan', label: 'Isu & Hujahan', icon: Scale },
    { id: 'cadangan', label: 'Cadangan', icon: FileText },
];

export default function CaseContentTabs({ facts, judgement, issues, suggestions }: { facts: string | null, judgement: string | null, issues: string | null, suggestions: string | null }) {
    const contentMap: Record<string, string | null> = { fakta: facts, alasan: judgement, hujahan: issues, cadangan: suggestions };
    const tabs = ALL_TABS.filter(t => contentMap[t.id]);

    const [activeTab, setActiveTab] = useState(() => tabs[0]?.id ?? 'fakta');

    if (tabs.length === 0) return null;

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
                            {contentMap[tab.id]?.replace(/\\n/g, '\n')}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
