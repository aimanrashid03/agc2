
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';
import { ArrowLeft, User, Calendar, Scale, Folder, MapPin, Info } from 'lucide-react';
import { notFound } from 'next/navigation';
import { Case, Person, Allegation } from '@/types';
import CaseContentTabs from '@/components/CaseContentTabs';

export const revalidate = 0;

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

    const caseData = rawCaseData as (Case & { people: Person[], allegations: Allegation[] });

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


    // Sort allegations by date or ID
    const allegations = caseData.allegations?.sort((a, b) => a.id - b.id) || [];

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
                                    <Folder className="w-4 h-4 mr-2 mt-0.5 text-purple-600 flex-shrink-0" />
                                    <div>
                                        <div className="text-[10px] text-gray-400 uppercase tracking-wider">Sumber Fail</div>
                                        <div className="text-xs font-medium">{caseData.source_folder || '-'}</div>
                                    </div>
                                </div>
                                <div className="flex items-start text-gray-600">
                                    <MapPin className="w-4 h-4 mr-2 mt-0.5 text-purple-600 flex-shrink-0" />
                                    <div>
                                        <div className="text-[10px] text-gray-400 uppercase tracking-wider">Negeri / Mahkamah</div>
                                        <div className="text-xs font-medium">
                                            {caseData.state_desc && <span className="block text-gray-800 mb-0.5">{caseData.state_desc}</span>}
                                            <span className="text-gray-500">{caseData.court_desc}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-start text-gray-600">
                                    <Calendar className="w-4 h-4 mr-2 mt-0.5 text-purple-600 flex-shrink-0" />
                                    <div className="w-full">
                                        <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Tarikh Penting</div>
                                        <div className="grid grid-cols-2 gap-2 text-xs">
                                            <div>
                                                <span className="text-gray-500 block text-[9px]">DIBUKA</span>
                                                <span className="font-medium">{caseData.file_open_date ? new Date(caseData.file_open_date).toLocaleDateString('ms-MY') : '-'}</span>
                                            </div>
                                            <div>
                                                <span className="text-gray-500 block text-[9px]">KEPUTUSAN</span>
                                                <span className="font-medium">{caseData.result_date ? new Date(caseData.result_date).toLocaleDateString('ms-MY') : '-'}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-start text-gray-600 pt-2 border-t border-gray-50">
                                    <Scale className="w-4 h-4 mr-2 mt-0.5 text-purple-600 flex-shrink-0" />
                                    <div>
                                        <div className="text-[10px] text-gray-400 uppercase tracking-wider">Keputusan Kes</div>
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
                                    <ul className="space-y-3">
                                        {accused.map((p: Person) => (
                                            <li key={p.id} className="text-xs bg-gray-50 p-3 rounded-lg border border-gray-100">
                                                <div className="flex justify-between items-start mb-1">
                                                    <span className="font-semibold text-gray-900">{p.name || 'Tiada Nama'}</span>
                                                    <span className="text-[9px] font-medium px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded">{p.role}</span>
                                                </div>
                                                {p.id_no && <div className="text-[10px] text-gray-500 mt-1">NO. KP: {p.id_no}</div>}
                                                {(p.phone || p.email) && (
                                                    <div className="text-[10px] text-gray-500 flex flex-wrap gap-x-3 mt-1">
                                                        {p.phone && <span>Tel: {p.phone}</span>}
                                                        {p.email && <span>Emel: {p.email}</span>}
                                                    </div>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                ) : <span className="text-xs text-gray-400 italic">Tiada data</span>}
                            </div>

                            <div>
                                <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Pendakwaan</h3>
                                {prosecutors.length > 0 ? (
                                    <ul className="space-y-3">
                                        {prosecutors.map((p: Person) => (
                                            <li key={p.id} className="text-xs border-l-2 border-purple-300 pl-2">
                                                <div className="font-medium text-gray-900">{p.name}</div>
                                                <div className="text-[10px] text-gray-500 mb-1">{p.role}</div>
                                                {p.id_no && <div className="text-[9px] text-gray-400">NO. KP: {p.id_no}</div>}
                                            </li>
                                        ))}
                                    </ul>
                                ) : <span className="text-xs text-gray-400 italic">Tiada data</span>}
                            </div>

                            {judges.length > 0 && (
                                <div className="pt-2 border-t border-gray-100">
                                    <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Korom Hakim</h3>
                                    <ul className="space-y-1.5">
                                        {judges.map((p: Person) => (
                                            <li key={p.id} className="text-xs flex flex-col pl-2 border-l-2 border-gray-300">
                                                <span className="font-medium text-gray-800">{p.name}</span>
                                                <span className="text-[10px] text-gray-500">{p.role}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Column: Case Content Tabs & Allegations (Wider) */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Allegations Panel */}
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/80 flex items-center justify-between">
                            <div className="flex items-center">
                                <Info className="w-5 h-5 mr-3 text-purple-600" />
                                <h2 className="text-md font-bold text-gray-800 tracking-wide">Pertuduhan & Kesalahan</h2>
                            </div>
                            <span className="bg-purple-100 text-purple-800 text-xs font-bold px-2.5 py-1 rounded-full">{allegations.length} Pertuduhan</span>
                        </div>
                        <div className="p-0">
                            {allegations.length > 0 ? (
                                <ul className="divide-y divide-gray-100">
                                    {allegations.map((alg: Allegation, index: number) => (
                                        <li key={alg.id} className="p-5 hover:bg-gray-50 transition-colors">
                                            <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                                                <div className="flex-shrink-0 mt-1">
                                                    <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 font-bold text-xs ring-4 ring-white">
                                                        #{index + 1}
                                                    </div>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-bold text-gray-900 mb-1">{alg.act_desc || '- Akta Tidak Dinyatakan -'}</p>
                                                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600 mb-3">
                                                        <span className="inline-flex items-center"><span className="font-semibold mr-1">Seksyen:</span> {alg.section || '-'}</span>
                                                        <span className="inline-flex items-center"><span className="font-semibold mr-1">Jenis:</span> {alg.type || '-'}</span>
                                                        {alg.charge_created_date && <span className="inline-flex items-center"><span className="font-semibold mr-1">Tarikh:</span> {new Date(alg.charge_created_date).toLocaleDateString('ms-MY')}</span>}
                                                    </div>
                                                    {alg.charge_notes && (
                                                        <div className="text-sm text-gray-700 bg-white border border-gray-100 p-3 rounded-md shadow-sm">
                                                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Nota Pertuduhan:</span>
                                                            <p className="whitespace-pre-wrap leading-relaxed">{alg.charge_notes}</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <div className="p-8 text-center text-sm text-gray-500">
                                    Tiada rekod pertuduhan ditemui untuk kes ini.
                                </div>
                            )}
                        </div>
                    </div>

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
