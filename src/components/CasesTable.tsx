'use client';

import Link from 'next/link';
import { Eye, Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ChevronDown, ChevronUp, X } from 'lucide-react';
import { useState, useRef, useCallback, Fragment } from 'react';
import { Case } from '@/types';

interface CategoryOption {
    value: string;
    label: string;
}

interface CasesTableProps {
    cases: Case[];
    categories: CategoryOption[];
    states: string[];
}

// Column definitions: label, initial width (px), min width (px), resizable
const COLUMNS = [
    { label: '',               width: 32,  min: 32,  resizable: false },
    { label: 'No. Fail',       width: 112, min: 40,  resizable: true  },
    { label: 'Nama Kes',       width: 192, min: 40,  resizable: true  },
    { label: 'Nama OKT',       width: 160, min: 40,  resizable: true  },
    { label: 'Tarikh Buka',    width: 96,  min: 40,  resizable: true  },
    { label: 'Mahkamah',       width: 160, min: 40,  resizable: true  },
    { label: 'Akta',           width: 128, min: 40,  resizable: true  },
    { label: 'Seksyen',        width: 96,  min: 40,  resizable: true  },
    { label: 'Status Laporan', width: 100, min: 40,  resizable: true  },
    { label: 'Papar',          width: 52,  min: 52,  resizable: false },
];

export default function CasesTable({ cases, categories, states }: CasesTableProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [expandedRow, setExpandedRow] = useState<number | null>(null);
    const [selectedCategory, setSelectedCategory] = useState('');
    const [selectedStatus, setSelectedStatus] = useState('');
    const [selectedState, setSelectedState] = useState('');

    // Column resize state
    const [colWidths, setColWidths] = useState<number[]>(COLUMNS.map(c => c.width));
    const [isResizing, setIsResizing] = useState(false);
    const resizingRef = useRef<{ colIdx: number; startX: number; startWidth: number } | null>(null);
    const colWidthsRef = useRef(colWidths);
    colWidthsRef.current = colWidths;

    const startResize = useCallback((e: React.MouseEvent, colIdx: number) => {
        e.preventDefault();
        resizingRef.current = { colIdx, startX: e.clientX, startWidth: colWidthsRef.current[colIdx] };
        setIsResizing(true);

        const onMouseMove = (ev: MouseEvent) => {
            if (!resizingRef.current) return;
            const { colIdx, startX, startWidth } = resizingRef.current;
            const delta = ev.clientX - startX;
            const newWidth = Math.max(COLUMNS[colIdx].min, startWidth + delta);
            setColWidths(prev => {
                const next = [...prev];
                next[colIdx] = newWidth;
                return next;
            });
        };

        const onMouseUp = () => {
            resizingRef.current = null;
            setIsResizing(false);
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }, []);

    const hasActiveFilters = selectedCategory || selectedStatus || selectedState;

    const resetFilters = () => {
        setSelectedCategory('');
        setSelectedStatus('');
        setSelectedState('');
        setCurrentPage(1);
        setExpandedRow(null);
    };

    // Filter Logic
    const filteredCases = cases.filter(c => {
        const matchesSearch =
            !searchTerm ||
            (c.file_no && c.file_no.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (c.case_name && c.case_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (c.okt_name && c.okt_name.toLowerCase().includes(searchTerm.toLowerCase()));

        let matchesCategory = true;
        if (selectedCategory === 'Kes Dadah') {
            matchesCategory =
                (c.source_folder?.includes('39B') ?? false) ||
                (c.akta?.toUpperCase().includes('DADAH') ?? false) ||
                (c.akta?.toUpperCase().includes('BERBAHAYA') ?? false);
        } else if (selectedCategory) {
            matchesCategory = c.source_folder === selectedCategory;
        }

        const matchesStatus = !selectedStatus || c.status === selectedStatus;
        const matchesState = !selectedState || c.state_desc === selectedState;

        return matchesSearch && matchesCategory && matchesStatus && matchesState;
    });

    // Pagination Logic
    const totalPages = Math.ceil(filteredCases.length / rowsPerPage);
    const startIndex = (currentPage - 1) * rowsPerPage;
    const paginatedCases = filteredCases.slice(startIndex, startIndex + rowsPerPage);

    const handlePageChange = (page: number) => {
        if (page >= 1 && page <= totalPages) {
            setCurrentPage(page);
            setExpandedRow(null);
        }
    };

    const toggleRow = (id: number) => {
        setExpandedRow(expandedRow === id ? null : id);
    };

    return (
        <div className="flex flex-col h-full bg-white rounded-lg shadow-sm border border-gray-200">
            {/* Controls */}
            <div className="p-3 border-b border-gray-200 flex flex-wrap gap-2 justify-between items-center bg-gray-50/50">
                <div className="flex items-center gap-2">
                    <div className="relative w-64">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-4 w-4 text-gray-400" />
                        </div>
                        <input
                            type="text"
                            className="block w-full pl-9 pr-3 py-1.5 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-purple-500 focus:border-purple-500 text-sm transition duration-150 ease-in-out"
                            placeholder="Carian..."
                            value={searchTerm}
                            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); setExpandedRow(null); }}
                        />
                    </div>
                    <select
                        className={`border rounded-md px-2 py-1.5 text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 bg-white ${selectedCategory ? 'border-purple-400 text-purple-700' : 'border-gray-300 text-gray-700'}`}
                        value={selectedCategory}
                        onChange={(e) => { setSelectedCategory(e.target.value); setCurrentPage(1); setExpandedRow(null); }}
                    >
                        <option value="">Semua Kategori</option>
                        <option value="Kes Dadah">Kes Dadah</option>
                        {categories.map((cat) => (
                            <option key={cat.value} value={cat.value}>{cat.label}</option>
                        ))}
                    </select>
                    <select
                        className={`border rounded-md px-2 py-1.5 text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 bg-white ${selectedStatus ? 'border-purple-400 text-purple-700' : 'border-gray-300 text-gray-700'}`}
                        value={selectedStatus}
                        onChange={(e) => { setSelectedStatus(e.target.value); setCurrentPage(1); setExpandedRow(null); }}
                    >
                        <option value="">Semua Status</option>
                        <option value="SELESAI">Selesai</option>
                        <option value="BELUM SELESAI">Belum Selesai</option>
                    </select>
                    <select
                        className={`border rounded-md px-2 py-1.5 text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 bg-white ${selectedState ? 'border-purple-400 text-purple-700' : 'border-gray-300 text-gray-700'}`}
                        value={selectedState}
                        onChange={(e) => { setSelectedState(e.target.value); setCurrentPage(1); setExpandedRow(null); }}
                    >
                        <option value="">Semua Negeri</option>
                        {states.map((state) => (
                            <option key={state} value={state}>{state}</option>
                        ))}
                    </select>
                    {hasActiveFilters && (
                        <button
                            onClick={resetFilters}
                            className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-purple-600 hover:text-purple-800 hover:bg-purple-50 rounded-md transition-colors"
                        >
                            <X className="h-3 w-3" />
                            Reset
                        </button>
                    )}
                </div>
                <div className="flex items-center space-x-2 text-sm text-gray-600">
                    <span>Papar:</span>
                    <select
                        className="border border-gray-300 rounded p-1 focus:outline-none focus:border-purple-500 bg-white text-sm"
                        value={rowsPerPage}
                        onChange={(e) => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); setExpandedRow(null); }}
                    >
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                    </select>
                </div>
            </div>

            {/* Table */}
            <div className={`overflow-x-auto flex-1${isResizing ? ' cursor-col-resize select-none' : ''}`}>
                <table className="min-w-full divide-y divide-gray-200" style={{ tableLayout: 'fixed' }}>
                    <colgroup>
                        {COLUMNS.map((_, i) => (
                            <col key={i} style={{ width: colWidths[i] }} />
                        ))}
                        <col />
                    </colgroup>
                    <thead className="bg-purple-50 sticky top-0 z-10 shadow-sm">
                        <tr>
                            {COLUMNS.map((col, i) => (
                                <th
                                    key={i}
                                    scope="col"
                                    className={`py-2.5 text-left text-xs font-bold text-gray-600 uppercase tracking-wider relative${i === COLUMNS.length - 1 ? ' text-center' : ''}${col.resizable ? ' border-r border-purple-200' : ''}`}
                                >
                                    <span className="px-3 block truncate overflow-hidden">{col.label}</span>
                                    {col.resizable && (
                                        <div
                                            className="absolute top-0 -right-1.5 h-full w-3 cursor-col-resize z-10 group/resize flex items-center justify-center"
                                            onMouseDown={(e) => startResize(e, i)}
                                        >
                                            <div className="w-0.5 h-4 rounded-full bg-transparent group-hover/resize:bg-purple-500 transition-colors" />
                                        </div>
                                    )}
                                </th>
                            ))}
                            <th />
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {paginatedCases.map((c) => (
                            <Fragment key={c.id}>
                                <tr
                                    className="hover:bg-purple-50/50 transition-colors group cursor-pointer"
                                    onClick={() => toggleRow(c.id)}
                                >
                                    <td className="px-1 py-2.5 text-center align-top">
                                        {expandedRow === c.id
                                            ? <ChevronUp className="w-4 h-4 text-gray-400 inline" />
                                            : <ChevronDown className="w-4 h-4 text-gray-400 inline" />
                                        }
                                    </td>
                                    <td className="px-3 py-2.5 text-sm text-purple-700 font-semibold align-top max-w-0">
                                        <span className={expandedRow === c.id ? 'whitespace-normal wrap-break-word' : 'block truncate'}>{c.file_no}</span>
                                    </td>
                                    <td className="px-3 py-2.5 text-sm text-gray-600 align-top max-w-0">
                                        <span className={expandedRow === c.id ? '' : 'block truncate'}>{c.case_name}</span>
                                    </td>
                                    <td className="px-3 py-2.5 text-sm text-gray-800 align-top max-w-0">
                                        <span className={expandedRow === c.id ? '' : 'block truncate'}>{c.okt_name}</span>
                                    </td>
                                    <td className="px-3 py-2.5 text-sm text-gray-600 align-top max-w-0">
                                        <span className={expandedRow === c.id ? 'whitespace-normal' : 'block truncate'}>{c.file_open_date ? new Date(c.file_open_date).toLocaleDateString('ms-MY') : '-'}</span>
                                    </td>
                                    <td className="px-3 py-2.5 text-sm text-gray-600 align-top max-w-0">
                                        <span className={expandedRow === c.id ? '' : 'block truncate'}>{c.court_desc}</span>
                                    </td>
                                    <td className="px-3 py-2.5 text-sm text-gray-600 align-top max-w-0">
                                        <span className={expandedRow === c.id ? '' : 'block truncate'}>{c.akta}</span>
                                    </td>
                                    <td className="px-3 py-2.5 text-sm text-gray-600 align-top max-w-0">
                                        <span className={expandedRow === c.id ? '' : 'block truncate'}>{c.seksyen}</span>
                                    </td>
                                    <td className="px-3 py-2.5 align-top max-w-0">
                                        <span className={`px-1.5 py-0.5 inline-flex text-[11px] leading-4 font-semibold rounded-full ${c.status === 'SELESAI' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                            {c.status}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2.5 whitespace-nowrap text-center align-top">
                                        <Link
                                            href={`/cases/${c.id}`}
                                            className="text-gray-400 group-hover:text-purple-600 inline-flex items-center justify-center w-7 h-7 rounded-full hover:bg-purple-100 transition-colors"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <Eye className="w-4 h-4" />
                                        </Link>
                                    </td>
                                    <td />
                                </tr>
                            </Fragment>
                        ))}
                    </tbody>
                </table>
                {filteredCases.length === 0 && (
                    <div className="text-center py-12 text-gray-500 text-sm italic">
                        Tiada rekod dijumpai untuk carian ini.
                    </div>
                )}
            </div>

            {/* Pagination Controls */}
            <div className="px-4 py-2 border-t border-gray-200 bg-gray-50 flex items-center justify-between sm:px-4">
                <div className="flex-1 flex justify-between sm:hidden">
                    <button
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={currentPage === 1}
                        className="relative inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                    >
                        Previous
                    </button>
                    <button
                        onClick={() => handlePageChange(currentPage + 1)}
                        disabled={currentPage >= totalPages || totalPages === 0}
                        className="relative inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                    >
                        Next
                    </button>
                </div>
                <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                    <div>
                        <p className="text-xs text-gray-500">
                            Paparan <span className="font-medium">{filteredCases.length > 0 ? startIndex + 1 : 0}</span> - <span className="font-medium">{Math.min(startIndex + rowsPerPage, filteredCases.length)}</span> dari <span className="font-medium">{filteredCases.length}</span>
                        </p>
                    </div>
                    <div>
                        <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                            <button
                                onClick={() => handlePageChange(1)}
                                disabled={currentPage === 1}
                                className="relative inline-flex items-center px-2 py-1.5 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                            >
                                <ChevronsLeft className="h-3.5 w-3.5" />
                            </button>
                            <button
                                onClick={() => handlePageChange(currentPage - 1)}
                                disabled={currentPage === 1}
                                className="relative inline-flex items-center px-2 py-1.5 border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                            >
                                <ChevronLeft className="h-3.5 w-3.5" />
                            </button>
                            <span className="relative inline-flex items-center px-3 py-1.5 border border-gray-300 bg-white text-sm font-medium text-gray-700">
                                {currentPage} / {totalPages || 1}
                            </span>
                            <button
                                onClick={() => handlePageChange(currentPage + 1)}
                                disabled={currentPage >= totalPages || totalPages === 0}
                                className="relative inline-flex items-center px-2 py-1.5 border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                            >
                                <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                            <button
                                onClick={() => handlePageChange(totalPages)}
                                disabled={currentPage >= totalPages || totalPages === 0}
                                className="relative inline-flex items-center px-2 py-1.5 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                            >
                                <ChevronsRight className="h-3.5 w-3.5" />
                            </button>
                        </nav>
                    </div>
                </div>
            </div>
        </div>
    );
}
