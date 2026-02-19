
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';
import { ArrowLeft, User, Gavel, Calendar, FileText, Scale } from 'lucide-react';
import { notFound } from 'next/navigation';
import { Case, Person } from '@/types';

export const revalidate = 0;

import CaseContentTabs from '@/components/CaseContentTabs';

// ... (imports remain same)

export default async function CaseDetails(props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const { id } = params;

    // Parse ID to avoid potential string/int mismatch issues
    const caseId = parseInt(id, 10);
    if (isNaN(caseId)) {
        return <div>Invalid Case ID</div>;
    }

    const { data: rawCaseData, error } = await supabase
        .from('cases')
        .select('*, people(*), allegations(*)')
        .eq('id', caseId)
        .maybeSingle();

    const caseData = rawCaseData as (Case & { people: Person[], allegations?: any[] });

    if (error) {
        console.error('Error fetching case:', error);
        return <div className="p-8 text-center text-red-600">Error loading case details: {error.message}</div>;
    }

    if (!caseData) {
        notFound();
    }

    // Group people by role/category
    const accused = caseData.people.filter((p: Person) => p.category === 'accused' || p.role?.toLowerCase().includes('tertuduh') || p.category === 'respondent');
    const prosecutors = caseData.people.filter((p: Person) => p.category === 'prosecutors' || p.role?.toLowerCase().includes('pendakwa'));
    const judges = caseData.people.filter((p: Person) => p.category === 'corum' || p.role?.toLowerCase().includes('hakim'));
    const others = caseData.people.filter((p: Person) => !accused.includes(p) && !prosecutors.includes(p) && !judges.includes(p));

    return (
        <div className="max-w-7xl mx-auto space-y-6 pb-10 px-4 sm:px-6 lg:px-8">
            <Link href="/" className="inline-flex items-center text-xs font-medium text-gray-500 hover:text-purple-600 transition-colors mb-2">
                <ArrowLeft className="w-3.5 h-3.5 mr-1" />
                Kembali
            </Link>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column: Case Info & People (Compact) */}
                <div className="lg:col-span-1 space-y-6">
                    {/* Header Card */}
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-purple-50 rounded-bl-full -mr-12 -mt-12 opacity-50"></div>
                        <div className="relative z-10">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h1 className="text-xl font-bold text-gray-900 leading-tight">{caseData.file_no}</h1>
                                    <p className="text-xs text-gray-500 mt-1">No. Fail</p>
                                </div>
                                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${caseData.status === 'SELESAI' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                                    }`}>
                                    {caseData.status}
                                </span>
                            </div>
                            <p className="text-sm text-gray-700 font-medium mb-4 line-clamp-3" title={caseData.case_name}>
                                {caseData.case_name}
                            </p>

                            <div className="space-y-3 pt-3 border-t border-gray-100">
                                <div className="flex items-start text-gray-600">
                                    <Gavel className="w-4 h-4 mr-2 mt-0.5 text-purple-600 flex-shrink-0" />
                                    <div>
                                        <div className="text-[10px] text-gray-400 uppercase tracking-wider">Mahkamah</div>
                                        <div className="text-xs font-medium">{caseData.court_desc}</div>
                                    </div>
                                </div>
                                <div className="flex items-start text-gray-600">
                                    <Calendar className="w-4 h-4 mr-2 mt-0.5 text-purple-600 flex-shrink-0" />
                                    <div>
                                        <div className="text-[10px] text-gray-400 uppercase tracking-wider">Tarikh Buka</div>
                                        <div className="text-xs font-medium">{caseData.file_open_date ? new Date(caseData.file_open_date).toLocaleDateString('ms-MY') : '-'}</div>
                                    </div>
                                </div>
                                <div className="flex items-start text-gray-600">
                                    <Scale className="w-4 h-4 mr-2 mt-0.5 text-purple-600 flex-shrink-0" />
                                    <div>
                                        <div className="text-[10px] text-gray-400 uppercase tracking-wider">Keputusan</div>
                                        <div className="text-xs font-medium">{caseData.result || '-'}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* People Card (Compact) */}
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/50 flex items-center">
                            <User className="w-4 h-4 mr-2 text-purple-600" />
                            <h2 className="text-sm font-semibold text-gray-800">Pihak Terlibat</h2>
                        </div>
                        <div className="p-4 space-y-5">
                            <div>
                                <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Tertuduh / Responden</h3>
                                {accused.length > 0 ? (
                                    <ul className="space-y-2">
                                        {accused.map((p: Person) => (
                                            <li key={p.id} className="text-xs bg-gray-50 p-2 rounded border border-gray-100">
                                                <div className="font-semibold text-gray-900">{p.name || 'Tiada Nama'}</div>
                                                <div className="text-[10px] text-gray-500">{p.role}</div>
                                            </li>
                                        ))}
                                    </ul>
                                ) : <span className="text-xs text-gray-400 italic">Tiada data</span>}
                            </div>

                            <div>
                                <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Pendakwaan</h3>
                                {prosecutors.length > 0 ? (
                                    <ul className="space-y-2">
                                        {prosecutors.map((p: Person) => (
                                            <li key={p.id} className="text-xs border-l-2 border-purple-300 pl-2">
                                                <div className="font-medium text-gray-900">{p.name}</div>
                                                <div className="text-[10px] text-gray-500">{p.role}</div>
                                            </li>
                                        ))}
                                    </ul>
                                ) : <span className="text-xs text-gray-400 italic">Tiada data</span>}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Column: Case Content Tabs (Wider) */}
                <div className="lg:col-span-2">
                    <CaseContentTabs
                        facts={caseData.case_facts}
                        judgement={caseData.grounds_of_judgement}
                        issues={caseData.issues_and_arguments}
                        suggestions={caseData.dpp_suggestion || caseData.dsp_suggestion || null}
                    />
                </div>
            </div>
        </div>
    );
}
