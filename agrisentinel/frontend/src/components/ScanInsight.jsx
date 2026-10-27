import { useEffect, useState } from 'react'
import {
  AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, CloudSun, Cpu, Droplets,
  Gauge, Leaf, Package, ShieldAlert, Snowflake, Sparkles, Sun, Thermometer, Wind,
} from 'lucide-react'
import {
  Badge, Banner, Button, Drawer, InfoRow, ProgressBar, ScoreRing, SectionTitle, Skeleton,
} from './ui'
import { DualShelfChart } from './charts'
import { api } from '../lib/api'
import {
  CROP_ICONS, GRADE_TONES, SEVERITY, cn, cropColor, formatNumber, mediaSrc, scoreTone, weatherIcon,
} from '../lib/utils'

const PRIORITY_TONE = { high: 'red', medium: 'amber', low: 'green' }
const DEFECT_TONE = { high: 'red', medium: 'amber', low: 'neutral' }

function ScanImage({ scan, className }) {
  const Icon = CROP_ICONS[scan?.crop] || Leaf
  if (scan?.image) {
    return (
      <img
        src={mediaSrc(scan.image)}
        alt={`${scan.crop_label} quality scan`}
        className={cn('h-full w-full object-cover', className)}
      />
    )
  }
  return (
    <div
      className={cn('flex h-full w-full items-center justify-center', className)}
      style={{ background: `linear-gradient(140deg, ${cropColor(scan?.crop)}33, ${cropColor(scan?.crop)}0d)` }}
    >
      <Icon className="h-10 w-10" style={{ color: cropColor(scan?.crop) }} />
    </div>
  )
}

export function ShelfLifeGrid({ scan, dense = false }) {
  const gained = scan?.days_gained ?? Math.max(0, (scan?.shelf_cold_days || 0) - (scan?.shelf_ambient_days || 0))
  const risk = SEVERITY[scan?.weather_risk] || SEVERITY.low
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="rounded-2xl border border-forest-950/[0.07] bg-cream-50/80 p-4">
        <div className="flex items-center gap-2 text-forest-800/50">
          <Sun className="h-4 w-4 text-sun-500" />
          <span className="text-[10px] font-bold uppercase tracking-[0.12em]">Open-air shelf life</span>
        </div>
        <p className="mt-2 font-display text-[1.9rem] leading-none text-forest-950">
          {formatNumber(scan?.shelf_ambient_days, { maximumFractionDigits: 1 })}
          <span className="ml-1 text-xs font-sans font-semibold text-forest-800/45">days</span>
        </p>
        <p className="mt-1 text-[10px] text-forest-800/45">Based on the next 3 days of local weather</p>
      </div>
      <div className="rounded-2xl border border-forest-500/20 bg-forest-500/[0.06] p-4">
        <div className="flex items-center gap-2 text-forest-800/50">
          <Snowflake className="h-4 w-4 text-forest-500" />
          <span className="text-[10px] font-bold uppercase tracking-[0.12em]">Cold storage life</span>
        </div>
        <p className="mt-2 font-display text-[1.9rem] leading-none text-forest-900">
          {formatNumber(scan?.shelf_cold_days, { maximumFractionDigits: 1 })}
          <span className="ml-1 text-xs font-sans font-semibold text-forest-800/45">days</span>
        </p>
        <p className="mt-1 flex items-center gap-1.5 text-[10px] font-semibold text-forest-600">
          <Sparkles className="h-3 w-3" /> +{formatNumber(gained, { maximumFractionDigits: 1 })} days of protection
        </p>
      </div>
      {!dense ? (
        <div className="sm:col-span-2 flex flex-wrap items-center gap-2 rounded-2xl border border-forest-950/[0.06] bg-cream-100/50 px-3.5 py-2.5">
          <Badge tone={scan?.recommended_mode === 'cold' ? 'green' : 'amber'} dot>
            {scan?.recommended_mode === 'cold' ? 'Cool this lot' : 'Ambient is viable'}
          </Badge>
          <Badge tone={scan.weather_risk === 'high' || scan.weather_risk === 'extreme' ? 'red' : scan.weather_risk === 'medium' || scan.weather_risk === 'moderate' ? 'amber' : 'green'}>
            {risk.label} weather risk
          </Badge>
          {typeof scan?.stress_index === 'number' ? (
            <span className="ml-auto text-[10px] font-semibold text-forest-800/45">
              Stress index {Math.round(scan.stress_index * 100)}%
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export function ScanDetailBody({ scan, onBookCold, showMeta = true, compact = false }) {
  if (!scan) return null
  const tone = GRADE_TONES[scan.grade] || GRADE_TONES.B
  const metricTone = scoreTone(scan.quality_score)
  const degradation = scan.degradation || []
  const metrics = scan.metrics || []
  const defects = scan.defects || []
  const recommendations = scan.recommendations || []
  const advisories = scan.advisories || []
  const weather = scan.weather || {}
  const model = scan.model || {}
  const cnn = scan.cnn || {}
  const probabilities = cnn.probabilities || {}
  const weatherDays = weather.daily || []

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1.15fr_0.85fr]">
        <div className="relative h-44 overflow-hidden rounded-2xl bg-forest-950/5 sm:h-52">
          <ScanImage scan={scan} className="transition duration-500 hover:scale-[1.03]" />
          <div className="absolute inset-0 bg-gradient-to-t from-forest-950/60 via-transparent to-transparent" />
          <div className="absolute inset-x-3 bottom-3 flex items-end justify-between gap-2">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-cream-100/60">{scan.crop_label}</p>
              <p className="font-display text-lg leading-tight text-cream-50">{scan.ref}</p>
              <p className="mt-0.5 text-[10px] text-cream-100/55">{scan.created_label} · {scan.location_name}</p>
            </div>
            <span className={cn('rounded-full px-2.5 py-1 text-[10px] font-bold text-cream-50 shadow-soft', tone.bg)}>
              Grade {scan.grade}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4 rounded-2xl border border-forest-950/[0.07] bg-cream-50/80 p-4">
          <ScoreRing score={scan.quality_score} size={104} stroke={9} color={metricTone.color}>
            <span className="font-display text-[1.9rem] leading-none text-forest-950">{scan.quality_score}</span>
            <span className="mt-0.5 text-[8px] font-bold uppercase tracking-[0.14em] text-forest-800/40">Quality</span>
          </ScoreRing>
          <div className="min-w-0 flex-1">
            <p className="font-display text-lg leading-tight text-forest-950">{scan.grade_label}</p>
            <p className="mt-0.5 text-[11px] text-forest-800/50">{scan.crop_label} · {scan.farmer_name}</p>
            <div className="mt-3 space-y-2">
              <div>
                <div className="flex items-center justify-between text-[10px] font-semibold text-forest-800/55">
                  <span>Freshness</span><span>{Math.round(scan.freshness_pct)}%</span>
                </div>
                <ProgressBar value={scan.freshness_pct} tone="forest" height="h-1.5" className="mt-1" />
              </div>
              <div>
                <div className="flex items-center justify-between text-[10px] font-semibold text-forest-800/55">
                  <span>Ripeness</span><span>{Math.round(scan.ripeness_pct)}%</span>
                </div>
                <ProgressBar value={scan.ripeness_pct} tone="lime" height="h-1.5" className="mt-1" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <ShelfLifeGrid scan={scan} />

      {degradation.length ? (
        <div className="rounded-2xl border border-forest-950/[0.07] bg-cream-50/80 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-forest-950">Quality degradation forecast</p>
              <p className="mt-0.5 text-[10px] text-forest-800/45">Modelled with the LSTM against the 3-day weather window</p>
            </div>
            <div className="flex items-center gap-3 text-[9px] font-semibold text-forest-800/50">
              <span className="flex items-center gap-1"><span className="h-1.5 w-3 rounded-full bg-sun-500" /> Ambient</span>
              <span className="flex items-center gap-1"><span className="h-1.5 w-3 rounded-full bg-forest-500" /> Cold</span>
            </div>
          </div>
          <div className="mt-2">
            <DualShelfChart data={degradation} height={175} />
          </div>
          <div className="mt-1 flex items-center justify-between rounded-lg bg-cream-100/60 px-3 py-1.5 text-[10px] text-forest-800/55">
            <span>Market window (≥65 quality)</span>
            <span className="font-bold text-forest-900">
              {scan.market_window?.ambient_days_above_65 ?? '—'}d ambient · {scan.market_window?.cold_days_above_65 ?? '—'}d cold
            </span>
          </div>
        </div>
      ) : null}

      {metrics.length && !compact ? (
        <div>
          <SectionTitle title="Quality signals" description="Computer-vision measurements from the uploaded photo" />
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {metrics.map((metric) => (
              <div key={metric.key || metric.label} className="rounded-xl border border-forest-950/[0.06] bg-cream-50/70 px-3.5 py-2.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-forest-800/60">{metric.label}</span>
                  <span className="font-bold text-forest-950">{metric.value}</span>
                </div>
                <ProgressBar
                  value={metric.value}
                  tone={metric.value >= 80 ? 'forest' : metric.value >= 60 ? 'lime' : metric.value >= 40 ? 'amber' : 'red'}
                  height="h-1.5"
                  className="mt-1.5"
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className={cn('grid gap-4', !compact && 'sm:grid-cols-2')}>
        <div className="rounded-2xl border border-forest-950/[0.07] bg-cream-50/70 p-4">
          <p className="flex items-center gap-1.5 text-xs font-bold text-forest-950">
            <ShieldAlert className="h-3.5 w-3.5 text-clay-500" /> Detected defects
          </p>
          {defects.length ? (
            <div className="mt-3 space-y-2">
              {defects.map((defect, index) => (
                <div key={`${defect.label}-${index}`} className="flex items-center justify-between gap-2 rounded-lg bg-white/60 px-2.5 py-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <Badge tone={DEFECT_TONE[defect.severity] || 'neutral'}>
                      {Math.round((defect.confidence || 0) * 100)}%
                    </Badge>
                    <span className="truncate text-[11px] font-medium text-forest-900">{defect.label}</span>
                  </span>
                  <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider text-forest-800/35">{defect.severity}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 flex items-center gap-2 text-[11px] text-forest-800/55">
              <CheckCircle2 className="h-4 w-4 text-forest-500" /> No significant surface defects detected.
            </p>
          )}
          {!compact && cnn.label ? (
            <p className="mt-3 flex items-center gap-1.5 border-t border-forest-950/[0.05] pt-2.5 text-[10px] text-forest-800/40">
              <Cpu className="h-3 w-3" /> AgriVision class: <span className="font-semibold text-forest-800/60">{cnn.label}</span>
              {probabilities[cnn.label] ? ` (${Math.round(probabilities[cnn.label] * 100)}% confidence)` : ''}
            </p>
          ) : null}
        </div>

        {!compact ? (
          <div className="rounded-2xl border border-forest-950/[0.07] bg-cream-50/70 p-4">
            <p className="flex items-center gap-1.5 text-xs font-bold text-forest-950">
              <Gauge className="h-3.5 w-3.5 text-forest-600" /> Scan facts
            </p>
            <div className="mt-2">
              <InfoRow label="Scan reference" value={scan.ref} />
              <InfoRow label="Confidence" value={`${Math.round((scan.confidence || 0) * 100)}%`} />
              <InfoRow label="Recommended" value={scan.recommended_mode === 'cold' ? 'Cold storage' : 'Ambient handling'} />
              <InfoRow label="Weather source" value={weather.source || 'Local forecast'} />
              <InfoRow label="Stress index" value={typeof scan.stress_index === 'number' ? `${Math.round(scan.stress_index * 100)}%` : '—'} />
            </div>
          </div>
        ) : null}
      </div>

      {recommendations.length ? (
        <div>
          <SectionTitle title="What to do next" description="Prioritised actions from the quality and weather models" />
          <div className="space-y-2">
            {recommendations.slice(0, compact ? 3 : recommendations.length).map((rec, index) => (
              <div key={`${rec.title}-${index}`} className="flex gap-3 rounded-xl border border-forest-950/[0.06] bg-cream-50/70 px-3.5 py-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-forest-950 text-[10px] font-bold text-agri-lime">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[11px] font-bold text-forest-950">{rec.title}</p>
                    <Badge tone={PRIORITY_TONE[rec.priority] || 'neutral'}>{rec.priority}</Badge>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-forest-800/55">{rec.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {advisories.length ? (
        <div className="space-y-2">
          {advisories.map((advisory, index) => (
            <Banner
              key={`${advisory.title}-${index}`}
              tone={advisory.level === 'high' || advisory.level === 'extreme' ? 'danger' : advisory.level === 'medium' ? 'warning' : 'info'}
              icon={advisory.level === 'high' ? AlertTriangle : CloudSun}
              title={advisory.title}
            >
              {advisory.detail}
            </Banner>
          ))}
        </div>
      ) : null}

      {!compact && weatherDays.length ? (
        <div>
          <SectionTitle title="Weather that shaped this forecast" description={weather.location?.name || scan.location_name} />
          <div className="grid grid-cols-3 gap-2.5">
            {weatherDays.slice(0, 3).map((day) => {
              const Icon = weatherIcon(day.icon)
              return (
                <div key={day.date} className="rounded-xl border border-forest-950/[0.06] bg-cream-50/70 p-3 text-center">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-forest-800/40">{day.day}</p>
                  <Icon className="mx-auto mt-2 h-5 w-5 text-forest-600" strokeWidth={1.8} />
                  <p className="mt-2 text-xs font-bold text-forest-950">{Math.round(day.temp_max)}° / {Math.round(day.temp_min)}°</p>
                  <p className="mt-0.5 text-[9px] text-forest-800/45">{day.humidity}% RH</p>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      {showMeta && !compact ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-forest-950/[0.035] px-3 py-2 text-[9px] font-medium uppercase tracking-wider text-forest-800/40">
          <span className="flex items-center gap-1"><Cpu className="h-2.5 w-2.5" /> {model.version || 'v1'}</span>
          <span>{model.vision || 'CNN vision'}</span>
          <span>{model.shelf_life || 'LSTM shelf model'}</span>
          {model.data_source ? <span className="normal-case">· {model.data_source}</span> : null}
        </div>
      ) : null}

      {onBookCold ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button variant="primary" icon={Snowflake} onClick={() => onBookCold(scan)}>
            Book cold storage
          </Button>
          <Button variant="secondary" icon={Package} onClick={() => onBookCold(scan, true)}>
            Book & attach this scan
          </Button>
        </div>
      ) : null}
    </div>
  )
}

export function ScanDrawer({ open, onClose, scanId, scan: provided, onBookCold }) {
  const [scan, setScan] = useState(provided || null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    const id = provided?.id || scanId
    if (!id) return
    if (provided) setScan(provided)
    if (provided?.confidence !== undefined) return
    let active = true
    setLoading(!provided)
    setError('')
    api
      .get(`/scans/${id}`)
      .then((data) => {
        if (active) setScan(data.scan)
      })
      .catch((err) => {
        if (active && !provided) setError(err.message || 'Could not load this scan')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [open, scanId, provided])

  const handleClose = () => {
    if (!provided) setScan(null)
    onClose?.()
  }

  return (
    <Drawer open={open} onClose={handleClose} title={scan ? `${scan.crop_label} scan` : 'Quality scan'} subtitle={scan ? `${scan.ref} · ${scan.created_label}` : 'AgriVision analysis'}>
      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : error ? (
        <Banner tone="danger" icon={AlertTriangle} title="Could not load scan">{error}</Banner>
      ) : scan ? (
        <ScanDetailBody scan={scan} onBookCold={onBookCold ? (item, attach) => { handleClose(); onBookCold(item, attach) } : undefined} />
      ) : null}
    </Drawer>
  )
}

export function WeatherMini({ day }) {
  if (!day) return null
  const Icon = weatherIcon(day.icon)
  return (
    <div className="flex items-center gap-2 rounded-xl border border-forest-950/[0.06] bg-cream-50/70 px-3 py-2">
      <Icon className="h-4 w-4 text-forest-600" />
      <div>
        <p className="text-[9px] font-bold uppercase tracking-wider text-forest-800/40">{day.day}</p>
        <p className="text-[11px] font-bold text-forest-950">{Math.round(day.temp_max)}° <span className="font-medium text-forest-800/45">/ {Math.round(day.temp_min)}°</span></p>
      </div>
    </div>
  )
}
