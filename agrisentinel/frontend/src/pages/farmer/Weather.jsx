import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, ArrowDown, ArrowUp, CloudRain, CloudSun, Droplets, RefreshCw, Snowflake,
  Sparkles, Sun, Thermometer, Wind, Leaf, Gauge,
} from 'lucide-react'
import {
  Badge, Banner, Button, Card, EmptyState, PageHeader, ProgressBar, SectionTitle, Skeleton,
  StatCard, Select,
} from '../../components/ui'
import { DualShelfChart, HourlyWeather } from '../../components/charts'
import { useApi } from '../../lib/useApi'
import { api } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import {
  SEVERITY, cn, formatNumber, weatherIcon, weatherTone,
} from '../../lib/utils'

const CROPS = [
  ['tomato', 'Tomato'], ['kale', 'Kale'], ['avocado', 'Avocado'], ['mango', 'Mango'],
  ['potato', 'Potato'], ['onion', 'Onion'], ['cabbage', 'Cabbage'], ['banana', 'Banana'],
]

function StatPill({ icon: Icon, label, value, tone = 'text-forest-700' }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-forest-950/[0.06] bg-cream-50/70 px-3 py-2.5">
      <Icon className={cn('h-4 w-4 shrink-0', tone)} strokeWidth={1.9} />
      <div>
        <p className="text-[9px] font-bold uppercase tracking-wider text-forest-800/35">{label}</p>
        <p className="text-[11px] font-bold text-forest-950">{value}</p>
      </div>
    </div>
  )
}

export default function WeatherPage() {
  const { user } = useAuth()
  const { data, loading, error, reload } = useApi('/weather')

  const [crop, setCrop] = useState('tomato')
  const [quality, setQuality] = useState(82)
  const [facilityTemp, setFacilityTemp] = useState(4)
  const [shelf, setShelf] = useState(null)
  const [shelfLoading, setShelfLoading] = useState(true)
  const [shelfError, setShelfError] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    let active = true
    setShelfLoading(true)
    setShelfError('')
    const timer = setTimeout(() => {
      api
        .get(`/weather/shelf-impact?crop=${crop}&quality=${quality}&facility_temp=${facilityTemp}`)
        .then((payload) => {
          if (active) setShelf(payload)
        })
        .catch((err) => {
          if (active) setShelfError(err.message || 'Could not model shelf life')
        })
        .finally(() => {
          if (active) setShelfLoading(false)
        })
    }, 350)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [crop, quality, facilityTemp])

  const current = data?.current || {}
  const summary = data?.summary || {}
  const daily = data?.daily || []
  const hourly = data?.hourly || []
  const advisories = data?.advisories || []
  const shelfLife = shelf?.shelf_life
  const risk = SEVERITY[summary.risk] || SEVERITY.low
  const avgHumidity = daily.length ? Math.round(daily.slice(0, 3).reduce((sum, day) => sum + day.humidity, 0) / 3) : null

  const shelfRange = useMemo(() => {
    if (!shelfLife) return null
    return {
      ambient: shelfLife.ambient_days,
      cold: shelfLife.cold_days,
      gained: shelfLife.days_gained,
    }
  }, [shelfLife])

  const refresh = async () => {
    setRefreshing(true)
    await reload()
    setRefreshing(false)
  }

  if (loading && !data) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="3-day harvest window"
        title="Weather"
        description={`Hyperlocal forecast for ${data?.location?.name || user?.region || 'your farm'}, with the shelf-life impact of the next three days.`}
        actions={
          <>
            <Button variant="secondary" icon={RefreshCw} loading={refreshing} onClick={refresh}>
              Refresh forecast
            </Button>
            <Badge tone={summary.risk === 'high' ? 'red' : summary.risk === 'moderate' ? 'amber' : 'green'} dot>
              {summary.headline || 'Updating'}
            </Badge>
          </>
        }
      />

      {error ? (
        <Banner tone="danger" icon={AlertTriangle} title="Forecast unavailable">
          {error}
          <div className="mt-2"><Button size="sm" variant="secondary" onClick={() => reload()}>Try again</Button></div>
        </Banner>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Card className="relative overflow-hidden xl:col-span-7">
          <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-agri-lime/20 blur-3xl" />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-forest-600">
                <CloudSun className="h-3.5 w-3.5" /> {data?.source || 'Live forecast'} · updated {data?.updated_at ? new Date(data.updated_at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' }) : 'now'}
              </p>
              <div className="mt-3 flex items-end gap-3">
                <span className="font-display text-[4rem] leading-none tracking-[-0.04em] text-forest-950">
                  {current.temp_c != null ? Math.round(current.temp_c) : '—'}°
                </span>
                <div className="pb-1.5">
                  <p className="text-sm font-bold text-forest-900">{current.condition || 'Forecast'}</p>
                  <p className="text-[11px] text-forest-800/45">Feels like {Math.round(current.feels_like_c ?? 0)}° · {data?.location?.name}</p>
                </div>
              </div>
              <p className="mt-2 max-w-md text-xs leading-relaxed text-forest-800/55">
                {summary.headline}. Peak {summary.max_temp_c}°C, {summary.rain_total_mm} mm rain across the next three days.
                {summary.risk === 'high' ? ' Prioritise cold storage or early dispatch.' : ' Plan harvests around the warmest afternoons.'}
              </p>
            </div>
            <span className="flex h-20 w-20 items-center justify-center rounded-3xl bg-forest-950 text-agri-lime shadow-soft">
              {(() => {
                const Icon = weatherIcon(current.icon)
                return <Icon className="h-10 w-10" strokeWidth={1.5} />
              })()}
            </span>
          </div>

          <div className="relative mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatPill icon={Droplets} label="Humidity" value={`${current.humidity ?? '—'}%`} tone="text-sky-500" />
            <StatPill icon={Wind} label="Wind" value={`${Math.round(current.wind_kph ?? 0)} km/h`} />
            <StatPill icon={CloudRain} label="Rain now" value={`${current.rain_mm ?? 0} mm`} tone="text-sky-500" />
            <StatPill icon={Sun} label="UV index" value={current.uv ?? '—'} tone="text-sun-500" />
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-4 xl:col-span-5">
          <div className="grid grid-cols-2 gap-4">
            <StatCard icon={Thermometer} label="Peak temperature" value={summary.max_temp_c ?? '—'} suffix="°C" hint="Across the 3-day window" tone="amber" />
            <StatCard icon={CloudRain} label="Rain total" value={summary.rain_total_mm ?? 0} suffix="mm" hint={`Average ${avgHumidity ?? '—'}% humidity`} tone="sky" />
          </div>
          <Card className="flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-forest-950">Harvest risk</p>
                <Badge tone={risk.tone.includes('rose') ? 'red' : risk.tone.includes('amber') ? 'amber' : 'green'}>{risk.label}</Badge>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <div className="flex-1">
                  <ProgressBar
                    value={summary.risk === 'high' ? 86 : summary.risk === 'moderate' ? 56 : 24}
                    tone={summary.risk === 'high' ? 'red' : summary.risk === 'moderate' ? 'amber' : 'forest'}
                    height="h-2.5"
                  />
                </div>
                <span className="text-[10px] font-semibold text-forest-800/45">
                  {summary.risk === 'high' ? 'Act now' : summary.risk === 'moderate' ? 'Watch' : 'Stable'}
                </span>
              </div>
            </div>
            <p className="mt-3 text-[10px] leading-relaxed text-forest-800/45">
              Weather stress is combined with produce quality to estimate shelf life. Heat and humidity accelerate ripening and decay.
            </p>
          </Card>
        </div>
      </div>

      <Card>
        <SectionTitle
          title="Five-day outlook"
          description="The first three days drive the shelf-life model"
          action={<Badge tone="lime">Shelf-critical window</Badge>}
        />
        {daily.length ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {daily.map((day, index) => {
              const Icon = weatherIcon(day.icon)
              const critical = index < 3
              return (
                <div
                  key={day.date}
                  className={cn(
                    'rounded-2xl border p-4 transition',
                    critical ? 'border-forest-500/25 bg-forest-500/[0.06]' : 'border-forest-950/[0.06] bg-cream-50/60',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-forest-800/45">{index === 0 ? 'Today' : day.day}</p>
                      <p className="text-[9px] text-forest-800/30">{day.day_full}</p>
                    </div>
                    {critical ? <span className="h-1.5 w-1.5 rounded-full bg-agri-lime-dark" /> : null}
                  </div>
                  <Icon className="mt-3 h-7 w-7 text-forest-600" strokeWidth={1.7} />
                  <p className="mt-3 font-display text-xl leading-none text-forest-950">{Math.round(day.temp_max)}°</p>
                  <p className="mt-0.5 text-[10px] text-forest-800/40">Low {Math.round(day.temp_min)}°</p>
                  <div className="mt-3 space-y-1 border-t border-forest-950/[0.05] pt-2 text-[10px] text-forest-800/50">
                    <p className="flex items-center justify-between"><span className="flex items-center gap-1"><Droplets className="h-2.5 w-2.5" /> Rain</span><span className="font-semibold text-forest-900">{day.rain_mm} mm</span></p>
                    <p className="flex items-center justify-between"><span className="flex items-center gap-1"><Wind className="h-2.5 w-2.5" /> Wind</span><span className="font-semibold text-forest-900">{Math.round(day.wind_kph)} km/h</span></p>
                    <p className="flex items-center justify-between"><span className="flex items-center gap-1"><Gauge className="h-2.5 w-2.5" /> Humidity</span><span className="font-semibold text-forest-900">{day.humidity}%</span></p>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <EmptyState icon={CloudSun} title="Forecast not available" description="Refresh to try the weather service again." />
        )}
      </Card>

      {advisories.length ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {advisories.map((advisory, index) => (
            <Banner
              key={`${advisory.title}-${index}`}
              tone={advisory.level === 'high' ? 'danger' : advisory.level === 'medium' ? 'warning' : 'info'}
              icon={advisory.level === 'high' ? AlertTriangle : CloudSun}
              title={advisory.title}
            >
              {advisory.detail}
            </Banner>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-5">
          <SectionTitle title="Next 24 hours" description="Temperature and rain probability" />
          <HourlyWeather data={hourly} height={230} />
          <div className="mt-2 flex items-center justify-center gap-4 text-[9px] font-semibold text-forest-800/45">
            <span className="flex items-center gap-1"><span className="h-1.5 w-3 rounded-full bg-sky-500/60" /> Rain probability</span>
            <span className="flex items-center gap-1"><span className="h-1.5 w-3 rounded-full bg-sun-500" /> Temperature</span>
          </div>
        </Card>

        <Card className="xl:col-span-7">
          <SectionTitle
            title="Shelf-life cooling simulator"
            description="See how quality and cold storage interact with this forecast"
            action={shelf?.degraded ? <Badge tone="amber">Fallback model</Badge> : <Badge tone="green" dot>LSTM live</Badge>}
          />
          <div className="grid grid-cols-1 gap-5 md:grid-cols-[0.9fr_1.1fr]">
            <div className="space-y-4">
              <label className="block">
                <span className="mb-1.5 flex items-center justify-between text-xs font-semibold text-forest-800">
                  <span>Crop</span>
                </span>
                <Select value={crop} onChange={(event) => setCrop(event.target.value)}>
                  {CROPS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </Select>
              </label>
              <div>
                <div className="flex items-center justify-between text-xs font-semibold text-forest-800">
                  <span>Harvest quality</span>
                  <span className="rounded-md bg-forest-500/10 px-1.5 py-0.5 text-[10px] font-bold text-forest-700">{quality}/100</span>
                </div>
                <input
                  type="range"
                  min={35}
                  max={100}
                  value={quality}
                  onChange={(event) => setQuality(Number(event.target.value))}
                  className="mt-2 w-full accent-forest-600"
                />
                <div className="flex justify-between text-[9px] text-forest-800/35"><span>At risk</span><span>Premium</span></div>
              </div>
              <div>
                <div className="flex items-center justify-between text-xs font-semibold text-forest-800">
                  <span>Cold room temperature</span>
                  <span className="rounded-md bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-bold text-sky-700">{facilityTemp}°C</span>
                </div>
                <input
                  type="range"
                  min={1.5}
                  max={14}
                  step={0.5}
                  value={facilityTemp}
                  onChange={(event) => setFacilityTemp(Number(event.target.value))}
                  className="mt-2 w-full accent-sky-500"
                />
                <div className="flex justify-between text-[9px] text-forest-800/35"><span>Ideal chill</span><span>Cool room</span></div>
              </div>
              <div className="rounded-xl bg-cream-100/70 px-3 py-2.5 text-[10px] leading-relaxed text-forest-800/50">
                <Sparkles className="mb-1 h-3.5 w-3.5 text-forest-600" />
                {shelfLife?.storage_note || 'Cold storage slows respiration and protects quality.'}
              </div>
            </div>

            <div className="rounded-2xl border border-forest-950/[0.06] bg-cream-50/60 p-4">
              {shelfLoading && !shelfLife ? (
                <div className="space-y-3"><Skeleton className="h-16 w-full" /><Skeleton className="h-28 w-full" /></div>
              ) : shelfError ? (
                <Banner tone="danger" icon={AlertTriangle} title="Simulator unavailable">{shelfError}</Banner>
              ) : shelfLife ? (
                <>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="rounded-xl bg-sun-100/70 p-3">
                      <p className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-[#8a611c]/70"><Sun className="h-2.5 w-2.5" /> Ambient</p>
                      <p className="mt-1 font-display text-2xl leading-none text-[#6b4a16]">{formatNumber(shelfRange.ambient, { maximumFractionDigits: 1 })}<span className="ml-0.5 text-[10px] font-sans font-bold">d</span></p>
                    </div>
                    <div className="rounded-xl bg-forest-500/10 p-3">
                      <p className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-forest-700"><Snowflake className="h-2.5 w-2.5" /> Cold</p>
                      <p className="mt-1 font-display text-2xl leading-none text-forest-900">{formatNumber(shelfRange.cold, { maximumFractionDigits: 1 })}<span className="ml-0.5 text-[10px] font-sans font-bold">d</span></p>
                    </div>
                  </div>
                  <div className="mt-2.5 flex items-center justify-between rounded-lg border border-forest-500/15 bg-forest-500/[0.05] px-3 py-1.5 text-[10px]">
                    <span className="font-semibold text-forest-800/55">Days gained with cold storage</span>
                    <span className="flex items-center gap-0.5 font-bold text-forest-700"><ArrowUp className="h-3 w-3" /> {formatNumber(shelfRange.gained, { maximumFractionDigits: 1 })} days</span>
                  </div>
                  <div className="mt-2">
                    <DualShelfChart data={shelfLife.degradation} height={150} />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge tone={shelfLife.weather_risk === 'high' || shelfLife.weather_risk === 'extreme' ? 'red' : shelfRiskTone(shelfLife.weather_risk)}>
                      {weatherTone(shelfLife.weather_risk).label} weather stress
                    </Badge>
                    <span className="text-[9px] text-forest-800/40">
                      {shelfLife.recommended_mode === 'cold' ? 'Cooling strongly recommended' : 'Ambient handling viable'}
                    </span>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <SectionTitle title="What this means on the farm" description="Practical moves for the next 72 hours" />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {[
            { icon: Sun, title: 'Harvest early', detail: `Before 10:00 to avoid the ${summary.max_temp_c ?? 'peak'}°C afternoon heat.`, tone: 'bg-sun-100 text-[#8a611c]' },
            { icon: Snowflake, title: 'Pre-cool delicate crops', detail: 'Leafy greens and tomatoes benefit most from immediate cold storage.', tone: 'bg-forest-500/10 text-forest-700' },
            { icon: CloudRain, title: 'Plan around rain', detail: `${summary.rain_total_mm ?? 0} mm expected. Keep crates covered and raised off the ground.`, tone: 'bg-sky-100 text-sky-700' },
          ].map((item) => (
            <div key={item.title} className="flex gap-3 rounded-xl border border-forest-950/[0.06] bg-cream-50/60 p-3.5">
              <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', item.tone)}>
                <item.icon className="h-4 w-4" />
              </span>
              <div>
                <p className="text-[11px] font-bold text-forest-950">{item.title}</p>
                <p className="mt-0.5 text-[10px] leading-relaxed text-forest-800/45">{item.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

function shelfRiskTone(value) {
  return value === 'medium' || value === 'moderate' ? 'amber' : 'green'
}
