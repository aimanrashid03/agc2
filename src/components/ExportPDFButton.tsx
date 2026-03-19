'use client';

import { Download, Loader } from 'lucide-react';
import { useState } from 'react';

interface ExportPDFButtonProps {
  caseId: string;
  fileName: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'button' | 'icon';
}

export default function ExportPDFButton({
  caseId,
  fileName,
  className = '',
  size = 'md',
  variant = 'button',
}: ExportPDFButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleExport = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    try {
      setLoading(true);
      const response = await fetch(`/api/cases/${caseId}/export-pdf`);

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

      // Get the blob and download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Laporan_${fileName}_${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('PDF export error:', error);
      const fallbackMessage = 'Tidak dapat menjana PDF. Sila cuba lagi.';
      const details = error instanceof Error ? error.message : fallbackMessage;
      alert(details || fallbackMessage);
    } finally {
      setLoading(false);
    }
  };

  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-2 text-sm',
    lg: 'px-4 py-2.5 text-base',
  };

  if (variant === 'icon') {
    return (
      <button
        onClick={handleExport}
        disabled={loading}
        className={`inline-flex items-center justify-center rounded-full hover:bg-green-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors w-7 h-7 ${className}`}
        title="Muat turun laporan kes dalam format PDF"
      >
        {loading ? (
          <Loader className="w-4 h-4 animate-spin" />
        ) : (
          <Download className="w-4 h-4" />
        )}
      </button>
    );
  }

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      className={`inline-flex items-center gap-2 font-medium rounded-lg border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 hover:border-purple-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${sizeClasses[size]} ${className}`}
      title="Muat turun laporan kes dalam format PDF"
    >
      {loading ? (
        <>
          <Loader className="w-4 h-4 animate-spin" />
          Menghasilkan...
        </>
      ) : (
        <>
          <Download className="w-4 h-4" />
          Muat Turun PDF
        </>
      )}
    </button>
  );
}
