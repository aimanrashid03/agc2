'use client';

import Link from 'next/link';
import { FileText, ChevronLeft, ChevronRight, MessageSquare } from 'lucide-react';
import { useState } from 'react';

const Sidebar = () => {
    const [isCollapsed, setIsCollapsed] = useState(false);

    return (
        <div
            className={`${isCollapsed ? 'w-16' : 'w-60'} h-screen bg-white border-r border-gray-200 flex flex-col pt-2 transition-all duration-300 ease-in-out relative`}
        >
            <div className={`px-4 py-4 border-b border-gray-100 flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
                {!isCollapsed && (
                    <div className="overflow-hidden">
                        <h1 className="text-lg font-bold text-gray-900 tracking-tight whitespace-nowrap">AGC Cases</h1>
                        <p className="text-[10px] uppercase tracking-wider text-purple-600 font-semibold mt-0.5 whitespace-nowrap">Sistem Pengurusan Kes</p>
                    </div>
                )}
                <button
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className="p-1 rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
                >
                    {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                </button>
            </div>

            <nav className="flex-1 px-2 py-4 space-y-1">
                <Link href="/" className={`flex items-center ${isCollapsed ? 'justify-center px-0' : 'px-3'} py-2 text-sm font-medium text-gray-700 hover:bg-purple-50 hover:text-purple-700 rounded-md transition-colors group`}>
                    <FileText className="w-4 h-4 group-hover:text-purple-600 flex-shrink-0" />
                    {!isCollapsed && <span className="ml-3 truncate">Senarai Kes</span>}
                </Link>
                <Link href="/chat" className={`flex items-center ${isCollapsed ? 'justify-center px-0' : 'px-3'} py-2 text-sm font-medium text-gray-700 hover:bg-purple-50 hover:text-purple-700 rounded-md transition-colors group`}>
                    <MessageSquare className="w-4 h-4 group-hover:text-purple-600 flex-shrink-0" />
                    {!isCollapsed && <span className="ml-3 truncate">Chat AI</span>}
                </Link>
            </nav>

        </div>
    );
};

export default Sidebar;
