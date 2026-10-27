import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  AlertTriangle, CalendarDays, CheckCircle2, Clock, MapPin, Package, PhoneCall, Snowflake,
  Sun, Truck, Warehouse, XCircle,
} from 'lucide-react'
import {
  Badge, Banner, Button, Card, EmptyState, Field, Input, Modal, PageHeader, ProgressBar,
  SectionTitle, Segmented, Select, Skeleton, StatCard, Textarea,
} from '../../components/ui'
import { api } from '../../lib/api'
import { useApi } from '../../lib/useApi'
import { useToast } from '../../context/ToastContext'
import { useAuth } from '../../context/AuthContext'
import {
  cn, formatDate, formatKES, formatKg, formatNumber,
} from '../../lib/utils'

const CROP_OPTIONS = [
  ['produce', 'Fresh produce'], ['tomato', 'Tomato'], ['kale', 'Kale'], ['avocado', 'Avocado'],
  ['mango', 'Mango'], ['potato', 'Potato'], ['onion', 'Onion'], ['cabbage', 'Cabbage'], ['banana', 'Banana'],
]

const STATUS_TONE = {
  pending: 'amber',
  active: 'green',
  completed: 'neutral',
  cancelled: 'neutral',
}

function FacilityCard({ facility, onBook }) {
  const isMobile = facility.type === 'mobile'
  const Icon = isMobile ? Truck : Sun
  const full = facility.available_kg <= 0
  const closed = ['maintenance', 'offline'].includes(facility.status)

  return (
    <Card hover className="flex flex-col gap-3.5">
      <div className="flex items-start gap-3">
        <span className={cn(
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl',
          isMobile ? 'bg-sky-100 text-sky-700' : 'bg-sun-100 text-[#8a611c]',
        )}>
          <Icon className="h-5 w-5" strokeWidth={1.9} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-display text-[1rem] leading-tight text-forest-950">{facility.name}</p>
              <p className="mt-0.5 flex items-center gap-1 text-[10px] text-forest-800/45">
                <MapPin className="h-2.5 w-2.5" /> {facility.region}
                {facility.distance_km != null ? <span>· {facility.distance_km} km away</span> : null}
              </p>
            </div>
            <Badge tone={facility.status === 'available' ? 'green' : facility.status === 'full' ? 'clay' : facility.status === 'in_transit' ? 'sky' : 'amber'}>
              {facility.status_label}
            </Badge>
          </div>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between text-[10px] font-semibold text-forest-800/55">
          <span className={full ? 'text-clay-500' : 'text-forest-600'}>{formatNumber(facility.available_kg)} kg free</span>
          <span className="text-forest-800/40">{facility.temperature_c}°C · KES {facility.price_per_kg_day}/kg/day</span>
        </div>
        <ProgressBar
          value={facility.utilization}
          tone={facility.utilization > 85 ? 'red' : facility.utilization > 65 ? 'amber' : 'forest'}
          className="mt-1.5"
        />
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-forest-950/[0.06] pt-3">
        <p className="text-[10px] text-forest-800/40">
          {isMobile ? 'Mobile cold room' : 'Solar freezer'} · {facility.code}
        </p>
        <Button size="sm" icon={Snowflake} onClick={() => onBook(facility)} disabled={full || closed}>
          {full ? 'Full' : closed ? 'Unavailable' : 'Book space'}
        </Button>
      </div>
    </Card>
  )
}

function BookingRow({ booking, onCancel, busy }) {
  const isActive = booking.status === 'active'
  return (
    <div className="rounded-2xl border border-forest-950/[0.06] bg-cream-50/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', isActive ? 'bg-forest-500/10 text-forest-700' : 'bg-cream-200 text-forest-700/60')}>
            {isActive ? <Snowflake className="h-4 w-4" /> : <Package className="h-4 w-4" />}
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-bold text-forest-950">{booking.facility.name}</p>
            <p className="mt-0.5 text-[10px] text-forest-800/45">
              {booking.crop_label} · {formatKg(booking.quantity_kg)} · {booking.days} day{booking.days === 1 ? '' : 's'} from {formatDate(booking.start_date)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={STATUS_TONE[booking.status] || 'neutral'}>{booking.status_label}</Badge>
          {['pending', 'active'].includes(booking.status) ? (
            <Button size="sm" variant="softDanger" icon={XCircle} loading={busy} onClick={() => onCancel(booking)}>
              Cancel
            </Button>
          ) : null}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-forest-950/[0.06] pt-2.5">
        <p className="text-[10px] text-forest-800/40">
          {booking.ref}{booking.scan_ref ? ` · scan ${booking.scan_ref}` : ''}
        </p>
        <p className="text-[11px] font-bold text-forest-950">{formatKES(booking.total_cost)}</p>
      </div>
    </div>
  )
}

export default function ColdStorage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const location = useLocation()
  const navigate = useNavigate()
  const facilitiesApi = useApi('/storage/facilities?series=1')
  const bookingsApi = useApi('/storage/bookings')

  const [filter, setFilter] = useState('all')
  const [bookingOpen, setBookingOpen] = useState(false)
  const [facility, setFacility] = useState(null)
  const [form, setForm] = useState({ crop: 'tomato', quantity_kg: 100, start_date: '', days: 3, notes: '' })
  const [scanId, setScanId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [cancelBusy, setCancelBusy] = useState(null)

  const facilities = facilitiesApi.data?.facilities || []
  const summary = facilitiesApi.data?.summary || {}
  const bookings = bookingsApi.data?.bookings || []

  const today = user?.today || new Date().toISOString().slice(0, 10)

  const openBooking = (nextFacility, preset = {}) => {
    setFacility(nextFacility)
    setForm({
      crop: preset.crop || 'tomato',
      quantity_kg: Math.min(100, nextFacility?.available_kg || 100),
      start_date: today,
      days: 3,
      notes: '',
    })
    setScanId(preset.scanId || null)
    setFormError('')
    setBookingOpen(true)
  }

  useEffect(() => {
    const state = location.state
    if (!state?.openBooking) return
    const list = facilitiesApi.data?.facilities
    const target = state.facility || list?.find((item) => item.available_kg > 0) || list?.[0]
    if (target) {
      openBooking(target, { crop: state.crop, scanId: state.scanId })
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location.state, facilitiesApi.data, location.pathname, navigate])

  const visible = useMemo(
    () => (filter === 'all' ? facilities : facilities.filter((item) => item.type === filter)),
    [facilities, filter],
  )

  const statusCounts = useMemo(() => {
    const counts = { all: bookings.length, pending: 0, active: 0, completed: 0, cancelled: 0 }
    bookings.forEach((booking) => { counts[booking.status] = (counts[booking.status] || 0) + 1 })
    return counts
  }, [bookings])

  const visibleBookings = useMemo(
    () => (statusFilter === 'all' ? bookings : bookings.filter((booking) => booking.status === statusFilter)),
    [bookings, statusFilter],
  )

  const minDate = today

  const cost = (Number(form.quantity_kg) || 0) * (Number(form.days) || 0) * (facility?.price_per_kg_day || 3.5)

  const submit = async () => {
    if (!facility) return
    setFormError('')
    const quantity = Number(form.quantity_kg)
    const days = Number(form.days)
    if (!quantity || quantity < 10) {
      setFormError('Minimum booking is 10 kg.')
      return
    }
    if (quantity > facility.available_kg) {
      setFormError(`Only ${formatNumber(facility.available_kg)} kg is available at ${facility.name}.`)
      return
    }
    if (!days || days < 1 || days > 14) {
      setFormError('Book between 1 and 14 days.')
      return
    }
    setSaving(true)
    try {
      await api.post('/storage/bookings', {
        facility_id: facility.id,
        crop: form.crop,
        quantity_kg: quantity,
        start_date: form.start_date || today,
        days,
        notes: form.notes,
        scan_id: scanId || undefined,
      })
      toast({
        type: 'success',
        title: 'Storage request sent',
        message: `${formatKg(quantity)} at ${facility.name}. Our team will confirm shortly.`,
      })
      setBookingOpen(false)
      setStatusFilter('pending')
      bookingsApi.reload({ silent: true })
      facilitiesApi.reload({ silent: true })
    } catch (err) {
      setFormError(err.message || 'Could not submit the booking.')
    } finally {
      setSaving(false)
    }
  }

  const cancel = async (booking) => {
    setCancelBusy(booking.id)
    try {
      await api.post(`/storage/bookings/${booking.id}/cancel`)
      toast({ type: 'success', title: 'Booking cancelled', message: `${booking.ref} was released.` })
      bookingsApi.reload({ silent: true })
      facilitiesApi.reload({ silent: true })
    } catch (err) {
      toast({ type: 'error', title: 'Could not cancel', message: err.message })
    } finally {
      setCancelBusy(null)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Sentinel · cold-chain guardian"
        title="Sentinel"
        description="Sentinel is your harvest's cold-chain guardian. It watches the forecast, finds cold space within reach, and holds your produce until market day."
        actions={
          <Button variant="accent" icon={Snowflake} disabled={!facilities.length} onClick={() => openBooking(facilities.find((item) => item.available_kg > 0) || facilities[0])}>
            Reserve space
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={Warehouse} label="Space free" value={formatNumber(summary.available_kg || 0)} suffix="kg" hint={`Across ${summary.count || 0} Sentinel units`} tone="forest" />
        <StatCard icon={Truck} label="Mobile cold rooms" value={summary.mobile || 0} suffix="units" hint="Come to your collection route" tone="sky" />
        <StatCard icon={Sun} label="Solar freezers" value={summary.solar || 0} suffix="units" hint="Fixed at aggregation points" tone="amber" />
      </div>

      <Card>
        <SectionTitle
          title="Cold rooms near you"
          description={facilitiesApi.data ? `Sorted by distance from ${user?.region || 'your farm'}` : 'Loading the Sentinel network'}
          action={
            <Segmented
              size="sm"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'All', count: summary.count },
                { value: 'mobile', label: 'Mobile', count: summary.mobile },
                { value: 'solar', label: 'Solar', count: summary.solar },
              ]}
            />
          }
        />
        {facilitiesApi.loading && !facilities.length ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((key) => <Skeleton key={key} className="h-80 w-full" />)}
          </div>
        ) : facilitiesApi.error ? (
          <Banner tone="danger" icon={AlertTriangle} title="Could not load storage units">
            {facilitiesApi.error}
            <div className="mt-2"><Button size="sm" variant="secondary" onClick={() => facilitiesApi.reload()}>Try again</Button></div>
          </Banner>
        ) : visible.length ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((item) => (
              <FacilityCard key={item.id} facility={item} onBook={openBooking} />
            ))}
          </div>
        ) : (
          <EmptyState icon={Snowflake} title="No units match this filter" description="Try all units or refresh the network." />
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-8">
          <SectionTitle
            title="Your bookings"
            description="Active and past storage requests"
            action={<Badge tone="neutral">{bookings.length} total</Badge>}
          />
          <Segmented
            size="sm"
            className="mb-4 flex-wrap"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: 'all', label: 'All', count: statusCounts.all },
              { value: 'pending', label: 'Pending', count: statusCounts.pending },
              { value: 'active', label: 'Active', count: statusCounts.active },
              { value: 'completed', label: 'Completed', count: statusCounts.completed },
              { value: 'cancelled', label: 'Cancelled', count: statusCounts.cancelled },
            ]}
          />
          {bookingsApi.loading && !bookings.length ? (
            <div className="space-y-2">{[0, 1].map((key) => <Skeleton key={key} className="h-32 w-full" />)}</div>
          ) : visibleBookings.length ? (
            <div className="space-y-3">
              {visibleBookings.map((booking) => (
                <BookingRow key={booking.id} booking={booking} onCancel={cancel} busy={cancelBusy === booking.id} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Snowflake}
              title="No bookings here"
              description="Pick a unit above and reserve space for your next harvest."
              action={<Button size="sm" icon={Snowflake} onClick={() => openBooking(facilities.find((item) => item.available_kg > 0) || facilities[0])}>Book storage</Button>}
            />
          )}
        </Card>

        <div className="space-y-4 xl:col-span-4">
          <Card>
            <SectionTitle title="How Sentinel works" description="Three steps from harvest to cold space" />
            <ol className="space-y-3">
              {[
                { icon: Snowflake, title: 'Find a unit', detail: 'Mobile rooms come to collection routes; solar freezers sit at aggregation points.' },
                { icon: CalendarDays, title: 'Reserve in seconds', detail: 'Choose crop, kilos and days. Minimum 10 kg, up to 14 days.' },
                { icon: CheckCircle2, title: 'Drop off and stay fresh', detail: 'Our team confirms, and Sentinel keeps the lot cold until market.' },
              ].map((step, index) => (
                <li key={step.title} className="flex gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-forest-500/10 text-forest-700">
                    <step.icon className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-[11px] font-bold text-forest-950">{index + 1}. {step.title}</p>
                    <p className="mt-0.5 text-[10px] leading-relaxed text-forest-800/45">{step.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>

          <Card padded={false} className="overflow-hidden border-forest-900">
            <div className="bg-forest-950 p-5 text-cream-50">
              <div className="flex items-center gap-2 text-agri-lime">
                <PhoneCall className="h-4 w-4" />
                <span className="text-[10px] font-bold uppercase tracking-[0.16em]">Sentinel on USSD</span>
              </div>
              <p className="mt-2 font-display text-lg leading-tight">No smartphone or data?</p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-cream-100/55">
                Dial <span className="font-bold text-cream-50">*384*74#</span>. Sentinel lists its services and your nearest cold rooms.
                Choose <span className="font-semibold text-cream-50">2 · Cold storage</span> and follow the prompts.
              </p>
              <div className="mt-3 rounded-xl border border-cream-50/10 bg-cream-50/[0.05] px-3 py-2 font-mono text-[10px] leading-relaxed text-cream-100/60">
                2 → 1 → tomato → 120 kg → 3 days
              </div>
            </div>
          </Card>
        </div>
      </div>

      <Modal
        open={bookingOpen}
        onClose={() => setBookingOpen(false)}
        title="Reserve Sentinel space"
        subtitle={facility ? `${facility.name} · ${facility.code} · ${facility.region}` : 'Choose a unit'}
        maxWidth="max-w-xl"
        footer={
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-forest-800/40">Estimated cost</p>
              <p className="font-display text-xl text-forest-950">{formatKES(cost)}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setBookingOpen(false)}>Cancel</Button>
              <Button icon={Snowflake} loading={saving} onClick={submit} disabled={!facility}>Confirm booking</Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          {!facility ? (
            <Banner tone="warning" icon={AlertTriangle} title="No unit selected">Choose a storage unit from the network first.</Banner>
          ) : (
            <div className="flex items-center gap-3 rounded-xl border border-forest-500/20 bg-forest-500/[0.06] px-3.5 py-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-forest-950 text-agri-lime">
                {facility.type === 'mobile' ? <Truck className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-forest-950">{facility.name}</p>
                <p className="text-[10px] text-forest-800/50">
                  {formatNumber(facility.available_kg)} kg available · {facility.temperature_c}°C · KES {facility.price_per_kg_day}/kg/day
                </p>
              </div>
              {scanId ? <Badge tone="lime">Scan linked</Badge> : null}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Crop">
              <Select value={form.crop} onChange={(event) => setForm((prev) => ({ ...prev, crop: event.target.value }))}>
                {CROP_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </Select>
            </Field>
            <Field label="Quantity" hint={facility ? `max ${formatNumber(facility.available_kg)} kg` : ''}>
              <Input
                type="number"
                min={10}
                max={facility?.available_kg || undefined}
                step={5}
                value={form.quantity_kg}
                onChange={(event) => setForm((prev) => ({ ...prev, quantity_kg: event.target.value }))}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Start date">
              <Input type="date" min={minDate} value={form.start_date || today} onChange={(event) => setForm((prev) => ({ ...prev, start_date: event.target.value }))} />
            </Field>
            <Field label="Duration (days)" hint="1–14 days">
              <Input
                type="number"
                min={1}
                max={14}
                value={form.days}
                onChange={(event) => setForm((prev) => ({ ...prev, days: event.target.value }))}
              />
            </Field>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {[1, 2, 3, 5, 7, 10, 14].map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => setForm((prev) => ({ ...prev, days }))}
                className={cn(
                  'rounded-full border px-3 py-1 text-[10px] font-bold transition',
                  Number(form.days) === days
                    ? 'border-forest-800 bg-forest-950 text-cream-50'
                    : 'border-forest-950/10 bg-cream-50 text-forest-800/55 hover:border-forest-500/30',
                )}
              >
                {days}d
              </button>
            ))}
          </div>

          <Field label="Notes for the team" hint="Optional">
            <Textarea
              value={form.notes}
              onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
              placeholder="Collection time, crate count, handling instructions…"
              className="min-h-[80px]"
            />
          </Field>

          <div className="rounded-xl bg-cream-100/70 px-3.5 py-3">
            <div className="flex items-center justify-between text-[11px] text-forest-800/55">
              <span>{formatNumber(form.quantity_kg || 0)} kg × {form.days || 0} days × KES {facility?.price_per_kg_day || 3.5}</span>
              <span className="font-bold text-forest-950">{formatKES(cost)}</span>
            </div>
            <p className="mt-1 flex items-center gap-1 text-[10px] text-forest-800/40">
              <Clock className="h-3 w-3" /> The team confirms availability before storage starts.
            </p>
          </div>

          {formError ? (
            <div className="rounded-xl border border-rose-500/20 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800">{formError}</div>
          ) : null}
        </div>
      </Modal>
    </div>
  )
}
