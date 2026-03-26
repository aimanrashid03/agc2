'use client';

import { useState } from 'react';
import { Case } from '@/types';
import CasesTable from '@/components/CasesTable';
import MultiCaseExportButton from '@/components/MultiCaseExportButton';

interface CasesTableWrapperProps {
  cases: Case[];
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
        <div className="flex items-center gap-4 px-4 py-3 bg-primary-50 border border-primary-200 rounded-lg">
          <span className="text-sm text-gray-700">
            <span className="font-semibold">{selectedCaseIds.length}</span> kes dipilih
          </span>
          <MultiCaseExportButton selectedCaseIds={selectedCaseIds} />
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <CasesTable
          cases={cases}
          categories={categories}
          states={states}
          onSelectedCasesChange={setSelectedCaseIds}
        />
      </div>
    </div>
  );
}
