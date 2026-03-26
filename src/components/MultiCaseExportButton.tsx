'use client';

import { Download, Loader } from 'lucide-react';
import { useState } from 'react';

interface MultiCaseExportButtonProps {
  selectedCaseIds: number[];
  className?: string;
}

export default function MultiCaseExportButton({
  selectedCaseIds,
  className = '',
}: MultiCaseExportButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    if (selectedCaseIds.length === 0) {
      return;
    }

    try {
      setLoading(true);
      const response = await fetch('/api/cases/export-trend-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          caseIds: selectedCaseIds,
        }),
      });

      if (!response.ok) {
        let message = 'Failed to generate PDF';
        try {
          const payload = (await response.json()) as { error?: string };
          if (payload.error) {
            message = payload.error;
          }
        } catch {
          // Ignore JSON parse errors and keep default message.
        }

        throw new Error(message);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `LaporanPelbagaiKes_${new Date().toISOString().replace(/[:]/g, '-').replace(/\..+$/, '')}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('Export error:', error);
      alert(`Error: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  const isDisabled = selectedCaseIds.length === 0 || loading;

  return (
    <button
      onClick={handleExport}
      disabled={isDisabled}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-md font-medium text-sm transition-colors ${
        isDisabled
          ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
          : 'bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800'
      } ${className}`}
    >
      {loading ? (
        <>
          <Loader className="h-4 w-4 animate-spin" />
          Menjana...
        </>
      ) : (
        <>
          <Download className="h-4 w-4" />
          Laporan ({selectedCaseIds.length})
        </>
      )}
    </button>
  );
}
