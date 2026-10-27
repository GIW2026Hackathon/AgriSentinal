import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle, Camera, Check, ChevronRight, ImagePlus, Leaf, Loader2,
  RotateCcw, ScanLine, X,
} from 'lucide-react'
import {
  Badge, Banner, Button, Card, EmptyState, PageHeader, ProgressBar, SectionTitle,
  Segmented, Skeleton,
} from '../../components/ui'
import { ScanDetailBody, ScanDrawer } from '../../components/ScanInsight'
import { api } from '../../lib/api'
import { useApi } from '../../lib/useApi'
import { useToast } from '../../context/ToastContext'
import {
  CROP_ICONS, CROP_SAMPLES, GRADE_TONES, cn, formatNumber, mediaSrc, scoreTone,
} from '../../lib/utils'

const STEPS = [
  'Uploading harvest photo',
  'Reading colour, texture & blemishes',
  'Matching AgriVision CNN classes',
  'Fusing RandomForest quality score',
  'Modelling 3-day weather shelf life',
]

export default function QualityScan() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const fileRef = useRef(null)
  const stepTimer = useRef(null)

  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState('')
  const [isSample, setIsSample] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState(0)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [gradeFilter, setGradeFilter] = useState('all')
  const [activeScan, setActiveScan] = useState(null)

  const { data, loading, reload } = useApi('/farmer/scans?limit=60')
  const scans = data?.scans || []

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview)
    if (stepTimer.current) clearInterval(stepTimer.current)
  }, [preview])

  const filtered = useMemo(
    () => (gradeFilter === 'all' ? scans : scans.filter((scan) => scan.grade === gradeFilter)),
    [scans, gradeFilter],
  )

  const acceptFile = (next, { sample = false } = {}) => {
    if (!next) return
    if (!next.type.startsWith('image/')) {
      setError('Choose a JPG, PNG or WEBP photo of your produce.')
      return
    }
    if (next.size > 12 * 1024 * 1024) {
      setError('That photo is larger than 12 MB. Try a smaller one.')
      return
    }
    setError('')
    setResult(null)
    setIsSample(sample)
    if (preview) URL.revokeObjectURL(preview)
    setFile(next)
    setPreview(URL.createObjectURL(next))
  }

  const loadSample = async (key) => {
    try {
      const response = await fetch(CROP_SAMPLES[key])
      const blob = await response.blob()
      const sample = new File([blob], `sample-${key}.jpg`, { type: 'image/jpeg' })
      acceptFile(sample, { sample: true })
      const label = key.charAt(0).toUpperCase() + key.slice(1)
      toast({ type: 'info', title: `${label} sample loaded`, message: 'Ready to analyse.' })
    } catch {
      setError('Could not load the sample image.')
    }
  }

  const reset = () => {
    setResult(null)
    setFile(null)
    setIsSample(false)
    if (preview) URL.revokeObjectURL(preview)
    setPreview('')
    setError('')
    if (fileRef.current) fileRef.current.value = ''
  }

  const analyse = async () => {
    if (!file) {
      setError('Attach a photo of the harvested produce first.')
      return
    }
    setError('')
    setBusy(true)
    setStep(0)
    if (stepTimer.current) clearInterval(stepTimer.current)
    stepTimer.current = setInterval(() => {
      setStep((value) => Math.min(value + 1, STEPS.length - 1))
    }, 1100)

    try {
      const form = new FormData()
      form.append('image', file, file.name || 'harvest.jpg')
      form.append('is_sample', isSample ? '1' : '0')
      const data = await api.upload('/scans', form)
      setResult(data.scan)
      reload({ silent: true })
      toast({
        type: 'success',
        title: `Grade ${data.scan.grade} · ${data.scan.quality_score}/100`,
        message: `Cold storage keeps this lot ${formatNumber(data.scan.shelf_cold_days, { maximumFractionDigits: 1 })} days.`,
      })
    } catch (err) {
      setError(err.message || 'Analysis failed. Please try again.')
    } finally {
      if (stepTimer.current) clearInterval(stepTimer.current)
      setBusy(false)
    }
  }

  const bookFromScan = (scan, attach) => {
    navigate('/farmer/storage', { state: { crop: scan.crop, scanId: attach ? scan.id : null, openBooking: true } })
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="AI quality check"
        title="Quality scan"
        description="Upload a harvest photo to get a quality grade and weather-aware shelf life."
        actions={
          <Badge tone="green" dot>
            {data ? `${scans.length} scans on record` : 'Model warming up'}
          </Badge>
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-4">
          {result ? (
            <Card className="relative overflow-hidden">
              <div className="pointer-events-none absolute right-0 top-0 h-40 w-40 rounded-full bg-agri-lime/20 blur-3xl" />
              <div className="relative mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-forest-600">
                    <Check className="h-3 w-3" /> Analysis complete
                  </p>
                  <h2 className="mt-1 font-display text-xl text-forest-950">{result.crop_label} · Grade {result.grade}</h2>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={result.grade === 'A' ? 'green' : result.grade === 'B' ? 'lime' : result.grade === 'C' ? 'amber' : 'red'}>
                    {result.grade_label}
                  </Badge>
                  <Button size="sm" variant="secondary" icon={RotateCcw} onClick={reset}>New scan</Button>
                </div>
              </div>
              {result.degraded ? (
                <Banner tone="warning" icon={AlertTriangle} title="Fallback estimate" className="mb-4">
                  The inference service was unreachable, so this scan used the rules-based fallback. Start the ML service for full CNN/LSTM analysis.
                </Banner>
              ) : null}
              <ScanDetailBody scan={result} onBookCold={bookFromScan} compact />
            </Card>
          ) : (
            <Card>
              <SectionTitle
                title="Upload harvest photo"
                description="One clear photo against a plain background works best"
                action={<Badge tone="lime">JPG · PNG · max 12 MB</Badge>}
              />

              {preview ? (
                <div className="relative overflow-hidden rounded-2xl border border-forest-950/[0.07]">
                  <img src={preview} alt="Harvest preview" className="h-56 w-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-forest-950/60 via-transparent to-forest-950/10" />
                  <div className="absolute inset-x-3 bottom-3 flex items-end justify-between gap-2">
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-cream-100/60">Ready to scan</p>
                      <p className="text-xs font-bold text-cream-50">{file?.name}</p>
                      <p className="text-[10px] text-cream-100/60">{(file?.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                    <button
                      type="button"
                      onClick={reset}
                      disabled={busy}
                      className="rounded-full bg-cream-50/90 p-2 text-forest-900 transition hover:bg-cream-50 disabled:opacity-50"
                      aria-label="Remove photo"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(event) => {
                    event.preventDefault()
                    setDragging(false)
                    acceptFile(event.dataTransfer.files?.[0])
                  }}
                  onClick={() => fileRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') fileRef.current?.click() }}
                  className={cn(
                    'group flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition',
                    dragging
                      ? 'border-forest-500 bg-forest-500/[0.07]'
                      : 'border-forest-950/15 bg-cream-100/40 hover:border-forest-500/40 hover:bg-cream-50',
                  )}
                >
                  <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-forest-950 text-agri-lime shadow-soft transition group-hover:scale-105">
                    <ImagePlus className="h-6 w-6" />
                  </span>
                  <p className="mt-4 text-sm font-bold text-forest-950">Drop a harvest photo here</p>
                  <p className="mt-1 max-w-xs text-xs leading-relaxed text-forest-800/50">
                    Or tap to browse. Use a clear, well-lit photo of the produce.
                  </p>
                  <span className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-forest-950/10 bg-cream-50 px-3.5 py-2 text-[11px] font-bold text-forest-900">
                    <Camera className="h-3.5 w-3.5" /> Choose photo
                  </span>
                </div>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(event) => acceptFile(event.target.files?.[0])}
              />

              {!preview ? (
                <div className="mt-4 rounded-xl bg-cream-100/60 px-3.5 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-forest-800/40">No harvest nearby?</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {Object.entries(CROP_SAMPLES).map(([key, src]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => loadSample(key)}
                        className="group flex items-center gap-1.5 overflow-hidden rounded-lg border border-forest-950/10 bg-cream-50 pr-2.5 text-[10px] font-semibold capitalize text-forest-800/60 transition hover:border-forest-500/30"
                      >
                        <img src={src} alt={key} className="h-7 w-7 object-cover" />
                        {key}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {error ? (
                <Banner tone="danger" icon={AlertTriangle} title="Photo not accepted" className="mt-4">
                  {error}
                </Banner>
              ) : null}

              <Button size="lg" className="mt-5 w-full" icon={busy ? undefined : ScanLine} loading={busy} onClick={analyse} disabled={!file}>
                {busy ? 'Analysing harvest…' : 'Analyse harvest'}
              </Button>
              <p className="mt-2 text-center text-[10px] text-forest-800/40">
                Only harvested produce is accepted. Photos of people or other objects are rejected.
              </p>

              {busy ? (
                <div className="mt-4 rounded-xl border border-forest-950/[0.07] bg-forest-950/[0.03] p-3.5">
                  <div className="flex items-center justify-between text-[10px] font-semibold text-forest-800/55">
                    <span className="flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin text-forest-600" /> {STEPS[step]}</span>
                    <span>{Math.min(96, Math.round(((step + 1) / STEPS.length) * 100))}%</span>
                  </div>
                  <ProgressBar value={((step + 1) / STEPS.length) * 100} tone="forest" className="mt-2" height="h-1.5" />
                </div>
              ) : null}
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <SectionTitle
              title="Scan history"
              description="Tap a scan to reopen the full analysis"
              action={<Badge tone="neutral">{filtered.length}</Badge>}
            />
            <Segmented
              size="sm"
              className="mb-3 w-full [&>button]:flex-1"
              value={gradeFilter}
              onChange={setGradeFilter}
              options={[
                { value: 'all', label: 'All' },
                { value: 'A', label: 'A' },
                { value: 'B', label: 'B' },
                { value: 'C', label: 'C' },
                { value: 'D', label: 'D' },
              ]}
            />
            {loading && !scans.length ? (
              <div className="space-y-2">
                {[0, 1, 2, 3].map((key) => <Skeleton key={key} className="h-16 w-full" />)}
              </div>
            ) : filtered.length ? (
              <div className="max-h-[34rem] space-y-2 overflow-y-auto pr-1">
                {filtered.map((scan) => {
                  const tone = GRADE_TONES[scan.grade] || GRADE_TONES.B
                  const Icon = CROP_ICONS[scan.crop] || Leaf
                  return (
                    <button
                      key={scan.id}
                      type="button"
                      onClick={() => setActiveScan(scan)}
                      className="group flex w-full items-center gap-3 rounded-xl border border-forest-950/[0.06] bg-cream-50/70 p-2.5 text-left transition hover:border-forest-500/25 hover:bg-white"
                    >
                      <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-forest-500/10">
                        {scan.image ? (
                          <img src={mediaSrc(scan.image)} alt={scan.crop_label} className="h-full w-full object-cover" />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center"><Icon className="h-5 w-5 text-forest-600" /></span>
                        )}
                        <span className={cn('absolute bottom-0 right-0 rounded-tl-md px-1 py-0.5 text-[8px] font-bold text-cream-50', tone.bg)}>
                          {scan.grade}
                        </span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-[11px] font-bold text-forest-950">{scan.crop_label}</span>
                          <span className="shrink-0 text-[10px] font-semibold" style={{ color: scoreTone(scan.quality_score).color }}>
                            {scan.quality_score}/100
                          </span>
                        </span>
                        <span className="mt-0.5 flex items-center justify-between gap-2 text-[10px] text-forest-800/45">
                          <span>{scan.ref} · {scan.created_label}</span>
                          <span className="shrink-0">{formatNumber(scan.shelf_cold_days, { maximumFractionDigits: 1 })}d cold</span>
                        </span>
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-forest-800/20 transition group-hover:text-forest-700" />
                    </button>
                  )
                })}
              </div>
            ) : (
              <EmptyState
                icon={ScanLine}
                title={gradeFilter === 'all' ? 'No scans on record' : `No grade ${gradeFilter} scans`}
                description="Upload a harvest photo to build your quality history."
              />
            )}
          </Card>
        </div>
      </div>

      <ScanDrawer open={Boolean(activeScan)} scan={activeScan} onClose={() => setActiveScan(null)} onBookCold={bookFromScan} />
    </div>
  )
}
