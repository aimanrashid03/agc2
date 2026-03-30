import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import {
  ArrowRight,
  Award,
  CalendarDays,
  CheckCircle2,
  Gavel,
  History,
  Library,
  type LucideIcon,
} from 'lucide-react';

type DashboardCase = {
  id: number;
  status: string | null;
  state_desc: string | null;
  source_folder: string | null;
  updated_at: string | null;
  file_open_date: string | null;
  file_no: string | null;
  case_name: string | null;
};

function formatMonthKey(monthKey: string) {
  const [year, month] = monthKey.split('-');
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString('ms-MY', { month: 'short', year: 'numeric' });
}

function normalizeStatus(status: string | null) {
  return (status || '').trim().toUpperCase();
}

function formatActivityTime(dateString: string | null) {
  if (!dateString) {
    return '-';
  }

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return date.toLocaleDateString('ms-MY', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function percent(part: number, total: number) {
  if (total <= 0) {
    return 0;
  }
  return Math.round((part / total) * 1000) / 10;
}

function incrementMapCount(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) || 0) + 1);
}

function getTopEntries(map: Map<string, number>, limit = 4) {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

type MetricCard = {
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
  border: string;
  iconColor: string;
  href: string;
  dark: boolean;
};

function MetricCardLink({ metric }: { metric: MetricCard }) {
  const Icon = metric.icon;

  return (
    <Link
      key={metric.label}
      href={metric.href}
      className={`group block p-5 shadow-sm transition hover:-translate-y-1 ${
        metric.dark ? `${metric.border} text-white` : `border-l-4 bg-white ${metric.border}`
      }`}
    >
      <div className="mb-4 flex items-start justify-between">
        <Icon className={`h-5 w-5 opacity-60 ${metric.iconColor}`} />
        <span
          className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] ${
            metric.dark ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-700'
          }`}
        >
          SEMASA
        </span>
      </div>
      <p className={`text-[11px] font-bold uppercase tracking-[0.18em] ${metric.dark ? 'text-white/70' : 'text-slate-500'}`}>
        {metric.label}
      </p>
      <h3 className={`mt-1 text-3xl font-black tracking-tight ${metric.dark ? 'text-white' : 'text-slate-900'}`}>
        {metric.value}
      </h3>
      <p className={`mt-1 text-xs ${metric.dark ? 'text-white/80' : 'text-slate-500'}`}>{metric.hint}</p>
    </Link>
  );
}

function HealthProgressRow({
  label,
  valueLabel,
  widthPercent,
  barColor,
}: {
  label: string;
  valueLabel: string;
  widthPercent: number;
  barColor: string;
}) {
  return (
    <div>
      <div className="mb-1 flex justify-between">
        <span className="text-[10px] font-bold uppercase text-slate-500">{label}</span>
        <span className="text-[10px] font-bold">{valueLabel}</span>
      </div>
      <div className="h-1 w-full bg-white">
        <div className={`h-full ${barColor}`} style={{ width: `${Math.min(Math.max(widthPercent, 0), 100)}%` }} />
      </div>
    </div>
  );
}

function RankedSummaryList({
  title,
  items,
  className = 'mt-5 text-xs text-slate-600',
}: {
  title: string;
  items: Array<[string, number]>;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="mb-2 font-semibold text-slate-700">{title}</p>
      <div className="space-y-1">
        {items.map(([name, count]) => (
          <p key={name} className="flex items-center justify-between">
            <span className="truncate pr-3">{name}</span>
            <span className="font-bold text-slate-800">{count}</span>
          </p>
        ))}
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('cases')
    .select('id, status, state_desc, source_folder, updated_at, file_open_date, file_no, case_name')
    .order('updated_at', { ascending: false });

  if (error) {
    return (
      <div className="p-4 text-red-700 bg-red-50 border border-red-200 rounded-md">
        Ralat memuatkan data dashboard: {error.message}
      </div>
    );
  }

  const cases = (data ?? []) as DashboardCase[];

  const totalKes = cases.length;
  let selesaiCount = 0;
  let tanpaStatusCount = 0;
  let withOpenDateCount = 0;
  const negeriMap = new Map<string, number>();
  const kategoriMap = new Map<string, number>();
  const bulanMap = new Map<string, number>();
  const aktiviti: DashboardCase[] = [];

  for (const c of cases) {
    const normalizedStatus = normalizeStatus(c.status);
    if (normalizedStatus === 'SELESAI') {
      selesaiCount += 1;
    }
    if (normalizedStatus === '') {
      tanpaStatusCount += 1;
    }

    incrementMapCount(negeriMap, c.state_desc?.trim() || 'Tidak Dinyatakan');
    incrementMapCount(kategoriMap, c.source_folder?.trim() || 'Lain-lain');

    if (c.updated_at && aktiviti.length < 5) {
      aktiviti.push(c);
    }

    if (!c.file_open_date) {
      continue;
    }

    const d = new Date(c.file_open_date);
    if (Number.isNaN(d.getTime())) {
      continue;
    }

    withOpenDateCount += 1;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    incrementMapCount(bulanMap, key);
  }

  const belumSelesaiCount = totalKes - selesaiCount - tanpaStatusCount;
  const negeriTop = getTopEntries(negeriMap, 4);
  const kategoriTop = getTopEntries(kategoriMap, 4);
  const trendBulan = Array.from(bulanMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-6);
  const trendMax = Math.max(...trendBulan.map(([, n]) => n), 1);
  const trendTotal = trendBulan.reduce((sum, [, count]) => sum + count, 0);
  const trendPurata = trendBulan.length > 0 ? trendTotal / trendBulan.length : 0;
  const trendPeak = trendBulan.reduce<[string, number] | null>((current, next) => {
    if (!current || next[1] > current[1]) {
      return next;
    }
    return current;
  }, null);

  const terbaru = cases.slice(0, 6);
  const latestUpdate = cases.find((c) => c.updated_at)?.updated_at || null;

  const resolvedRate = percent(selesaiCount, totalKes);
  const statusCoverage = percent(totalKes - tanpaStatusCount, totalKes);
  const dateCoverage = percent(withOpenDateCount, totalKes);

  const metricCards: MetricCard[] = [
    {
      icon: Library,
      label: 'Jumlah Kes',
      value: totalKes.toLocaleString('ms-MY'),
      hint: `${trendTotal.toLocaleString('ms-MY')} dibuka dalam 6 bulan`,
      border: 'border-primary-700',
      iconColor: 'text-primary-700',
      href: '/',
      dark: false,
    },
    {
      icon: Gavel,
      label: 'Aktif Sekarang',
      value: belumSelesaiCount.toLocaleString('ms-MY'),
      hint: 'Semua status selain SELESAI',
      border: 'border-slate-800',
      iconColor: 'text-slate-800',
      href: '/',
      dark: false,
    },
    {
      icon: CheckCircle2,
      label: 'Kes Selesai',
      value: selesaiCount.toLocaleString('ms-MY'),
      hint: `${resolvedRate}% kadar penyelesaian`,
      border: 'border-emerald-700',
      iconColor: 'text-emerald-700',
      href: '/',
      dark: false,
    },
    {
      icon: Award,
      label: 'Kadar Selesai',
      value: `${resolvedRate}%`,
      hint: 'Prestasi keseluruhan rekod',
      border: 'bg-primary-800',
      iconColor: 'text-white',
      href: '/chat',
      dark: true,
    },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-10 px-4 py-6 md:px-8 md:py-8">
      <header className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="mb-1 text-xs font-extrabold uppercase tracking-[0.22em] text-slate-500">
            Ringkasan Pentadbiran
          </p>
          <h1 className="text-3xl font-black tracking-tight text-primary-800 md:text-4xl">
            Papan Pemuka Arkib Kehakiman
          </h1>
          <p className="mt-2 text-sm text-slate-600">Ringkasan prestasi semasa berdasarkan data kes AGC.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/"
            className="border-b-2 border-slate-200 bg-white px-5 py-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-700 transition hover:bg-slate-50"
          >
            Senarai Kes
          </Link>
          <Link
            href="/chat"
            className="bg-primary-800 px-5 py-2 text-xs font-bold uppercase tracking-[0.18em] text-white transition hover:opacity-90"
          >
            Buka Chat AI
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metricCards.map((metric) => <MetricCardLink key={metric.label} metric={metric} />)}
      </div>

      <div className="grid grid-cols-1 gap-7 lg:grid-cols-3">
        <div className="space-y-7 lg:col-span-2">
          <section className="relative overflow-hidden border-t border-slate-200 bg-white p-7 shadow-sm">
            <div className="pointer-events-none absolute -right-20 -top-20 h-44 w-44 rotate-45 judicial-wash opacity-10" />
            <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black uppercase tracking-wide text-slate-900">Analisis Trend</h2>
                <p className="text-sm text-slate-500">Volume pembukaan kes sepanjang 6 bulan terkini.</p>
              </div>
              <div className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                {latestUpdate
                  ? `Kemaskini: ${new Date(latestUpdate).toLocaleDateString('ms-MY', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}`
                  : 'Kemaskini: -'}
              </div>
            </div>

            <div className="h-64 w-full">
              {trendBulan.length > 0 ? (
                <div className="flex h-full items-end gap-3 border-b border-slate-200 pb-4">
                  {trendBulan.map(([monthKey, count]) => (
                    <div key={monthKey} className="flex flex-1 flex-col items-center gap-2">
                      <p className="text-xs font-bold text-slate-700">{count}</p>
                      <div
                        className="w-full max-w-14 bg-primary-800 transition-[height] duration-500"
                        style={{ height: `${Math.max((count / trendMax) * 180, 12)}px` }}
                      />
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                        {formatMonthKey(monthKey)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex h-full items-center justify-center border border-dashed border-slate-200 bg-slate-50 text-sm italic text-slate-500">
                  Tiada data tarikh pembukaan kes.
                </div>
              )}
            </div>

            <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="border-l-2 border-primary-800 bg-slate-50 p-4">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Puncak Volume</p>
                <p className="text-sm font-bold text-slate-900">
                  {trendPeak ? `${formatMonthKey(trendPeak[0])} (${trendPeak[1]} kes)` : 'Tiada rekod'}
                </p>
              </div>
              <div className="border-l-2 border-slate-800 bg-slate-50 p-4">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Purata Bulanan</p>
                <p className="text-sm font-bold text-slate-900">{trendPurata.toFixed(1)} kes sebulan</p>
              </div>
            </div>
          </section>

          <Link
            href="/chat"
            className="group relative block h-48 overflow-hidden bg-slate-900 p-8"
          >
            <div className="absolute inset-0 judicial-wash opacity-55 transition group-hover:scale-105" />
            <div className="relative z-10 max-w-lg">
              <h2 className="mb-2 text-2xl font-black tracking-tight text-white">AI Carian Kes Warisan</h2>
              <p className="mb-4 text-sm leading-relaxed text-white/85">
                Cari rujukan kes, isu undang-undang dan preseden dengan enjin semantik AGC.
              </p>
              <span className="inline-block border-b-2 border-white pb-1 text-xs font-bold uppercase tracking-[0.2em] text-white transition group-hover:text-primary-100">
                Mula Carian Mendalam
              </span>
            </div>
          </Link>
        </div>

        <div>
          <section className="h-full border border-slate-200 bg-slate-50 p-7">
            <div className="mb-8 flex items-center gap-2">
              <History className="h-5 w-5 text-primary-800" />
              <h2 className="text-lg font-black uppercase tracking-wide text-slate-900">Log Aktiviti</h2>
            </div>

            <div className="relative space-y-7">
              <div className="absolute bottom-2 left-3 top-2 w-0.5 bg-slate-200" />
              {aktiviti.map((item, index) => (
                <div key={item.id} className="relative pl-10">
                  <div
                    className={`absolute left-1.5 top-1.5 h-3.5 w-3.5 ring-4 ring-slate-50 ${
                      index % 2 === 0 ? 'bg-primary-800' : 'bg-slate-700'
                    }`}
                  />
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                    {formatActivityTime(item.updated_at)}
                  </p>
                  <p className="text-sm font-bold text-slate-900">{item.file_no || `Kes #${item.id}`}</p>
                  <p className="text-xs leading-relaxed text-slate-600">
                    {(item.case_name || 'Rekod kes dikemaskini.')} Status: {item.status || 'Tiada status'}.
                  </p>
                </div>
              ))}

              {aktiviti.length === 0 && (
                <p className="text-sm italic text-slate-500">Tiada aktiviti terkini ditemui.</p>
              )}
            </div>

            <Link
              href="/"
              className="mt-10 flex w-full items-center justify-center border-2 border-slate-200 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-slate-800 transition hover:bg-slate-100"
            >
              Lihat Semua Rekod
            </Link>
          </section>
        </div>
      </div>

      <section className="grid grid-cols-1 gap-8 border-t border-slate-200 pt-10 md:grid-cols-2">
        <div>
          <h2 className="mb-5 text-xl font-black uppercase tracking-tight text-primary-800">Rekod Kes Terkini</h2>
          <div className="space-y-3">
            {terbaru.map((c, index) => (
              <Link
                key={c.id}
                href={`/cases/${c.id}`}
                className="group flex items-center justify-between border-b border-slate-100 bg-white p-4 transition hover:bg-slate-50"
              >
                <div className="flex min-w-0 flex-1 items-center gap-4">
                  <div className={`h-10 w-2 shrink-0 ${index % 2 === 0 ? 'bg-primary-800' : 'bg-slate-800'}`} />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-slate-900">{c.case_name || c.file_no || `Kes #${c.id}`}</p>
                    <p className="truncate text-[10px] font-medium uppercase text-slate-400">
                      {formatActivityTime(c.updated_at)} | {c.status || 'Tiada status'}
                    </p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-primary-800" />
              </Link>
            ))}

            {terbaru.length === 0 && (
              <p className="text-sm italic text-slate-500">Tiada rekod kes untuk dipaparkan.</p>
            )}
          </div>
        </div>

        <div className="bg-slate-100 p-7">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-sm font-black uppercase tracking-[0.14em] text-slate-900">Ringkasan Kesihatan Arkib</h2>
            <span className="flex items-center gap-1 text-[10px] font-bold text-primary-800">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary-800" />
              STATUS SEMASA
            </span>
          </div>

          <div className="space-y-6">
            <HealthProgressRow
              label="Rekod Status Lengkap"
              valueLabel={`${statusCoverage}%`}
              widthPercent={statusCoverage}
              barColor="bg-primary-800"
            />

            <HealthProgressRow
              label="Rekod Tarikh Pembukaan"
              valueLabel={`${dateCoverage}%`}
              widthPercent={dateCoverage}
              barColor="bg-slate-800"
            />

            <HealthProgressRow
              label="Kes Tanpa Status"
              valueLabel={tanpaStatusCount.toLocaleString('ms-MY')}
              widthPercent={percent(tanpaStatusCount, totalKes)}
              barColor="bg-amber-700"
            />
          </div>

          <div className="mt-8 border-t border-slate-200 pt-6 text-xs text-slate-600">
            <RankedSummaryList
              title="Negeri Tertinggi"
              items={negeriTop}
              className="mt-0 text-xs text-slate-600"
            />
          </div>

          <RankedSummaryList title="Kategori Tertinggi" items={kategoriTop} />
        </div>
      </section>

      <div className="mt-2 flex items-center justify-end text-xs text-slate-500">
        <CalendarDays className="mr-2 h-4 w-4" />
        {latestUpdate
          ? `Kemaskini data terakhir: ${new Date(latestUpdate).toLocaleDateString('ms-MY', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}`
          : 'Kemaskini data terakhir: -'}
      </div>

    </div>
  );
}
