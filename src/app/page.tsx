
import { supabase } from '@/lib/supabaseClient';
import CasesTable from '@/components/CasesTable';
import { Case, Person, Allegation } from '@/types';

export const revalidate = 0;

export default async function Home() {
  const { data: cases, error } = await supabase
    .from('cases')
    .select('*, people(*), allegations(*)')
    .order('file_open_date', { ascending: false });

  if (error) {
    console.error('Error fetching cases:', error);
    return (
      <div className="p-4 text-red-500 bg-red-50 rounded-md">
        Error loading cases: {error.message}
      </div>
    );
  }

  const formattedCases: Case[] = cases?.map((c: Case) => {
    // 1. Nama OKT
    const okts = c.people
      ?.filter((p: Person) => p.category === 'accused' || p.role?.toLowerCase().includes('tertuduh') || p.category === 'respondent')
      .map((p: Person) => p.name)
      .join(', ');

    // 2. Jenis Fail - Logic: Check file_no prefix or source_folder
    let jenisFail = 'Lain-lain';
    if (c.file_no?.toUpperCase().includes('RAYUAN')) jenisFail = 'RAYUAN';
    else if (c.file_no?.toUpperCase().includes('PERBICARAAN')) jenisFail = 'PERBICARAAN';
    else if (c.file_no?.toUpperCase().includes('SAMAN')) jenisFail = 'SAMAN';
    // Fallback to source folder name if helpful
    else if (c.source_folder) jenisFail = c.source_folder.split(' ')[0]; // E.g. "AKTA..." might not be useful, maybe logic needs refinement.

    // 3. No. Kes - Extract from Case Name or raw_data
    let noKes = '-';
    // Try to extract pattern like "NO : <something> -"
    const match = c.case_name?.match(/NO\s*:\s*(.*?)(?:\s+-\s+|$)/i);
    if (match) noKes = match[1].trim();

    // 4. Akta & Seksyen (Aggregate from allegations)
    const uniqueActs = Array.from(new Set(c.allegations?.map((a: Allegation) => a.act_desc).filter(Boolean) ?? [])).join(', ');
    const uniqueSections = Array.from(new Set(c.allegations?.map((a: Allegation) => a.section).filter(Boolean) ?? [])).join(', ');

    // 5. KPI
    let kpi = "-";
    const rawData = c.raw_data as Record<string, Record<string, string>> | null;
    if (rawData?.LKK_DATA?.MemenuhiKPI) {
      kpi = rawData.LKK_DATA.MemenuhiKPI === "1" ? "Ya" : "Tidak";
    }

    return {
      ...c,
      okt_name: okts || 'Tiada Maklumat',
      jenis_fail: jenisFail,
      no_kes: noKes,
      akta: uniqueActs || '-',
      seksyen: uniqueSections || '-',
      kpi: kpi
    };
  }) || [];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center px-1">
        <h1 className="text-xl font-bold text-gray-800 tracking-tight">Senarai LKK</h1>
        <div className="text-xs text-gray-500">
          {formattedCases.length} rekod
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <CasesTable cases={formattedCases} />
      </div>
    </div>
  );
}
