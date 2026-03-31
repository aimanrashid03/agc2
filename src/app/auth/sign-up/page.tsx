'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { ArrowRight, Library, ShieldAlert } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function SignUpPage() {
  const supabase = createClient();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreePolicy, setAgreePolicy] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (password !== confirmPassword) {
      setErrorMessage('Pengesahan kata laluan tidak sepadan.');
      return;
    }

    if (!agreePolicy) {
      setErrorMessage('Sila setuju dengan protokol keselamatan sebelum mendaftar.');
      return;
    }

    setIsSubmitting(true);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/login`,
      },
    });

    setIsSubmitting(false);

    if (error) {
      setErrorMessage(error.message || 'Pendaftaran gagal. Sila cuba lagi.');
      return;
    }

    setSuccessMessage('Pendaftaran berjaya. Sila semak emel untuk pengesahan akaun sebelum log masuk.');
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 sm:p-10 bg-slate-100">
      <div className="auth-enter flex w-full max-w-6xl min-h-[680px] lg:min-h-[760px] bg-white shadow-2xl ring-1 ring-slate-200/70 overflow-hidden lg:flex-row flex-col">
        <section className="hidden lg:flex lg:w-3/5 judicial-wash relative p-14 xl:p-16 flex-col justify-between overflow-hidden">
          <div
            className="absolute inset-0 opacity-10 pointer-events-none bg-cover bg-center grayscale"
            style={{
              backgroundImage:
                "url('https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&q=80&w=1000')",
            }}
            aria-hidden="true"
          />

          <div className="relative z-10">
            <div className="mb-12">
              <Library className="text-white w-16 h-16" />
            </div>
            <h1 className="text-white text-5xl font-black tracking-tight leading-tight max-w-lg">
              AGC
              <br />
              Arkib Kehakiman
            </h1>
            <p className="text-white/75 mt-6 text-lg font-light leading-relaxed max-w-md">
              Pendaftaran ke portal Warisan Lex Scripta dihadkan kepada pegawai AGC yang dibenarkan.
              Setiap pendaftaran akaun direkod dan diaudit.
            </p>
          </div>

          <div className="relative z-10 flex items-center space-x-6">
            <div className="h-px w-12 bg-white/30" />
            <span className="text-white/55 text-xs font-bold uppercase tracking-[0.25em]">
              Warisan Lex Scripta | v4.2.0-STABLE
            </span>
          </div>
        </section>

        <section className="flex-1 flex flex-col justify-center px-8 py-10 sm:px-12 lg:px-16 bg-white">
          <div className="mb-10 lg:hidden flex justify-center">
            <div className="text-primary-800 flex items-center gap-2">
              <Library className="w-8 h-8" />
              <span className="font-black text-xl tracking-tight uppercase">AGC</span>
            </div>
          </div>

          <div className="space-y-8">
            <div>
              <h2 className="text-gray-900 text-3xl font-bold tracking-tight mb-2">Pendaftaran Kredensial</h2>
              <p className="text-slate-500 text-sm font-medium">
                Cipta akaun yang dibenarkan untuk akses daftar kes.
              </p>
            </div>

            <form onSubmit={onSubmit} className="space-y-6">
              <div className="space-y-1">
                <label
                  htmlFor="email"
                  className="block text-[10px] font-extrabold uppercase tracking-[0.2em] text-slate-500/80"
                >
                  Emel Rasmi atau ID
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full border-b-2 border-slate-300 focus:border-primary-700 bg-transparent py-3 text-gray-900 outline-none transition-all placeholder:text-slate-300 font-medium"
                  placeholder="cth. j.doe@agc.gov.my"
                />
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="password"
                  className="block text-[10px] font-extrabold uppercase tracking-[0.2em] text-slate-500/80"
                >
                  Kata Laluan Selamat
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full border-b-2 border-slate-300 focus:border-primary-700 bg-transparent py-3 text-gray-900 outline-none transition-all placeholder:text-slate-300 font-medium"
                  placeholder="Sekurang-kurangnya 8 aksara"
                />
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="confirmPassword"
                  className="block text-[10px] font-extrabold uppercase tracking-[0.2em] text-slate-500/80"
                >
                  Sahkan Kata Laluan
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full border-b-2 border-slate-300 focus:border-primary-700 bg-transparent py-3 text-gray-900 outline-none transition-all placeholder:text-slate-300 font-medium"
                  placeholder="Ulang kata laluan selamat"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <label className="flex items-center cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={agreePolicy}
                    onChange={(e) => setAgreePolicy(e.target.checked)}
                    className="w-4 h-4 border-2 border-slate-300 rounded-none text-primary-700 focus:ring-0"
                  />
                  <span className="ml-2 text-xs font-semibold text-slate-500 group-hover:text-gray-800 transition-colors">
                    Saya bersetuju dengan protokol keselamatan
                  </span>
                </label>
                <span className="text-xs font-bold text-primary-700 opacity-70">Polisi Diperlukan</span>
              </div>

              {errorMessage ? (
                <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                  {errorMessage}
                </p>
              ) : null}

              {successMessage ? (
                <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">
                  {successMessage}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-primary-700 text-white font-bold py-4 mt-4 transition-all hover:bg-primary-800 active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-3"
              >
                <span>{isSubmitting ? 'SEDANG MENDAFTAR...' : 'DAFTAR AKAUN'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            <div className="p-5 bg-red-50 border-l-4 border-red-700">
              <div className="flex gap-3">
                <ShieldAlert className="text-red-700 w-5 h-5 flex-shrink-0" />
                <div>
                  <h4 className="text-red-900 text-xs font-black uppercase tracking-wider mb-1">
                    Amaran Keselamatan
                  </h4>
                  <p className="text-red-900/80 text-xs leading-relaxed">
                    Ini ialah sistem kerajaan yang selamat. Cubaan pendaftaran akaun tanpa kebenaran
                    dipantau dan boleh didakwa di bawah undang-undang yang berkuat kuasa.
                  </p>
                </div>
              </div>
            </div>

            <p className="text-sm text-gray-600">
              Sudah ada akaun?{' '}
              <Link href="/auth/login" className="text-primary-700 hover:text-primary-800 font-semibold">
                Log masuk di sini
              </Link>
            </p>
          </div>

          <div className="mt-10 lg:mt-auto pt-8 flex flex-col sm:flex-row gap-6 justify-between border-t border-slate-100">
            <div className="flex gap-4">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.18em]">Pusat Bantuan</span>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.18em]">Protokol Privasi</span>
            </div>
            <div className="text-[10px] font-bold text-slate-300 uppercase tracking-[0.18em] flex items-center gap-2">
              <span className="w-3 h-3 border border-slate-300 rounded-full flex items-center justify-center text-[8px]">v</span>
              NOD SELAMAT 71-B
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
