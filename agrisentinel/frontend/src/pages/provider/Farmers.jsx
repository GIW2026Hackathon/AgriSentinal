import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, Leaf, Mail, MapPin, Phone, Search, Snowflake, Sprout, TrendingUp, Users, ScanLine,
} from 'lucide-react'
import {
  Avatar, Badge, Banner, Card, Drawer, EmptyState, PageHeader, SectionTitle, Segmented,
  Skeleton, StatCard,
} from '../../components/ui'
import { api } from '../../lib/api'
import { useApi } from '../../lib/useApi'
import { formatDate, formatKg, mediaSrc, relativeTime, scoreTone } from '../../lib/utils'

const RISK_META = {
  high: { label: 'Needs follow-up', tone: 'red' },
  low: { label: 'Healthy', tone: 'green' },
  new: { label: 'New member', tone: 'sky' },
}

function FarmerDetail({ farmerId }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    api
      .get(`/provider/farmers/${farmerId}`)
      .then((payload) => {
        if (active) setData(payload)
      })
      .catch((err) => {
        if (active) setError(err.message || 'Could not load farmer')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [farmerId])

  if (loading) {
    return <div className="space-y-3"><Skeleton className="h-24 w-full" /><Skeleton className="h-20 w-full" /><Skeleton className="h-40 w-full" /></div>
  }
  if (error) return <Banner tone="danger" icon={AlertTriangle} title="Could not load farmer">{error}</Banner>
  if (!data) return null

  const { farmer, stats, scans, bookings, tickets } = data

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-2xl border border-forest-950/[0.06] bg-cream-50/70 p-4">
        <Avatar name={farmer.name} size="xl" />
        <div className="min-w-0 flex-1">
          <p className="font-display text-xl leading-tight text-forest-950">{farmer.name}</p>
          <p className="mt-0.5 text-[11px] font-semibold text-forest-600">{farmer.farm_name || 'Smallholder farm'}</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-forest-800/50">
            <span className="flex items-center gap-1"><MapPin className="h-2.5 w-2.5" /> {farmer.region}</span>
            <span className="flex items-center gap-1"><Phone className="h-2.5 w-2.5" /> {farmer.phone || 'No phone'}</span>
            <span className="flex items-center gap-1"><Mail className="h-2.5 w-2.5" /> {farmer.email}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Scans', value: stats.scans, icon: ScanLine },
          { label: 'Avg quality', value: stats.avg_score, icon: TrendingUp },
          { label: 'Active storage', value: formatKg(stats.kg_stored), icon: Snowflake },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-forest-950/[0.05] bg-cream-50/60 px-3 py-2.5">
            <p className="flex items-center gap-1 text-[8px] font-bold uppercase tracking-wider text-forest-800/35"><item.icon className="h-2.5 w-2.5" /> {item.label}</p>
            <p className="mt-1 font-display text-base leading-none text-forest-950">{item.value}</p>
          </div>
        ))}
      </div>

      <div>
        <SectionTitle title="Recent scans" description={`${stats.bookings} bookings · ${stats.open_tickets} open support tickets`} />
        {scans.length ? (
          <div className="space-y-1.5">
            {scans.map((scan) => (
              <div key={scan.id} className="flex items-center gap-2.5 rounded-xl border border-forest-950/[0.05] bg-cream-50/60 p-2">
                <span className="h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-forest-500/10">
                  {scan.image ? <img src={mediaSrc(scan.image)} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center"><Leaf className="h-3.5 w-3.5 text-forest-600" /></span>}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-bold text-forest-950">{scan.crop_label} <span className="font-medium text-forest-800/35">· {scan.ref}</span></p>
                  <p className="text-[9px] text-forest-800/40">{scan.created_label}</p>
                </div>
                <span className="text-[11px] font-bold" style={{ color: scoreTone(scan.quality_score).color }}>{scan.quality_score}</span>
                <Badge tone={scan.grade === 'A' ? 'green' : scan.grade === 'B' ? 'lime' : scan.grade === 'C' ? 'amber' : 'red'}>{scan.grade}</Badge>
              </div>
            ))}
          </div>
        ) : <p className="text-[11px] text-forest-800/40">No scans recorded.</p>}
      </div>

      <div>
        <SectionTitle title="Storage bookings" />
        {bookings.length ? (
          <div className="space-y-1.5">
            {bookings.map((booking) => (
              <div key={booking.id} className="flex items-center justify-between gap-2 rounded-xl border border-forest-950/[0.05] bg-cream-50/60 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-bold text-forest-950">{booking.facility.name}</p>
                  <p className="text-[9px] text-forest-800/40">{booking.crop_label} · {formatKg(booking.quantity_kg)} · {booking.days}d from {formatDate(booking.start_date)}</p>
                </div>
                <Badge tone={booking.status === 'active' ? 'green' : booking.status === 'pending' ? 'amber' : 'neutral'}>{booking.status_label}</Badge>
              </div>
            ))}
          </div>
        ) : <p className="text-[11px] text-forest-800/40">No storage bookings.</p>}
      </div>

      <div>
        <SectionTitle title="Support tickets" />
        {tickets.length ? (
          <div className="space-y-1.5">
            {tickets.map((ticket) => (
              <div key={ticket.id} className="rounded-xl border border-forest-950/[0.05] bg-cream-50/60 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-[11px] font-bold text-forest-950">{ticket.subject}</p>
                  <Badge tone={ticket.status === 'resolved' ? 'green' : ticket.status === 'in_progress' ? 'amber' : 'sky'}>{ticket.status_label}</Badge>
                </div>
                <p className="mt-0.5 text-[9px] text-forest-800/40">{ticket.ref} · updated {relativeTime(ticket.updated_at)}</p>
              </div>
            ))}
          </div>
        ) : <p className="text-[11px] text-forest-800/40">No support tickets.</p>}
      </div>
    </div>
  )
}

export default function ProviderFarmers() {
  const { data, loading, error } = useApi('/provider/farmers')
  const [search, setSearch] = useState('')
  const [risk, setRisk] = useState('all')
  const [activeId, setActiveId] = useState(null)

  const farmers = data?.farmers || []

  const counts = useMemo(() => {
    const result = { all: farmers.length, high: 0, low: 0, new: 0 }
    farmers.forEach((farmer) => { result[farmer.risk] = (result[farmer.risk] || 0) + 1 })
    return result
  }, [farmers])

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return farmers.filter((farmer) => {
      if (risk !== 'all' && farmer.risk !== risk) return false
      if (!term) return true
      return [farmer.name, farmer.farm_name, farmer.region, farmer.phone, farmer.email]
        .some((value) => String(value || '').toLowerCase().includes(term))
    })
  }, [farmers, search, risk])

  const activeFarmers = counts.low + counts.high
  const totalStorage = farmers.reduce((sum, farmer) => sum + (farmer.kg_in_storage || 0), 0)
  const activeFarmer = farmers.find((farmer) => farmer.id === activeId)

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Admin console"
        title="Farmers"
        description="Farmer activity, quality and follow-ups."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={Users} label="Registered farmers" value={data?.total ?? farmers.length} hint={`${activeFarmers} with scan activity`} tone="forest" />
        <StatCard icon={AlertTriangle} label="Needs follow-up" value={counts.high || 0} suffix="farmers" hint="Low quality or open tickets" tone="amber" />
        <StatCard icon={Snowflake} label="Produce in storage" value={formatKg(totalStorage)} hint="Across active bookings" tone="sky" />
      </div>

      {error ? <Banner tone="danger" icon={AlertTriangle} title="Farmer network unavailable">{error}</Banner> : null}

      <Card>
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <h3 className="font-display text-[1.1rem] leading-tight text-forest-950">Farmer directory</h3>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-forest-800/35" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search farmers"
                className="h-9 w-full rounded-xl border border-forest-950/10 bg-white/80 pl-9 pr-3 text-xs text-forest-950 placeholder:text-forest-950/30 focus:border-forest-500 focus:outline-none focus:ring-2 focus:ring-forest-500/15 sm:w-56"
              />
            </div>
            <Segmented
              size="sm"
              value={risk}
              onChange={setRisk}
              options={[
                { value: 'all', label: 'All', count: counts.all },
                { value: 'high', label: 'Follow-up', count: counts.high },
                { value: 'low', label: 'Healthy', count: counts.low },
                { value: 'new', label: 'New', count: counts.new },
              ]}
            />
          </div>
        </div>

        {loading && !farmers.length ? (
          <div className="space-y-2">{[0, 1, 2, 3].map((key) => <Skeleton key={key} className="h-20 w-full" />)}</div>
        ) : visible.length ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {visible.map((farmer) => {
              const meta = RISK_META[farmer.risk] || RISK_META.new
              return (
                <button
                  key={farmer.id}
                  type="button"
                  onClick={() => setActiveId(farmer.id)}
                  className="group flex flex-col rounded-2xl border border-forest-950/[0.06] bg-cream-50/70 p-4 text-left transition hover:border-forest-500/30 hover:bg-white hover:shadow-soft"
                >
                  <div className="flex items-start gap-3">
                    <Avatar name={farmer.name} size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-bold text-forest-950">{farmer.name}</p>
                          <p className="truncate text-[10px] text-forest-800/45">{farmer.farm_name || 'Smallholder farm'} · {farmer.region}</p>
                        </div>
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-1.5">
                    {[
                      ['Scans', farmer.scans],
                      ['Quality', farmer.avg_score || '—'],
                      ['Stored', `${formatKg(farmer.kg_in_storage || 0)}`],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-lg bg-cream-100/70 px-1.5 py-1.5 text-center">
                        <p className="text-[8px] font-bold uppercase tracking-wider text-forest-800/30">{label}</p>
                        <p className="text-[10px] font-bold text-forest-950">{value}</p>
                      </div>
                    ))}
                  </div>

                  <p className="mt-3 truncate text-[9px] text-forest-800/40">
                    {farmer.last_scan ? `Last scan ${farmer.last_scan.created_label} · ${farmer.last_scan.quality_score}/100` : 'No scans yet'}
                  </p>
                </button>
              )
            })}
          </div>
        ) : (
          <EmptyState icon={Sprout} title="No farmers match this filter" description="Try a different segment or clear the search." />
        )}
      </Card>

      <Drawer open={Boolean(activeId)} onClose={() => setActiveId(null)} title={activeFarmer?.name || 'Farmer profile'} subtitle={activeFarmer ? `${activeFarmer.farm_name || 'Smallholder'} · ${activeFarmer.region}` : ''} width="max-w-xl">
        {activeId ? <FarmerDetail farmerId={activeId} /> : null}
      </Drawer>
    </div>
  )
}
