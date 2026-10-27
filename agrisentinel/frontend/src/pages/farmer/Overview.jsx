import { useNavigate } from 'react-router-dom'
import {
  ArrowRight, ArrowUpRight, CloudSun, Droplets, Leaf, LifeBuoy, LineChart, Package,
  ScanLine, Snowflake, Sparkles, Sun, TriangleAlert, Wallet, Weight,
} from 'lucide-react'
import {
  Avatar, Badge, Banner, Button, Card, EmptyState, PageHeader, ProgressBar, ScoreRing,
  SectionTitle, Skeleton, StatCard,
} from '../../components/ui'
import { ScanDrawer, ShelfLifeGrid, WeatherMini } from '../../components/ScanInsight'
import { TrendArea } from '../../components/charts'
import { useApi } from '../../lib/useApi'
import { useAuth } from '../../context/AuthContext'
import { useState } from 'react'
import {
  CROP_ICONS, GRADE_TONES, cn, formatDate, formatKES, formatKg, formatNumber, mediaSrc,
  relativeTime, weatherIcon,
} from '../../lib/utils'

export default function FarmerOverview() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data, loading, error, reload } = useApi('/farmer/overview')
  const [scanId, setScanId] = useState(null)

  const handleBook = (scan, attach) => {
    navigate('/farmer/storage', { state: { crop: scan.crop, scanId: attach ? scan.id : null, openBooking: true } })
  }

  if (loading && !data) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-24 w-full" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((key) => <Skeleton key={key} className="h-32 w-full" />)}
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <Skeleton className="h-80 xl:col-span-8" />
          <Skeleton className="h-80 xl:col-span-4" />
        </div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <Banner tone="danger" icon={TriangleAlert} title="Could not load your dashboard">
        {error}
        <div className="mt-2"><Button size="sm" variant="secondary" onClick={() => reload()}>Try again</Button></div>
      </Banner>
    )
  }

  const stats = data?.stats || {}
  const weather = data?.weather || {}
  const current = weather.current || {}
  const summary = weather.summary || {}
  const latest = data?.recent_scans?.[0]
  const bookings = data?.bookings || []
  const advisories = data?.advisories || []
  const notes = data?.notifications || []
  const trend = data?.quality_trend || []
  const gradeCounts = stats.grade_counts || {}
  const firstName = (user?.name || '').split(' ')[0]

  const grades = ['A', 'B', 'C', 'D'].map((grade) => ({
    grade,
    count: gradeCounts[grade] || 0,
    tone: GRADE_TONES[grade],
  }))
  const gradeTotal = grades.reduce((sum, item) => sum + item.count, 0)

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Farmer workspace"
        title={`Habari, ${firstName || 'farmer'}`}
        description={`${user?.farm_name || 'Your farm'} · ${user?.region || 'Nakuru'}. Here is how your harvest is holding up today.`}
        actions={
          <>
            <Button variant="secondary" icon={LifeBuoy} onClick={() => navigate('/farmer/support')}>
              Get help
            </Button>
            <Button variant="accent" icon={ScanLine} onClick={() => navigate('/farmer/scan')}>
              New quality scan
            </Button>
          </>
        }
      />

      {notes.length ? (
        <Banner
          tone="success"
          icon={Sparkles}
          title={notes[0].title}
          action={<Button size="sm" variant="ghost" onClick={() => navigate('/farmer/scan')}>Open</Button>}
        >
          {notes[0].body}
        </Banner>
      ) : null}

      {advisories.length ? (
        <Banner
          tone={advisories[0].level === 'high' ? 'warning' : 'info'}
          icon={TriangleAlert}
          title={advisories[0].title}
          action={<Button size="sm" variant="ghost" onClick={() => navigate('/farmer/weather')}>Forecast</Button>}
        >
          {advisories[0].detail}
        </Banner>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={GaugeIcon}
          label="Average quality"
          value={stats.avg_quality || 0}
          suffix="/100"
          hint={`${stats.scans_30d || 0} scans in the last 30 days`}
          tone="forest"
        />
        <StatCard
          icon={Weight}
          label="In cold storage"
          value={formatNumber(stats.kg_stored || 0)}
          suffix="kg"
          hint={`${stats.active_bookings || 0} active booking${stats.active_bookings === 1 ? '' : 's'}`}
          tone="sky"
        />
        <StatCard
          icon={Wallet}
          label="Loss avoided"
          value={formatKES(stats.loss_avoided_kes || 0)}
          hint={`${formatNumber(stats.loss_avoided_kg || 0)} kg protected by cold chain`}
          tone="lime"
        />
        <StatCard
          icon={ScanLine}
          label="Latest grade"
          value={stats.latest_grade ? `Grade ${stats.latest_grade}` : '—'}
          hint={stats.latest_shelf_cold ? `${formatNumber(stats.latest_shelf_cold, { maximumFractionDigits: 1 })} cold shelf days` : 'Scan your first harvest'}
          tone="amber"
          onClick={() => navigate('/farmer/scan')}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-8">
          <SectionTitle
            title="Harvest quality trajectory"
            description="Quality scores from your most recent scans"
            action={
              <Button size="sm" variant="ghost" onClick={() => navigate('/farmer/scan')}>
                All scans <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            }
          />
          {trend.length ? (
            <TrendArea data={trend} dataKey="score" label="Quality score" height={205} color="#28795d" />
          ) : (
            <EmptyState
              icon={ScanLine}
              title="No scans yet"
              description="Upload a photo of your harvest to start tracking quality over time."
              action={<Button size="sm" icon={ScanLine} onClick={() => navigate('/farmer/scan')}>Scan produce</Button>}
            />
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-forest-950/[0.06] pt-4">
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-forest-800/40">Grade mix</span>
            {grades.map((item) => (
              <span key={item.grade} className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-semibold', item.tone.soft)}>
                <span className="font-bold">{item.grade}</span>
                {item.count}
                <span className="opacity-50">{gradeTotal ? Math.round((item.count / gradeTotal) * 100) : 0}%</span>
              </span>
            ))}
            <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-semibold text-forest-600">
              <LineChart className="h-3 w-3" /> Cold chain protects premium grades
            </span>
          </div>
        </Card>

        <Card className="relative overflow-hidden xl:col-span-4">
          <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-agri-lime/20 blur-2xl" />
          <SectionTitle
            title="Weather window"
            description={weather.location?.name || user?.region}
            action={<Badge tone={summary.risk === 'high' ? 'red' : summary.risk === 'moderate' ? 'amber' : 'green'} dot>{summary.headline || 'Forecast'}</Badge>}
          />
          <div className="flex items-center gap-4">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-forest-950 text-agri-lime">
              {(() => {
                const Icon = weatherIcon(current.icon)
                return <Icon className="h-8 w-8" strokeWidth={1.7} />
              })()}
            </span>
            <div>
              <p className="font-display text-4xl leading-none text-forest-950">
                {current.temp_c != null ? `${Math.round(current.temp_c)}°` : '—'}
              </p>
              <p className="mt-1 text-xs font-semibold text-forest-800/60">{current.condition || 'Live forecast'}</p>
              <p className="mt-0.5 text-[10px] text-forest-800/40">
                Feels {Math.round(current.feels_like_c ?? 0)}° · {current.humidity ?? '—'}% RH
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {(weather.daily || []).slice(0, 3).map((day) => <WeatherMini key={day.date} day={day} />)}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
            <div className="flex items-center gap-1.5 rounded-lg bg-cream-100/70 px-2.5 py-2 text-forest-800/60">
              <Droplets className="h-3.5 w-3.5 text-sky-500" /> {summary.rain_total_mm ?? 0} mm rain
            </div>
            <div className="flex items-center gap-1.5 rounded-lg bg-cream-100/70 px-2.5 py-2 text-forest-800/60">
              <Sun className="h-3.5 w-3.5 text-sun-500" /> Peak {summary.max_temp_c ?? '—'}°
            </div>
          </div>
          <Button variant="secondary" size="sm" className="mt-4 w-full" icon={CloudSun} onClick={() => navigate('/farmer/weather')}>
            Open 5-day forecast
          </Button>
          <p className="mt-2 text-center text-[9px] text-forest-800/35">{weather.source || 'Local forecast'} · updated {relativeTime(weather.updated_at) || 'now'}</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-5" padded={false}>
          <div className="flex items-center justify-between px-5 pt-5">
            <SectionTitle title="Latest scan" description={latest ? `${latest.crop_label} · ${latest.created_label}` : 'No scans yet'} className="mb-0" />
            {latest ? <Badge tone={latest.grade === 'A' ? 'green' : latest.grade === 'B' ? 'lime' : latest.grade === 'C' ? 'amber' : 'red'}>Grade {latest.grade}</Badge> : null}
          </div>
          {latest ? (
            <>
              <div className="m-4 overflow-hidden rounded-2xl">
                {latest.image ? (
                  <img src={mediaSrc(latest.image)} alt={latest.crop_label} className="h-44 w-full object-cover" />
                ) : (
                  <div className="flex h-44 items-center justify-center bg-forest-500/10">
                    {(() => {
                      const Icon = CROP_ICONS[latest.crop] || Leaf
                      return <Icon className="h-10 w-10 text-forest-600" />
                    })()}
                  </div>
                )}
              </div>
              <div className="-mt-2 px-5 pb-5">
                <div className="flex items-center gap-3">
                  <ScoreRing score={latest.quality_score} size={76} stroke={7}>
                    <span className="font-display text-xl leading-none text-forest-950">{latest.quality_score}</span>
                  </ScoreRing>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-bold text-forest-950">{latest.ref}</p>
                      <span className="text-[10px] font-semibold text-forest-800/40">{latest.recommended_mode === 'cold' ? 'Cool now' : 'Ambient ok'}</span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-forest-800/50">{latest.location_name} · {latest.farmer_name}</p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <div className="rounded-lg bg-cream-100/70 px-2 py-1.5">
                        <p className="text-[9px] uppercase tracking-wider text-forest-800/40">Ambient</p>
                        <p className="text-xs font-bold text-forest-950">{formatNumber(latest.shelf_ambient_days, { maximumFractionDigits: 1 })}d</p>
                      </div>
                      <div className="rounded-lg bg-forest-500/10 px-2 py-1.5">
                        <p className="text-[9px] uppercase tracking-wider text-forest-800/40">Cold</p>
                        <p className="text-xs font-bold text-forest-900">{formatNumber(latest.shelf_cold_days, { maximumFractionDigits: 1 })}d</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <Button size="sm" className="flex-1" onClick={() => setScanId(latest.id)}>View analysis</Button>
                  <Button size="sm" variant="limeSoft" icon={Snowflake} onClick={() => handleBook(latest, true)}>Store</Button>
                </div>
              </div>
            </>
          ) : (
            <div className="p-5 pt-3">
              <EmptyState
                icon={ScanLine}
                title="Your first scan awaits"
                description="A single photo unlocks quality grading, shelf-life and weather risk."
                action={<Button size="sm" icon={ScanLine} onClick={() => navigate('/farmer/scan')}>Scan produce</Button>}
              />
            </div>
          )}
        </Card>

        <Card className="xl:col-span-4">
          <SectionTitle
            title="Active cold storage"
            description="Crops currently protected in the network"
            action={<Button size="sm" variant="ghost" onClick={() => navigate('/farmer/storage')}>Manage <ArrowRight className="h-3.5 w-3.5" /></Button>}
          />
          {bookings.length ? (
            <div className="space-y-3">
              {bookings.map((booking) => (
                <div key={booking.id} className="rounded-xl border border-forest-950/[0.06] bg-cream-50/70 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-forest-500/10 text-forest-700">
                        {booking.facility.type?.toLowerCase().includes('mobile') ? <Package className="h-4 w-4" /> : <Snowflake className="h-4 w-4" />}
                      </span>
                      <div>
                        <p className="text-[11px] font-bold text-forest-950">{booking.facility.name}</p>
                        <p className="text-[10px] text-forest-800/45">{booking.facility.code} · {booking.facility.region}</p>
                      </div>
                    </div>
                    <Badge tone={booking.status === 'active' ? 'green' : 'amber'}>{booking.status_label}</Badge>
                  </div>
                  <div className="mt-2.5 flex items-center justify-between text-[10px] text-forest-800/55">
                    <span>{formatKg(booking.quantity_kg)} · {booking.days}d · {booking.crop_label}</span>
                    <span className="font-bold text-forest-950">{formatKES(booking.total_cost)}</span>
                  </div>
                  <ProgressBar
                    value={booking.status === 'active' ? 72 : 24}
                    tone={booking.status === 'active' ? 'forest' : 'amber'}
                    height="h-1.5"
                    className="mt-2"
                  />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Snowflake}
              title="No active bookings"
              description="Reserve a mobile cold room or solar freezer at an aggregation point."
              action={<Button size="sm" icon={Snowflake} onClick={() => navigate('/farmer/storage')}>Find storage</Button>}
            />
          )}
        </Card>

        <Card className="xl:col-span-3">
          <SectionTitle title="Quick actions" description="Everything within two taps" />
          <div className="space-y-2">
            {[
              { label: 'Scan a harvest', detail: 'Camera or upload', icon: ScanLine, to: '/farmer/scan', tone: 'bg-forest-950 text-agri-lime' },
              { label: 'Reserve cold room', detail: 'Mobile & solar units', icon: Snowflake, to: '/farmer/storage', tone: 'bg-forest-500/10 text-forest-700' },
              { label: 'Check the weather', detail: '3-day shelf impact', icon: CloudSun, to: '/farmer/weather', tone: 'bg-sun-100 text-[#8a611c]' },
              { label: 'Talk to support', detail: 'Tickets & USSD', icon: LifeBuoy, to: '/farmer/support', tone: 'bg-sky-100 text-sky-700' },
            ].map((action) => (
              <button
                key={action.label}
                type="button"
                onClick={() => navigate(action.to)}
                className="group flex w-full items-center gap-3 rounded-xl border border-forest-950/[0.06] bg-cream-50/70 px-3 py-2.5 text-left transition hover:border-forest-500/25 hover:bg-white"
              >
                <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', action.tone)}>
                  <action.icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-bold text-forest-950">{action.label}</span>
                  <span className="block text-[10px] text-forest-800/40">{action.detail}</span>
                </span>
                <ArrowUpRight className="h-3.5 w-3.5 text-forest-800/25 transition group-hover:text-forest-700" />
              </button>
            ))}
          </div>
          <div className="mt-4 rounded-xl bg-forest-950 px-3.5 py-3 text-cream-50">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-agri-lime/80">No smartphone?</p>
            <p className="mt-1 text-[11px] leading-relaxed text-cream-100/60">
              Dial <span className="font-bold text-cream-50">*384*74#</span> to book storage or check a scan reference.
            </p>
          </div>
        </Card>
      </div>

      <ScanDrawer open={Boolean(scanId)} scanId={scanId} onClose={() => setScanId(null)} onBookCold={handleBook} />
    </div>
  )
}

function GaugeIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 14 15.5 9.5" />
      <path d="M3.5 18a9 9 0 1 1 17 0" />
      <circle cx="12" cy="14" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  )
}
