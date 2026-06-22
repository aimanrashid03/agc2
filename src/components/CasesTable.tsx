'use client';

import Link from 'next/link';
import { Eye, Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ChevronDown, ChevronUp, X, SlidersHorizontal } from 'lucide-react';
import { useState, useRef, useCallback, useEffect, useMemo, Fragment } from 'react';
import { CaseListItem } from '@/types';
import ExportPDFButton from '@/components/ExportPDFButton';

interface CategoryOption {
    value: string;
    label: string;
}

interface CasesTableProps {
    cases: CaseListItem[];
    categories: CategoryOption[];
    states: string[];
    selectedCaseIds?: number[];
    onSelectedCasesChange?: (selectedIds: number[]) => void;
}

type SortField =
    | 'file_no'
    | 'case_name'
    | 'okt_name'
    | 'file_open_date'
    | 'court_desc'
    | 'akta'
    | 'seksyen'
    | 'status';

type SortDirection = 'asc' | 'desc';

// Column definitions: label, initial width (px), min width (px), resizable
const COLUMNS = [
    { label: '',               width: 40,  min: 40,  resizable: false },
    { label: 'No. Fail',       width: 112, min: 40,  resizable: true  },
    { label: 'Nama Kes',       width: 192, min: 40,  resizable: true  },
    { label: 'Nama OKT',       width: 160, min: 40,  resizable: true  },
    { label: 'Tarikh Buka',    width: 96,  min: 40,  resizable: true  },
    { label: 'Mahkamah',       width: 160, min: 40,  resizable: true  },
    { label: 'Akta',           width: 128, min: 40,  resizable: true  },
    { label: 'Seksyen',        width: 96,  min: 40,  resizable: true  },
    { label: 'Status Laporan', width: 100, min: 40,  resizable: true  },
    { label: 'Tindakan',       width: 88,  min: 88,  resizable: false },
];

const SORTABLE_COLUMN_MAP: Record<number, SortField | null> = {
    0: null,
    1: 'file_no',
    2: 'case_name',
    3: 'okt_name',
    4: 'file_open_date',
    5: 'court_desc',
    6: 'akta',
    7: 'seksyen',
    8: 'status',
    9: null,
};

// Render a cell value, falling back to a muted dash for empty/placeholder data.
function display(value?: string | null): string {
    return value && value.trim() ? value : '-';
}

// Malaysian court hierarchy, apex-first — used to derive a "Jenis Mahkamah" type from the
// free-text court_desc (e.g. "MAHKAMAH TINGGI SHAH ALAM" → "Mahkamah Tinggi"). Sesyen +
// Majistret are grouped under the umbrella "Mahkamah Rendah" (subordinate courts).
const COURT_TYPE_ORDER = ['Mahkamah Persekutuan', 'Mahkamah Rayuan', 'Mahkamah Tinggi', 'Mahkamah Rendah'] as const;

function courtTypeOf(desc?: string | null): string | null {
    const d = (desc ?? '').toUpperCase();
    if (d.startsWith('MAHKAMAH PERSEKUTUAN')) return 'Mahkamah Persekutuan';
    if (d.startsWith('MAHKAMAH RAYUAN')) return 'Mahkamah Rayuan';
    if (d.startsWith('MAHKAMAH TINGGI')) return 'Mahkamah Tinggi';
    if (d.startsWith('MAHKAMAH SESYEN') || d.startsWith('MAHKAMAH MAJISTRET')) return 'Mahkamah Rendah';
    return null;
}

export default function CasesTable({ cases, categories, states, selectedCaseIds = [], onSelectedCasesChange }: CasesTableProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [expandedRow, setExpandedRow] = useState<number | null>(null);
    const [selectedCategory, setSelectedCategory] = useState('');
    const [selectedStatus, setSelectedStatus] = useState('');
    const [selectedState, setSelectedState] = useState('');
    const [selectedCourtType, setSelectedCourtType] = useState('');
    const [selectedCourt, setSelectedCourt] = useState('');
    const [selectedAkta, setSelectedAkta] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [filterOpen, setFilterOpen] = useState(false);
    const filterRef = useRef<HTMLDivElement>(null);
    const internalSelectedSet = new Set(selectedCaseIds);
    const [sortField, setSortField] = useState<SortField>('file_open_date');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

    // Column resize state
    const [colWidths, setColWidths] = useState<number[]>(COLUMNS.map(c => c.width));
    const [isResizing, setIsResizing] = useState(false);
    const resizingRef = useRef<{ colIdx: number; startX: number; startWidth: number } | null>(null);

    const startResize = useCallback((e: React.MouseEvent, colIdx: number) => {
        e.preventDefault();
        resizingRef.current = { colIdx, startX: e.clientX, startWidth: colWidths[colIdx] };
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
    }, [colWidths]);

    const toggleCaseSelection = (caseId: number, e: React.MouseEvent | React.ChangeEvent<HTMLInputElement>) => {
        e.stopPropagation?.();
        const newSelected = new Set(internalSelectedSet);
        if (newSelected.has(caseId)) {
            newSelected.delete(caseId);
        } else {
            newSelected.add(caseId);
        }
        onSelectedCasesChange?.(Array.from(newSelected));
    };

    const toggleSelectAllOnPage = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newSelected = new Set(internalSelectedSet);
        if (e.target.checked) {
            paginatedCases.forEach(c => newSelected.add(c.id));
        } else {
            paginatedCases.forEach(c => newSelected.delete(c.id));
        }
        onSelectedCasesChange?.(Array.from(newSelected));
    };

    // Distinct filter options derived client-side from the full case list (no extra server round-trip).
    // Court types actually present in the data, shown apex-first.
    const courtTypeOptions = useMemo(() => {
        const present = new Set<string>();
        for (const c of cases) {
            const t = courtTypeOf(c.court_desc);
            if (t) present.add(t);
        }
        return COURT_TYPE_ORDER.filter(t => present.has(t));
    }, [cases]);
    // Specific courts (by location). Drop junk like "Sila pilih.." / blanks (only keep real "MAHKAMAH …"
    // values) and narrow the list to the chosen court type when one is selected.
    const courtOptions = useMemo(
        () => Array.from(new Set(
            cases
                .map(c => c.court_desc)
                .filter((v): v is string => !!v && v.toUpperCase().startsWith('MAHKAMAH'))
                .filter(v => !selectedCourtType || courtTypeOf(v) === selectedCourtType)
        )).sort((a, b) => a.localeCompare(b, 'ms')),
        [cases, selectedCourtType]
    );
    // akta is a comma-joined string_agg of distinct acts — split back into individual acts for the dropdown.
    const aktaOptions = useMemo(() => {
        const set = new Set<string>();
        for (const c of cases) {
            if (!c.akta) continue;
            for (const part of c.akta.split(',')) {
                const t = part.trim();
                if (t && t !== '-') set.add(t);
            }
        }
        return Array.from(set).sort((a, b) => a.localeCompare(b, 'ms'));
    }, [cases]);

    // Close the filter popover on outside click.
    useEffect(() => {
        if (!filterOpen) return;
        const handler = (e: MouseEvent) => {
            if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [filterOpen]);

    const resetPaging = () => { setCurrentPage(1); setExpandedRow(null); };

    const activeFilterCount =
        [selectedCategory, selectedStatus, selectedState, selectedCourtType, selectedCourt, selectedAkta, dateFrom, dateTo].filter(Boolean).length;
    const hasActiveFilters = activeFilterCount > 0;

    const resetFilters = () => {
        setSelectedCategory('');
        setSelectedStatus('');
        setSelectedState('');
        setSelectedCourtType('');
        setSelectedCourt('');
        setSelectedAkta('');
        setDateFrom('');
        setDateTo('');
        resetPaging();
    };

    const getStringValue = (value?: string | null) => (value || '').toString().trim().toLocaleLowerCase('ms');

    const getSortValue = (item: CaseListItem, field: SortField): string | number | null => {
        switch (field) {
            case 'file_open_date':
                return item.file_open_date ? new Date(item.file_open_date).getTime() : null;
            case 'file_no':
                return getStringValue(item.file_no);
            case 'case_name':
                return getStringValue(item.case_name);
            case 'okt_name':
                return getStringValue(item.okt_name);
            case 'court_desc':
                return getStringValue(item.court_desc);
            case 'akta':
                return getStringValue(item.akta);
            case 'seksyen':
                return getStringValue(item.seksyen);
            case 'status':
                return getStringValue(item.status);
            default:
                return null;
        }
    };

    const handleSort = (field: SortField) => {
        setCurrentPage(1);
        setExpandedRow(null);

        if (sortField === field) {
            setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
            return;
        }

        setSortField(field);
        setSortDirection(field === 'file_open_date' ? 'desc' : 'asc');
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
            // Drug cases now live under the "AKTA DADAH BERBAHAYA 1952" source_folder (the old "39B"
            // folder is gone); match on either the folder or the aggregated akta text.
            const folder = c.source_folder?.toUpperCase() ?? '';
            const akta = c.akta?.toUpperCase() ?? '';
            matchesCategory =
                folder.includes('DADAH') || folder.includes('BERBAHAYA') ||
                akta.includes('DADAH') || akta.includes('BERBAHAYA');
        } else if (selectedCategory) {
            matchesCategory = c.source_folder === selectedCategory;
        }

        const matchesStatus = !selectedStatus || c.status === selectedStatus;
        const matchesState = !selectedState || c.state_desc === selectedState;
        const matchesCourtType = !selectedCourtType || courtTypeOf(c.court_desc) === selectedCourtType;
        const matchesCourt = !selectedCourt || c.court_desc === selectedCourt;
        const matchesAkta = !selectedAkta || (c.akta?.toLowerCase().includes(selectedAkta.toLowerCase()) ?? false);

        // file_open_date is an ISO string; its yyyy-mm-dd prefix compares lexically with the <input type=date> values.
        const openDate = c.file_open_date ? c.file_open_date.slice(0, 10) : null;
        const matchesDateFrom = !dateFrom || (openDate !== null && openDate >= dateFrom);
        const matchesDateTo = !dateTo || (openDate !== null && openDate <= dateTo);

        return matchesSearch && matchesCategory && matchesStatus && matchesState
            && matchesCourtType && matchesCourt && matchesAkta && matchesDateFrom && matchesDateTo;
    });

    const sortedCases = [...filteredCases].sort((a, b) => {
        const aValue = getSortValue(a, sortField);
        const bValue = getSortValue(b, sortField);

        if (aValue === bValue) return 0;
        if (aValue === null || aValue === '') return 1;
        if (bValue === null || bValue === '') return -1;

        const comparison =
            typeof aValue === 'number' && typeof bValue === 'number'
                ? aValue - bValue
                : String(aValue).localeCompare(String(bValue), 'ms', { numeric: true, sensitivity: 'base' });

        return sortDirection === 'asc' ? comparison : -comparison;
    });

    // Pagination Logic
    const totalPages = Math.ceil(sortedCases.length / rowsPerPage);
    const startIndex = (currentPage - 1) * rowsPerPage;
    const paginatedCases = sortedCases.slice(startIndex, startIndex + rowsPerPage);

    const handlePageChange = (page: number) => {
        if (page >= 1 && page <= totalPages) {
            setCurrentPage(page);
            setExpandedRow(null);
        }
    };

    const toggleRow = (id: number) => {
        setExpandedRow(expandedRow === id ? null : id);
    };

    const handleRowKeyDown = (e: React.KeyboardEvent, id: number) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleRow(id);
        }
    };

    const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1';

    const filterSelectCls = (active: boolean) =>
        `w-full border rounded-md px-2 py-1.5 text-sm bg-white focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 ${focusRing} ${active ? 'border-primary-400 text-primary-700' : 'border-gray-300 text-gray-700'}`;

    // Active-filter chips shown under the toolbar — each removable; reuses the same setters as the panel.
    const statusLabel = (s: string) => (s === 'SELESAI' ? 'Selesai' : 'Belum Selesai');
    const categoryLabel = (v: string) => categories.find(c => c.value === v)?.label ?? v;
    const dateChipLabel = () => (dateFrom && dateTo ? `${dateFrom} – ${dateTo}` : dateFrom ? `≥ ${dateFrom}` : `≤ ${dateTo}`);
    const filterChips: { key: string; label: string; onClear: () => void }[] = [];
    if (selectedCategory) filterChips.push({ key: 'cat', label: `Kategori: ${categoryLabel(selectedCategory)}`, onClear: () => { setSelectedCategory(''); resetPaging(); } });
    if (selectedStatus) filterChips.push({ key: 'status', label: `Status: ${statusLabel(selectedStatus)}`, onClear: () => { setSelectedStatus(''); resetPaging(); } });
    if (selectedState) filterChips.push({ key: 'state', label: `Negeri: ${selectedState}`, onClear: () => { setSelectedState(''); resetPaging(); } });
    if (selectedCourtType) filterChips.push({ key: 'courtType', label: `Jenis Mahkamah: ${selectedCourtType}`, onClear: () => { setSelectedCourtType(''); resetPaging(); } });
    if (selectedCourt) filterChips.push({ key: 'court', label: `Mahkamah: ${selectedCourt}`, onClear: () => { setSelectedCourt(''); resetPaging(); } });
    if (selectedAkta) filterChips.push({ key: 'akta', label: `Akta: ${selectedAkta}`, onClear: () => { setSelectedAkta(''); resetPaging(); } });
    if (dateFrom || dateTo) filterChips.push({ key: 'date', label: `Tarikh: ${dateChipLabel()}`, onClear: () => { setDateFrom(''); setDateTo(''); resetPaging(); } });

    return (
        <div className="flex flex-col h-full bg-white rounded-lg shadow-sm border border-gray-200">
            {/* Controls */}
            <div className="p-3 border-b border-gray-200 flex flex-wrap gap-2 justify-between items-center bg-gray-50/50">
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative w-64">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-4 w-4 text-gray-400" />
                        </div>
                        <input
                            type="text"
                            aria-label="Cari mengikut no. fail, nama kes atau nama OKT"
                            className={`block w-full pl-9 pr-3 py-1.5 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-primary-500 focus:border-primary-500 text-sm transition duration-150 ease-in-out ${focusRing}`}
                            placeholder="Carian..."
                            value={searchTerm}
                            onChange={(e) => { setSearchTerm(e.target.value); resetPaging(); }}
                        />
                    </div>

                    {/* Consolidated advanced-filter popover */}
                    <div className="relative" ref={filterRef}>
                        <button
                            type="button"
                            onClick={() => setFilterOpen(o => !o)}
                            aria-expanded={filterOpen}
                            aria-label="Penapis lanjutan"
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border transition-colors ${focusRing} ${hasActiveFilters ? 'border-primary-400 text-primary-700 bg-primary-50 hover:bg-primary-100' : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50'}`}
                        >
                            <SlidersHorizontal className="h-4 w-4" />
                            Penapis
                            {activeFilterCount > 0 && (
                                <span className="ml-0.5 inline-flex items-center justify-center min-w-5 h-5 px-1 text-xs font-semibold text-white bg-primary-600 rounded-full">
                                    {activeFilterCount}
                                </span>
                            )}
                        </button>

                        {filterOpen && (
                            <div className="absolute left-0 top-full mt-2 z-30 w-140 max-w-[90vw] bg-white border border-gray-200 rounded-lg shadow-lg p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-sm font-semibold text-gray-800">Penapis Lanjutan</h3>
                                    {hasActiveFilters && (
                                        <button
                                            type="button"
                                            onClick={resetFilters}
                                            className={`inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-800 rounded ${focusRing}`}
                                        >
                                            <X className="h-3 w-3" /> Set Semula
                                        </button>
                                    )}
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-500 mb-1">Kategori</label>
                                        <select aria-label="Tapis mengikut kategori" className={filterSelectCls(!!selectedCategory)} value={selectedCategory} onChange={(e) => { setSelectedCategory(e.target.value); resetPaging(); }}>
                                            <option value="">Semua Kategori</option>
                                            <option value="Kes Dadah">Kes Dadah</option>
                                            {categories.map((cat) => (<option key={cat.value} value={cat.value}>{cat.label}</option>))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-500 mb-1">Status Laporan</label>
                                        <select aria-label="Tapis mengikut status" className={filterSelectCls(!!selectedStatus)} value={selectedStatus} onChange={(e) => { setSelectedStatus(e.target.value); resetPaging(); }}>
                                            <option value="">Semua Status</option>
                                            <option value="SELESAI">Selesai</option>
                                            <option value="BELUM SELESAI">Belum Selesai</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-500 mb-1">Negeri</label>
                                        <select aria-label="Tapis mengikut negeri" className={filterSelectCls(!!selectedState)} value={selectedState} onChange={(e) => { setSelectedState(e.target.value); resetPaging(); }}>
                                            <option value="">Semua Negeri</option>
                                            {states.map((state) => (<option key={state} value={state}>{state}</option>))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-500 mb-1">Jenis Mahkamah</label>
                                        <select aria-label="Tapis mengikut jenis mahkamah" className={filterSelectCls(!!selectedCourtType)} value={selectedCourtType} onChange={(e) => { setSelectedCourtType(e.target.value); setSelectedCourt(''); resetPaging(); }}>
                                            <option value="">Semua Jenis</option>
                                            {courtTypeOptions.map((t) => (<option key={t} value={t}>{t}</option>))}
                                        </select>
                                    </div>
                                    <div className="sm:col-span-2">
                                        <label className="block text-xs font-medium text-gray-500 mb-1">Mahkamah (Lokasi)</label>
                                        <select aria-label="Tapis mengikut mahkamah" className={filterSelectCls(!!selectedCourt)} value={selectedCourt} onChange={(e) => { setSelectedCourt(e.target.value); resetPaging(); }}>
                                            <option value="">Semua Mahkamah</option>
                                            {courtOptions.map((court) => (<option key={court} value={court}>{court}</option>))}
                                        </select>
                                    </div>
                                    <div className="sm:col-span-2">
                                        <label className="block text-xs font-medium text-gray-500 mb-1">Akta</label>
                                        <select aria-label="Tapis mengikut akta" className={filterSelectCls(!!selectedAkta)} value={selectedAkta} onChange={(e) => { setSelectedAkta(e.target.value); resetPaging(); }}>
                                            <option value="">Semua Akta</option>
                                            {aktaOptions.map((akta) => (<option key={akta} value={akta}>{akta}</option>))}
                                        </select>
                                    </div>
                                    <div className="sm:col-span-2">
                                        <label className="block text-xs font-medium text-gray-500 mb-1">Tarikh Buka</label>
                                        <div className="flex items-center gap-2">
                                            <input type="date" aria-label="Tarikh buka dari" className={filterSelectCls(!!dateFrom)} value={dateFrom} max={dateTo || undefined} onChange={(e) => { setDateFrom(e.target.value); resetPaging(); }} />
                                            <span className="text-gray-400 text-sm shrink-0">—</span>
                                            <input type="date" aria-label="Tarikh buka hingga" className={filterSelectCls(!!dateTo)} value={dateTo} min={dateFrom || undefined} onChange={(e) => { setDateTo(e.target.value); resetPaging(); }} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                <div className="flex items-center space-x-2 text-sm text-gray-600">
                    <span>Papar:</span>
                    <select
                        aria-label="Bilangan baris setiap halaman"
                        className={`border border-gray-300 rounded p-1 focus:outline-none focus:border-primary-500 bg-white text-sm ${focusRing}`}
                        value={rowsPerPage}
                        onChange={(e) => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); setExpandedRow(null); }}
                    >
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                    </select>
                </div>
            </div>

            {/* Active filter chips */}
            {filterChips.length > 0 && (
                <div className="px-3 py-2 border-b border-gray-200 bg-gray-50/50 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-gray-500">Penapis aktif:</span>
                    {filterChips.map((chip) => (
                        <span key={chip.key} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 text-xs font-medium text-primary-700 bg-primary-100 rounded-full">
                            <span className="max-w-50 truncate">{chip.label}</span>
                            <button
                                type="button"
                                onClick={chip.onClear}
                                aria-label={`Buang penapis ${chip.label}`}
                                className={`p-0.5 rounded-full hover:bg-primary-200 transition-colors ${focusRing}`}
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </span>
                    ))}
                    <button
                        type="button"
                        onClick={resetFilters}
                        className={`ml-1 text-xs font-medium text-primary-600 hover:text-primary-800 rounded ${focusRing}`}
                    >
                        Kosongkan semua
                    </button>
                </div>
            )}

            {/* Table */}
            <div className={`overflow-x-auto flex-1${isResizing ? ' cursor-col-resize select-none' : ''}`}>
                <table className="min-w-full divide-y divide-gray-200" style={{ tableLayout: 'fixed' }}>
                    <caption className="sr-only">Senarai Laporan Kes Kehakiman — jadual boleh diisih dan ditapis</caption>
                    <colgroup>
                        {COLUMNS.map((_, i) => (
                            <col key={i} style={{ width: colWidths[i] }} />
                        ))}
                        <col />
                    </colgroup>
                    <thead className="bg-primary-50 sticky top-0 z-10 shadow-sm">
                        <tr>
                            {COLUMNS.map((col, i) => (
                                <th
                                    key={i}
                                    scope="col"
                                    className={`py-2.5 text-left text-xs font-bold text-gray-600 uppercase tracking-wider relative${i === COLUMNS.length - 1 ? ' text-center' : ''}${col.resizable ? ' border-r border-primary-200' : ''}`}
                                >
                                    {i === 0 ? (
                                        <div className="px-3 flex items-center justify-center">
                                            <input
                                                type="checkbox"
                                                aria-label="Pilih semua kes pada halaman ini"
                                                checked={paginatedCases.length > 0 && paginatedCases.every(c => internalSelectedSet.has(c.id))}
                                                onChange={toggleSelectAllOnPage}
                                                className={`h-4 w-4 rounded border-gray-300 cursor-pointer ${focusRing}`}
                                            />
                                        </div>
                                    ) : (
                                        (() => {
                                            const sortableField = SORTABLE_COLUMN_MAP[i];
                                            const isActiveSort = sortableField === sortField;

                                            if (!sortableField) {
                                                return <span className="px-2 block truncate overflow-hidden text-center">{col.label}</span>;
                                            }

                                            return (
                                                <button
                                                    type="button"
                                                    onClick={() => handleSort(sortableField)}
                                                    className={`px-3 w-full flex items-center justify-between gap-1 text-left hover:text-primary-700 transition-colors ${focusRing}`}
                                                    aria-label={`Isih mengikut ${col.label}`}
                                                >
                                                    <span className="block truncate overflow-hidden">{col.label}</span>
                                                    <span className="shrink-0">
                                                        {isActiveSort ? (
                                                            sortDirection === 'asc' ? (
                                                                <ChevronUp className="h-3.5 w-3.5" />
                                                            ) : (
                                                                <ChevronDown className="h-3.5 w-3.5" />
                                                            )
                                                        ) : (
                                                            <ChevronDown className="h-3.5 w-3.5 opacity-30" />
                                                        )}
                                                    </span>
                                                </button>
                                            );
                                        })()
                                    )}
                                    {col.resizable && (
                                        <div
                                            className="absolute top-0 -right-1.5 h-full w-3 cursor-col-resize z-10 group/resize flex items-center justify-center"
                                            onMouseDown={(e) => startResize(e, i)}
                                        >
                                            <div className="w-0.5 h-4 rounded-full bg-transparent group-hover/resize:bg-primary-500 transition-colors" />
                                        </div>
                                    )}
                                </th>
                            ))}
                            <th />
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {paginatedCases.map((c) => {
                            const isSelected = internalSelectedSet.has(c.id);
                            const isExpanded = expandedRow === c.id;
                            return (
                                <Fragment key={c.id}>
                                    <tr
                                        className={`transition-colors group cursor-pointer ${focusRing} focus-visible:ring-inset ${isSelected ? 'bg-primary-50' : 'hover:bg-primary-50/50'}`}
                                        onClick={() => toggleRow(c.id)}
                                        onKeyDown={(e) => handleRowKeyDown(e, c.id)}
                                        tabIndex={0}
                                        aria-expanded={isExpanded}
                                        aria-label={`Kes ${display(c.file_no)}. Tekan Enter untuk ${isExpanded ? 'tutup' : 'papar penuh'}.`}
                                    >
                                        <td className="px-1 py-2.5 text-center align-top" onClick={(e) => e.stopPropagation()}>
                                            <input
                                                type="checkbox"
                                                aria-label={`Pilih kes ${display(c.file_no)}`}
                                                checked={isSelected}
                                                onChange={(e) => toggleCaseSelection(c.id, e)}
                                                className={`h-4 w-4 rounded border-gray-300 cursor-pointer ${focusRing}`}
                                            />
                                        </td>
                                        <td className="px-3 py-2.5 text-sm text-primary-700 font-semibold align-top max-w-0">
                                            <span className={isExpanded ? 'whitespace-normal wrap-break-word' : 'block truncate'} title={c.file_no ?? undefined}>{display(c.file_no)}</span>
                                        </td>
                                        <td className="px-3 py-2.5 text-sm text-gray-600 align-top max-w-0">
                                            <span className={isExpanded ? '' : 'block truncate'} title={c.case_name ?? undefined}>{display(c.case_name)}</span>
                                        </td>
                                        <td className="px-3 py-2.5 text-sm text-gray-800 align-top max-w-0">
                                            <span className={isExpanded ? '' : 'block truncate'} title={c.okt_name ?? undefined}>{display(c.okt_name)}</span>
                                        </td>
                                        <td className="px-3 py-2.5 text-sm text-gray-600 align-top max-w-0">
                                            <span className={isExpanded ? 'whitespace-normal' : 'block truncate'}>{c.file_open_date ? new Date(c.file_open_date).toLocaleDateString('ms-MY') : '-'}</span>
                                        </td>
                                        <td className="px-3 py-2.5 text-sm text-gray-600 align-top max-w-0">
                                            <span className={isExpanded ? '' : 'block truncate'} title={c.court_desc ?? undefined}>{display(c.court_desc)}</span>
                                        </td>
                                        <td className="px-3 py-2.5 text-sm text-gray-600 align-top max-w-0">
                                            <span className={isExpanded ? '' : 'block truncate'} title={c.akta ?? undefined}>{display(c.akta)}</span>
                                        </td>
                                        <td className="px-3 py-2.5 text-sm text-gray-600 align-top max-w-0">
                                            <span className={isExpanded ? '' : 'block truncate'} title={c.seksyen ?? undefined}>{display(c.seksyen)}</span>
                                        </td>
                                        <td className="px-3 py-2.5 align-top max-w-0">
                                            <span className={`px-1.5 py-0.5 inline-flex text-[11px] leading-4 font-semibold rounded-full ${c.status === 'SELESAI' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                                {display(c.status)}
                                            </span>
                                        </td>
                                        <td className="px-1 py-2.5 whitespace-nowrap align-top" onClick={(e) => e.stopPropagation()}>
                                            <div className="flex items-center justify-center gap-1">
                                                <Link
                                                    href={`/cases/${c.id}`}
                                                    aria-label={`Papar butiran kes ${display(c.file_no)}`}
                                                    className={`text-gray-400 group-hover:text-primary-600 inline-flex items-center justify-center w-7 h-7 rounded-full hover:bg-primary-100 transition-colors ${focusRing}`}
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <Eye className="w-4 h-4" />
                                                </Link>
                                                <ExportPDFButton
                                                    caseId={String(c.id)}
                                                    fileName={c.file_no || `kes_${c.id}`}
                                                    variant="icon"
                                                    className="text-gray-500 group-hover:text-green-700"
                                                />
                                            </div>
                                        </td>
                                        <td />
                                    </tr>
                                </Fragment>
                            );
                        })}
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
                        className={`relative inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 ${focusRing}`}
                    >
                        Sebelumnya
                    </button>
                    <button
                        onClick={() => handlePageChange(currentPage + 1)}
                        disabled={currentPage >= totalPages || totalPages === 0}
                        className={`relative inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 ${focusRing}`}
                    >
                        Seterusnya
                    </button>
                </div>
                <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                    <div>
                        <p className="text-xs text-gray-500">
                            Paparan <span className="font-medium">{filteredCases.length > 0 ? startIndex + 1 : 0}</span> - <span className="font-medium">{Math.min(startIndex + rowsPerPage, filteredCases.length)}</span> dari <span className="font-medium">{filteredCases.length}</span>
                        </p>
                    </div>
                    <div>
                        <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Penomboran halaman">
                            <button
                                onClick={() => handlePageChange(1)}
                                disabled={currentPage === 1}
                                aria-label="Halaman pertama"
                                className={`relative inline-flex items-center px-2 py-1.5 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 ${focusRing}`}
                            >
                                <ChevronsLeft className="h-3.5 w-3.5" />
                            </button>
                            <button
                                onClick={() => handlePageChange(currentPage - 1)}
                                disabled={currentPage === 1}
                                aria-label="Halaman sebelumnya"
                                className={`relative inline-flex items-center px-2 py-1.5 border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 ${focusRing}`}
                            >
                                <ChevronLeft className="h-3.5 w-3.5" />
                            </button>
                            <span className="relative inline-flex items-center px-3 py-1.5 border border-gray-300 bg-white text-sm font-medium text-gray-700" aria-current="page">
                                {currentPage} / {totalPages || 1}
                            </span>
                            <button
                                onClick={() => handlePageChange(currentPage + 1)}
                                disabled={currentPage >= totalPages || totalPages === 0}
                                aria-label="Halaman seterusnya"
                                className={`relative inline-flex items-center px-2 py-1.5 border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 ${focusRing}`}
                            >
                                <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                            <button
                                onClick={() => handlePageChange(totalPages)}
                                disabled={currentPage >= totalPages || totalPages === 0}
                                aria-label="Halaman terakhir"
                                className={`relative inline-flex items-center px-2 py-1.5 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 ${focusRing}`}
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
