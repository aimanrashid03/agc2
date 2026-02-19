
import Link from 'next/link';

export default function NotFound() {
    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
            <h2 className="text-4xl font-bold text-gray-800 mb-4">404</h2>
            <p className="text-xl text-gray-600 mb-8">Halaman tidak dijumpai</p>
            <Link href="/" className="px-6 py-3 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors">
                Kembali ke Utama
            </Link>
        </div>
    );
}
