
import { getCasesForList } from '@/lib/cases';
import type { CaseListItem } from '@/types';
import CasesTableWrapper from '@/components/CasesTableWrapper';

export const revalidate = 0;

// A few folders get hand-written labels; everything else is Title-Cased (number tokens
// like "1952" / "1959/63" are left intact). Keeps the 66 raw ALL-CAPS act names readable.
const CATEGORY_LABEL_OVERRIDES: Record<string, string> = {
  'KANUN KESEKSAAN': 'Kanun Keseksaan',
  'Lain-lain': 'Lain-lain',
};
function formatCategoryLabel(folder: string): string {
  if (CATEGORY_LABEL_OVERRIDES[folder]) return CATEGORY_LABEL_OVERRIDES[folder];
  return folder
    .split(' ')
    .map(w => (/^[A-Za-z]/.test(w) ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(' ');
}

export default async function Home() {
  let cases: CaseListItem[];
  try {
    cases = await getCasesForList();
  } catch (error) {
    console.error('Error fetching cases:', error);
    return (
      <div className="p-4 text-red-500 bg-red-50 rounded-md">
        Error loading cases: {error instanceof Error ? error.message : String(error)}
      </div>
    );
  }

  // Category options: count per source_folder, hide the drug folder (the hardcoded "Kes Dadah"
  // umbrella option already covers it) + legacy 39B, sort most-common-first, map to clean labels.
  const categoryCounts = new Map<string, number>();
  for (const c of cases) {
    if (c.source_folder) categoryCounts.set(c.source_folder, (categoryCounts.get(c.source_folder) ?? 0) + 1);
  }
  const uniqueCategories = Array.from(categoryCounts.keys())
    .filter(cat => !/(39B|DADAH|BERBAHAYA)/i.test(cat))
    .sort((a, b) => categoryCounts.get(b)! - categoryCounts.get(a)!)
    .map(cat => ({ value: cat, label: formatCategoryLabel(cat) }));

  // States for the Negeri filter.
  const uniqueStates = (Array.from(new Set(cases.map(c => c.state_desc).filter(Boolean))) as string[]).sort();

  // Latest updated_at across all cases.
  const latestUpdate = cases.reduce<string | null>((latest, c) => {
    if (!c.updated_at) return latest;
    if (!latest || c.updated_at > latest) return c.updated_at;
    return latest;
  }, null);

  // okt_name/akta/seksyen are already derived in SQL — just apply the Malay empty-state fallbacks.
  const tableCases: CaseListItem[] = cases.map(c => ({
    ...c,
    okt_name: c.okt_name || 'Tiada Maklumat',
    akta: c.akta || '-',
    seksyen: c.seksyen || '-',
  }));

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center px-1">
        <div>
          <h1 className="text-xl font-bold text-gray-800 tracking-tight">Senarai Laporan Kes Kehakiman</h1>
          {latestUpdate && (
            <p className="text-xs text-gray-400 mt-0.5">
              Tarikh Kemaskini: {new Date(latestUpdate).toLocaleDateString('ms-MY', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          )}
        </div>
        <div className="text-xs text-gray-500">
          {tableCases.length} rekod
        </div>
      </div>

      <CasesTableWrapper cases={tableCases} categories={uniqueCategories} states={uniqueStates} />
    </div>
  );
}
