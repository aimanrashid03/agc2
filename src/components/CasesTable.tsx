'use client';

import Link from 'next/link';
import { Eye, Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { useState } from 'react';
import { Case } from '@/types';

export default function CasesTable({ cases }: { cases: Case[] }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(10);

    // Filter Logic
    const filteredCases = cases.filter(c =>
        (c.file_no && c.file_no.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (c.case_name && c.case_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (c.okt_name && c.okt_name.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    // Pagination Logic
    const totalPages = Math.ceil(filteredCases.length / rowsPerPage);
    const startIndex = (currentPage - 1) * rowsPerPage;
    const paginatedCases = filteredCases.slice(startIndex, startIndex + rowsPerPage);

    const handlePageChange = (page: number) => {
        if (page >= 1 && page <= totalPages) {
            setCurrentPage(page);
        }
    };

    return (
        <div className="flex flex-col h-full bg-white rounded-lg shadow-sm border border-gray-200">
            {/* Controls */}
            <div className="p-3 border-b border-gray-200 flex justify-between items-center bg-gray-50/50">
                <div className="relative w-64">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-3.5 w-3.5 text-gray-400" />
                    </div>
                    <input
                        type="text"
                        className="block w-full pl-9 pr-3 py-1.5 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-purple-500 focus:border-purple-500 text-xs transition duration-150 ease-in-out"
                        placeholder="Carian..."
                        value={searchTerm}
                        onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                    />
                </div>
                <div className="flex items-center space-x-2 text-xs text-gray-600">
                    <span>Papar:</span>
                    <select
                        className="border border-gray-300 rounded p-1 focus:outline-none focus:border-purple-500 bg-white"
                        value={rowsPerPage}
                        onChange={(e) => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                    >
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                    </select>
                </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto flex-1">
                <table className="min-w-full divide-y divide-gray-200 table-fixed">
                    <thead className="bg-purple-50 sticky top-0 z-10 shadow-sm">
                        <tr>
                            <th scope="col" className="px-2 py-2 text-left text-[10px] font-bold text-gray-600 uppercase tracking-wider w-28">No. Fail</th>
                            <th scope="col" className="px-2 py-2 text-left text-[10px] font-bold text-gray-600 uppercase tracking-wider w-48">Case Name</th>
                            <th scope="col" className="px-2 py-2 text-left text-[10px] font-bold text-gray-600 uppercase tracking-wider w-40">Nama OKT</th>
                            <th scope="col" className="px-2 py-2 text-left text-[10px] font-bold text-gray-600 uppercase tracking-wider w-24">Tarikh Buka</th>
                            <th scope="col" className="px-2 py-2 text-left text-[10px] font-bold text-gray-600 uppercase tracking-wider w-32">Mahkamah</th>
                            <th scope="col" className="px-2 py-2 text-left text-[10px] font-bold text-gray-600 uppercase tracking-wider w-32">Akta</th>
                            <th scope="col" className="px-2 py-2 text-left text-[10px] font-bold text-gray-600 uppercase tracking-wider w-24">Seksyen</th>
                            <th scope="col" className="px-2 py-2 text-left text-[10px] font-bold text-gray-600 uppercase tracking-wider w-24">Status LKK</th>
                            <th scope="col" className="px-2 py-2 text-center text-[10px] font-bold text-gray-600 uppercase tracking-wider w-12">Papar</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {paginatedCases.map((c) => (
                            <tr key={c.id} className="hover:bg-purple-50/50 transition-colors group">
                                <td className="px-2 py-2 text-[10px] text-purple-700 font-semibold whitespace-normal break-words align-top">
                                    {c.file_no}
                                </td>
                                <td className="px-2 py-2 text-[10px] text-gray-600 whitespace-normal break-words align-top">
                                    {c.case_name}
                                </td>
                                <td className="px-2 py-2 text-[10px] text-gray-800 whitespace-normal break-words align-top">
                                    {c.okt_name}
                                </td>
                                <td className="px-2 py-2 text-[10px] text-gray-600 whitespace-nowrap align-top">
                                    {c.file_open_date ? new Date(c.file_open_date).toLocaleDateString('ms-MY') : '-'}
                                </td>
                                <td className="px-2 py-2 text-[10px] text-gray-600 whitespace-normal break-words align-top">
                                    {c.court_desc}
                                </td>
                                <td className="px-2 py-2 text-[10px] text-gray-600 whitespace-normal break-words align-top">
                                    {c.akta}
                                </td>
                                <td className="px-2 py-2 text-[10px] text-gray-600 whitespace-normal break-words align-top">
                                    {c.seksyen}
                                </td>
                                <td className="px-2 py-2 align-top">
                                    <span className={`px-1.5 py-0.5 inline-flex text-[9px] leading-3 font-semibold rounded-full ${c.status === 'SELESAI' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                                        }`}>
                                        {c.status}
                                    </span>
                                </td>
                                <td className="px-2 py-2 whitespace-nowrap text-center align-top">
                                    <Link href={`/cases/${c.id}`} className="text-gray-400 group-hover:text-purple-600 inline-flex items-center justify-center w-6 h-6 rounded-full hover:bg-purple-100 transition-colors">
                                        <Eye className="w-3.5 h-3.5" />
                                    </Link>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {filteredCases.length === 0 && (
                    <div className="text-center py-12 text-gray-500 text-xs italic">
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
                        className="relative inline-flex items-center px-3 py-1.5 border border-gray-300 text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                    >
                        Previous
                    </button>
                    <button
                        onClick={() => handlePageChange(currentPage + 1)}
                        disabled={currentPage === totalPages}
                        className="relative inline-flex items-center px-3 py-1.5 border border-gray-300 text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                    >
                        Next
                    </button>
                </div>
                <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                    <div>
                        <p className="text-[10px] text-gray-500">
                            Paparan <span className="font-medium">{filteredCases.length > 0 ? startIndex + 1 : 0}</span> - <span className="font-medium">{Math.min(startIndex + rowsPerPage, filteredCases.length)}</span> dari <span className="font-medium">{filteredCases.length}</span>
                        </p>
                    </div>
                    <div>
                        <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                            <button
                                onClick={() => handlePageChange(1)}
                                disabled={currentPage === 1}
                                className="relative inline-flex items-center px-2 py-1.5 rounded-l-md border border-gray-300 bg-white text-xs font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                            >
                                <ChevronsLeft className="h-3 w-3" />
                            </button>
                            <button
                                onClick={() => handlePageChange(currentPage - 1)}
                                disabled={currentPage === 1}
                                className="relative inline-flex items-center px-2 py-1.5 border border-gray-300 bg-white text-xs font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                            >
                                <ChevronLeft className="h-3 w-3" />
                            </button>
                            <span className="relative inline-flex items-center px-3 py-1.5 border border-gray-300 bg-white text-xs font-medium text-gray-700">
                                {currentPage} / {totalPages || 1}
                            </span>
                            <button
                                onClick={() => handlePageChange(currentPage + 1)}
                                disabled={currentPage === totalPages}
                                className="relative inline-flex items-center px-2 py-1.5 border border-gray-300 bg-white text-xs font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                            >
                                <ChevronRight className="h-3 w-3" />
                            </button>
                            <button
                                onClick={() => handlePageChange(totalPages)}
                                disabled={currentPage === totalPages}
                                className="relative inline-flex items-center px-2 py-1.5 rounded-r-md border border-gray-300 bg-white text-xs font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                            >
                                <ChevronsRight className="h-3 w-3" />
                            </button>
                        </nav>
                    </div>
                </div>
            </div>
        </div>
    );
}
