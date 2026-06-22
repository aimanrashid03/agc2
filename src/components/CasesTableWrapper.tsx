'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { CaseListItem } from '@/types';
import CasesTable from '@/components/CasesTable';
import MultiCaseExportButton from '@/components/MultiCaseExportButton';

interface CasesTableWrapperProps {
  cases: CaseListItem[];
  categories: Array<{ value: string; label: string }>;
  states: string[];
}

export default function CasesTableWrapper({
  cases,
  categories,
  states,
}: CasesTableWrapperProps) {
  const [selectedCaseIds, setSelectedCaseIds] = useState<number[]>([]);

  return (
    <div className="space-y-4">
      {selectedCaseIds.length > 0 && (
        <div className="flex items-center justify-between gap-4 px-4 py-3 bg-primary-50 border border-primary-200 rounded-lg">
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-700">
              <span className="font-semibold">{selectedCaseIds.length}</span> kes dipilih
            </span>
            <MultiCaseExportButton selectedCaseIds={selectedCaseIds} />
          </div>
          <button
            onClick={() => setSelectedCaseIds([])}
            className="p-1 hover:bg-primary-200 rounded-md transition-colors"
            title="Batal pilihan"
          >
            <X className="h-5 w-5 text-gray-600" />
          </button>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <CasesTable
          cases={cases}
          categories={categories}
          states={states}
          selectedCaseIds={selectedCaseIds}
          onSelectedCasesChange={setSelectedCaseIds}
        />
      </div>
    </div>
  );
}
