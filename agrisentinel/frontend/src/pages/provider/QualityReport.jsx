import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, Download, FileSpreadsheet, Filter, Leaf, Search, ShieldCheck, TrendingDown,
} from 'lucide-react'
import {
  Banner, Button, Card, EmptyState, PageHeader, ProgressBar, SectionTitle, Segmented,
  Select, Skeleton, StatCard,
} from '../../components/ui'
import { Donut, TrendArea } from '../../components/charts'
import { ScanDrawer } from '../../components/ScanInsight'
import { useApi } from '../../lib/useApi'
import { downloadFile } from '../../lib/api'
import { useToast } from '../../context/ToastContext'
import {
  GRADE_TONES, cn, formatDate, formatNumber, mediaSrc, scoreTone,
} from '../../lib/utils'

const CROPS = [
  ['', 'All crops'], ['produce', 'Fresh produce'], ['tomato', 'Tomato'], ['kale', 'Kale'], ['avocado', 'Avocado'],
  ['mango', 'Mango'], ['potato', 'Potato'], ['onion', 'Onion'], ['cabbage', 'Cabbage'], ['banana', 'Banana'],
]

const PAGE_SIZE = 20

export default function QualityReport() {
  const { toast } = useToast()
  const [days, setDays] = useState(30)
  const [crop, setCrop] = useState('')
  const [grade, setGrade] = useState('')
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [page, setPage] = useState(1)
  const [activeScan, setActiveScan] = useState(null)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 350)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => { setPage(1) }, [days, crop, grade, debounced])

  const query = useMemo(() => {
    const params = new URLSearchParams()
    params.set('days', String(days))
    if (crop) params.set('crop', crop)
    if (grade) params.set('grade', grade)
    if (debounced) params.set('q', debounced)
    return params.toString()
  }, [days, crop, grade, debounced])

  const { data, loading, error } = useApi(`/provider/quality-report?${query}`)

  const summary = data?.summary || {}
  const byCrop = data?.by_crop || []
  const byGrade = data?.by_grade || []
  const trend = data?.trend || []
  const scans = data?.scans || []

  const maxCropCount = Math.max(1, ...byCrop.map((item) => item.count))
  const totalPages = Math.max(1, Math.ceil(scans.length / PAGE_SIZE))
  const pagedScans = scans.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const exportCsv = async () => {
    setExporting(true)
    try {
      await downloadFile(`/provider/quality-report.csv?days=${days || 365}`, 'agrisentinel-quality-report.csv')
      toast({ type: 'success', title: 'Quality report exported' })
    } catch (err) {
      toast({ type: 'error', title: 'Export failed', message: err.message })
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Admin console"
        title="Quality report"
        description="Scan results across the network, filtered and exportable."
        actions={
          <Button variant="secondary" icon={Download} loading={exporting} onClick={exportCsv}>
            Export CSV
          </Button>
        }
      />

      <Card>
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-forest-800/40"><Filter className="h-3 w-3" /> Period</span>
            <Segmented
              size="sm"
              value={days}
              onChange={(value) => setDays(Number(value))}
              options={[
                { value: 7, label: '7d' },
                { value: 30, label: '30d' },
                { value: 90, label: '90d' },
                { value: 0, label: 'All time' },
              ]}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-36">
              <Select value={crop} onChange={(event) => setCrop(event.target.value)} className="h-9 py-0 text-xs">
                {CROPS.map(([key, label]) => <option key={key || 'all'} value={key}>{label}</option>)}
              </Select>
            </div>
            <div className="w-32">
              <Select value={grade} onChange={(event) => setGrade(event.target.value)} className="h-9 py-0 text-xs">
                <option value="">All grades</option>
                {['A', 'B', 'C', 'D'].map((item) => <option key={item} value={item}>Grade {item}</option>)}
              </Select>
            </div>
            <div className="relative w-full sm:w-52">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-forest-800/35" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Ref, farmer or crop"
                className="h-9 w-full rounded-xl border border-forest-950/10 bg-white/80 pl-9 pr-3 text-xs text-forest-950 placeholder:text-forest-950/30 focus:border-forest-500 focus:outline-none focus:ring-2 focus:ring-forest-500/15"
              />
            </div>
            {(crop || grade || debounced) ? (
              <Button size="sm" variant="ghost" onClick={() => { setCrop(''); setGrade(''); setSearch(''); setDebounced('') }}>
                Clear
              </Button>
            ) : null}
          </div>
        </div>
      </Card>

      {error ? <Banner tone="danger" icon={AlertTriangle} title="Could not load quality report">{error}</Banner> : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={FileSpreadsheet} label="Scans analysed" value={formatNumber(summary.total || 0)} hint="In the selected period" tone="forest" />
        <StatCard icon={ShieldCheck} label="Average quality" value={summary.avg_quality ?? 0} suffix="/100" hint="Across all scans" tone="lime" />
        <StatCard icon={AlertTriangle} label="At-risk rate" value={`${summary.at_risk_rate ?? 0}%`} hint={`${summary.at_risk || 0} scans below 60`} tone="amber" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-8">
          <SectionTitle
            title="Quality trend"
            description={days ? `Daily averages over the last ${days} days` : 'Daily averages across all scans'}
          />
          {trend.some((point) => point.scans) ? (
            <TrendArea data={trend} dataKey="avg_score" label="Avg quality" height={220} color="#28795d" />
          ) : (
            <EmptyState icon={TrendingDown} title="No scans in this period" description="Adjust the filters or export a different window." />
          )}
        </Card>

        <Card className="xl:col-span-4">
          <SectionTitle title="Grade distribution" description="Share of each quality band" />
          {byGrade.some((item) => item.count) ? (
            <>
              <Donut data={byGrade} height={176} inner={52} outer={76} centerLabel="Scans" centerValue={summary.total || 0} />
              <div className="mt-1 grid grid-cols-2 gap-2">
                {byGrade.map((item) => (
                  <div key={item.grade} className="flex items-center gap-2 rounded-lg bg-cream-100/60 px-2.5 py-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="text-[10px] font-bold text-forest-900">{item.grade}</span>
                    <span className="ml-auto text-[10px] text-forest-800/40">{item.count}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <EmptyState icon={Leaf} title="No grade data" />
          )}
        </Card>
      </div>

      <Card>
        <SectionTitle title="Performance by crop" description="Volume and average quality" />
        {byCrop.length ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {byCrop.map((item) => (
              <div key={item.crop} className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-3">
                <span className="flex items-center gap-2 text-[11px] font-semibold text-forest-900">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                  {item.label}
                </span>
                <div>
                  <ProgressBar value={(item.count / maxCropCount) * 100} tone="forest" height="h-2" />
                  <p className="mt-0.5 text-[9px] text-forest-800/35">{item.count} scans</p>
                </div>
                <span className="w-10 text-right text-[11px] font-bold" style={{ color: scoreTone(item.avg_score).color }}>
                  {item.avg_score}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={Leaf} title="No crop data in this window" />
        )}
      </Card>

      <Card>
        <SectionTitle
          title="Scan register"
          description={`${scans.length} results matching the current filters`}
        />
        {loading && !scans.length ? (
          <div className="space-y-2">{[0, 1, 2, 3, 4].map((key) => <Skeleton key={key} className="h-12 w-full" />)}</div>
        ) : pagedScans.length ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[38rem] border-collapse text-left">
                <thead>
                  <tr className="border-b border-forest-950/[0.08] text-[9px] font-bold uppercase tracking-[0.1em] text-forest-800/40">
                    <th className="py-2 pr-3">Scan</th>
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3">Farmer</th>
                    <th className="py-2 pr-3">Crop</th>
                    <th className="py-2 pr-3">Score</th>
                    <th className="py-2 pr-3">Grade</th>
                    <th className="py-2">Cold days</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedScans.map((scan) => {
                    const tone = GRADE_TONES[scan.grade] || GRADE_TONES.B
                    return (
                      <tr
                        key={scan.id}
                        onClick={() => setActiveScan(scan)}
                        className="cursor-pointer border-b border-forest-950/[0.04] text-[11px] transition hover:bg-cream-100/60"
                      >
                        <td className="py-2.5 pr-3">
                          <span className="flex items-center gap-2">
                            <span className="h-7 w-7 overflow-hidden rounded-md bg-forest-500/10">
                              {scan.image ? <img src={mediaSrc(scan.image)} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center"><Leaf className="h-3 w-3 text-forest-600" /></span>}
                            </span>
                            <span className="font-bold text-forest-950">{scan.ref}</span>
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 text-forest-800/50">{formatDate(scan.created_at)}</td>
                        <td className="max-w-[9rem] truncate py-2.5 pr-3 font-semibold text-forest-900">{scan.farmer_name}</td>
                        <td className="py-2.5 pr-3 text-forest-800/60">{scan.crop_label}</td>
                        <td className="py-2.5 pr-3 font-bold" style={{ color: scoreTone(scan.quality_score).color }}>{scan.quality_score}</td>
                        <td className="py-2.5 pr-3"><span className={cn('rounded-full border px-1.5 py-0.5 text-[9px] font-bold', tone.soft)}>{scan.grade}</span></td>
                        <td className="py-2.5 font-semibold text-forest-900">{formatNumber(scan.shelf_cold_days, { maximumFractionDigits: 1 })}d</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[10px] text-forest-800/40">
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, scans.length)} of {scans.length}
              </p>
              <div className="flex items-center gap-1.5">
                <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</Button>
                <span className="px-2 text-[10px] font-semibold text-forest-800/50">{page} / {totalPages}</span>
                <Button size="sm" variant="secondary" disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>Next</Button>
              </div>
            </div>
          </>
        ) : (
          <EmptyState
            icon={Search}
            title="No scans match these filters"
            description="Try a wider period, a different crop, or clear the search."
            action={(
              <Button size="sm" variant="secondary" onClick={() => { setCrop(''); setGrade(''); setSearch(''); setDebounced(''); setDays(30) }}>
                Reset filters
              </Button>
            )}
          />
        )}
      </Card>

      <ScanDrawer open={Boolean(activeScan)} scan={activeScan} onClose={() => setActiveScan(null)} />
    </div>
  )
}
