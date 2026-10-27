import { useMemo, useState } from 'react'
import {
  AlertTriangle, BatteryCharging, MapPin, Plus, Search, Settings2, Snowflake,
  Sun, Thermometer, Truck, Warehouse, Wrench,
} from 'lucide-react'
import {
  Badge, Banner, Button, Card, EmptyState, Field, Input, Modal, PageHeader, ProgressBar,
  SectionTitle, Segmented, Select, Skeleton, StatCard, Textarea,
} from '../../components/ui'
import { api } from '../../lib/api'
import { useApi } from '../../lib/useApi'
import { useToast } from '../../context/ToastContext'
import { cn, formatKg, formatNumber } from '../../lib/utils'

const REGIONS = ['Nakuru', 'Kiambu', 'Meru', 'Eldoret', 'Naivasha', 'Machakos', 'Kisumu', 'Nyeri']

const STATUS_TONE = {
  available: 'green',
  in_transit: 'sky',
  maintenance: 'amber',
  full: 'clay',
  offline: 'red',
}

const EMPTY_FORM = {
  name: '',
  type: 'solar',
  region: 'Nakuru',
  capacity_kg: 3000,
  target_temp_c: 3,
  solar_kw: 4.5,
  notes: '',
}

export default function ProviderFleet() {
  const { toast } = useToast()
  const { data, loading, error, reload } = useApi('/provider/fleet')

  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [editing, setEditing] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [editError, setEditError] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [serviceBusy, setServiceBusy] = useState(null)

  const units = data?.units || []
  const summary = data?.summary || {}

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return units.filter((unit) => {
      if (filter !== 'all' && unit.type !== filter) return false
      if (!term) return true
      return [unit.name, unit.code, unit.region].some((value) => String(value).toLowerCase().includes(term))
    })
  }, [units, filter, search])

  const createUnit = async () => {
    setFormError('')
    if (form.name.trim().length < 3) {
      setFormError('Give the unit a name with at least 3 characters.')
      return
    }
    setSaving(true)
    try {
      await api.post('/provider/fleet', {
        name: form.name.trim(),
        type: form.type,
        region: form.region,
        capacity_kg: Number(form.capacity_kg),
        target_temp_c: Number(form.target_temp_c),
        solar_kw: Number(form.solar_kw),
        notes: form.notes,
      })
      toast({ type: 'success', title: 'Unit added to fleet', message: `${form.name} is now available for bookings.` })
      setAddOpen(false)
      setForm(EMPTY_FORM)
      reload({ silent: true })
    } catch (err) {
      setFormError(err.message || 'Could not add the unit.')
    } finally {
      setSaving(false)
    }
  }

  const openEdit = (unit) => {
    setEditing(unit)
    setEditForm({
      status: unit.status,
      temperature_c: unit.temperature_c,
      used_kg: unit.used_kg,
      battery_pct: unit.battery_pct,
      notes: unit.notes || '',
    })
    setEditError('')
  }

  const saveEdit = async () => {
    if (!editing) return
    setEditError('')
    setEditSaving(true)
    try {
      await api.patch(`/provider/fleet/${editing.id}`, {
        status: editForm.status,
        temperature_c: Number(editForm.temperature_c),
        used_kg: Number(editForm.used_kg),
        battery_pct: Number(editForm.battery_pct),
        notes: editForm.notes,
      })
      toast({ type: 'success', title: `${editing.code} updated` })
      setEditing(null)
      reload({ silent: true })
    } catch (err) {
      setEditError(err.message || 'Could not update the unit.')
    } finally {
      setEditSaving(false)
    }
  }

  const service = async (unit) => {
    setServiceBusy(unit.id)
    try {
      await api.post(`/provider/fleet/${unit.id}/service`)
      toast({ type: 'success', title: `${unit.code} serviced`, message: 'Battery reset and unit marked available.' })
      reload({ silent: true })
    } catch (err) {
      toast({ type: 'error', title: 'Service failed', message: err.message })
    } finally {
      setServiceBusy(null)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Admin console"
        title="Fleet"
        description="Monitor cold rooms, adjust capacity and dispatch servicing."
        actions={<Button variant="accent" icon={Plus} onClick={() => setAddOpen(true)}>Add unit</Button>}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={Warehouse} label="Units in fleet" value={summary.total ?? 0} hint={`${summary.mobile ?? 0} mobile · ${summary.solar ?? 0} solar`} tone="forest" />
        <StatCard icon={Snowflake} label="Occupied capacity" value={`${summary.utilization ?? 0}%`} hint={`${formatKg(summary.used_kg ?? 0)} of ${formatKg(summary.capacity_kg ?? 0)}`} tone="sky" />
        <StatCard icon={AlertTriangle} label="Needs attention" value={summary.attention ?? 0} suffix="units" hint="Maintenance, offline or low battery" tone="amber" />
      </div>

      {error ? <Banner tone="danger" icon={AlertTriangle} title="Fleet data unavailable">{error}</Banner> : null}

      <Card>
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <h3 className="font-display text-[1.1rem] leading-tight text-forest-950">Cold chain units</h3>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-forest-800/35" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search code, name, region"
                className="h-9 w-full rounded-xl border border-forest-950/10 bg-white/80 pl-9 pr-3 text-xs text-forest-950 placeholder:text-forest-950/30 focus:border-forest-500 focus:outline-none focus:ring-2 focus:ring-forest-500/15 sm:w-56"
              />
            </div>
            <Segmented
              size="sm"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'All', count: summary.total },
                { value: 'mobile', label: 'Mobile', count: summary.mobile },
                { value: 'solar', label: 'Solar', count: summary.solar },
              ]}
            />
          </div>
        </div>

        {loading && !units.length ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">{[0, 1, 2].map((key) => <Skeleton key={key} className="h-64" />)}</div>
        ) : visible.length ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {visible.map((unit) => {
              const isMobile = unit.type === 'mobile'
              const Icon = isMobile ? Truck : Sun
              const alerts = []
              if (unit.temperature_c > unit.target_temp_c + 3) alerts.push(`Running ${unit.temperature_c}°C vs target ${unit.target_temp_c}°C`)
              if (unit.battery_pct < 25) alerts.push(`Battery at ${unit.battery_pct}%`)
              if (unit.status === 'offline') alerts.push('Unit is offline')
              return (
                <div key={unit.id} className="group flex flex-col rounded-[1.4rem] border border-forest-950/[0.07] bg-cream-50/90 p-4 shadow-soft transition hover:shadow-lift">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', isMobile ? 'bg-sky-100 text-sky-700' : 'bg-sun-100 text-[#8a611c]')}>
                        <Icon className="h-4.5 w-4.5" />
                      </span>
                      <div className="min-w-0">
                        <p className="line-clamp-2 text-xs font-bold text-forest-950">{unit.name}</p>
                        <p className="flex items-center gap-1 text-[10px] text-forest-800/45"><MapPin className="h-2.5 w-2.5" /> {unit.region} · {unit.code}</p>
                      </div>
                    </div>
                    <Badge tone={STATUS_TONE[unit.status] || 'neutral'} dot>{unit.status_label}</Badge>
                  </div>

                  <div className="mt-3">
                    <div className="flex items-center justify-between text-[10px] font-semibold text-forest-800/50">
                      <span>{formatKg(unit.used_kg)} / {formatKg(unit.capacity_kg)}</span>
                      <span>{unit.utilization}%</span>
                    </div>
                    <ProgressBar value={unit.utilization} tone={unit.utilization > 85 ? 'red' : unit.utilization > 65 ? 'amber' : 'forest'} height="h-1.5" className="mt-1" />
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-cream-100/70 px-2 py-1.5">
                      <p className="flex items-center gap-0.5 text-[8px] font-bold uppercase tracking-wider text-forest-800/30"><Thermometer className="h-2 w-2" /> Temp</p>
                      <p className={cn('text-[11px] font-bold', unit.temperature_c > unit.target_temp_c + 3 ? 'text-rose-600' : 'text-forest-950')}>{unit.temperature_c}°</p>
                    </div>
                    <div className="rounded-lg bg-cream-100/70 px-2 py-1.5">
                      <p className="flex items-center gap-0.5 text-[8px] font-bold uppercase tracking-wider text-forest-800/30"><BatteryCharging className="h-2 w-2" /> Battery</p>
                      <p className={cn('text-[11px] font-bold', unit.battery_pct < 25 ? 'text-rose-600' : 'text-forest-950')}>{unit.battery_pct}%</p>
                    </div>
                  </div>

                  {alerts.length ? (
                    <p className="mt-2 flex items-start gap-1 rounded-lg bg-rose-50 px-2 py-1.5 text-[9px] font-semibold leading-relaxed text-rose-700">
                      <AlertTriangle className="mt-0.5 h-2.5 w-2.5 shrink-0" /> {alerts.join(' · ')}
                    </p>
                  ) : null}

                  <div className="mt-3 flex gap-2 border-t border-forest-950/[0.05] pt-3">
                    <Button size="sm" variant="secondary" className="flex-1" icon={Settings2} onClick={() => openEdit(unit)}>Adjust</Button>
                    <Button size="sm" variant="limeSoft" className="flex-1" icon={Wrench} loading={serviceBusy === unit.id} onClick={() => service(unit)}>Service</Button>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <EmptyState icon={Truck} title="No units match this view" description="Change the filter or add a new cold chain unit." action={<Button size="sm" icon={Plus} onClick={() => setAddOpen(true)}>Add unit</Button>} />
        )}
      </Card>

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add cold chain unit"
        subtitle="Register a mobile cold room or stationary solar freezer."
        maxWidth="max-w-xl"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button icon={Plus} loading={saving} onClick={createUnit}>Add to fleet</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field label="Unit name" required>
            <Input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="e.g. Nakuru Central Solar Hub" />
          </Field>
          <Field label="Unit type">
            <Segmented
              className="w-full [&>button]:flex-1"
              value={form.type}
              onChange={(value) => setForm((prev) => ({
                ...prev,
                type: value,
                capacity_kg: value === 'mobile' ? 1500 : 3000,
                target_temp_c: value === 'mobile' ? 4 : 3,
                solar_kw: value === 'mobile' ? 2.5 : 4.5,
              }))}
              options={[
                { value: 'mobile', label: 'Mobile cold room', icon: Truck },
                { value: 'solar', label: 'Solar freezer', icon: Sun },
              ]}
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Region">
              <Select value={form.region} onChange={(event) => setForm((prev) => ({ ...prev, region: event.target.value }))}>
                {REGIONS.map((region) => <option key={region} value={region}>{region}</option>)}
              </Select>
            </Field>
            <Field label="Capacity (kg)">
              <Input type="number" min={100} step={100} value={form.capacity_kg} onChange={(event) => setForm((prev) => ({ ...prev, capacity_kg: event.target.value }))} />
            </Field>
            <Field label="Target temperature (°C)">
              <Input type="number" step={0.5} min={1} max={12} value={form.target_temp_c} onChange={(event) => setForm((prev) => ({ ...prev, target_temp_c: event.target.value }))} />
            </Field>
            <Field label="Solar capacity (kW)">
              <Input type="number" step={0.5} min={0} value={form.solar_kw} onChange={(event) => setForm((prev) => ({ ...prev, solar_kw: event.target.value }))} />
            </Field>
          </div>
          <Field label="Operational notes" hint="Optional">
            <Textarea value={form.notes} onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))} placeholder="Access windows, caretaker contact, grid backup…" className="min-h-[80px]" />
          </Field>
          {formError ? <div className="rounded-xl border border-rose-500/20 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800">{formError}</div> : null}
        </div>
      </Modal>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing ? `Adjust ${editing.code}` : 'Adjust unit'}
        subtitle={editing ? `${editing.name} · ${editing.region}` : ''}
        maxWidth="max-w-lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            <Button loading={editSaving} onClick={saveEdit}>Save changes</Button>
          </div>
        }
      >
        {editing ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-xl bg-cream-100/70 px-3.5 py-2.5 text-[10px] text-forest-800/55">
              <Thermometer className="h-3.5 w-3.5 shrink-0" />
              Capacity {formatKg(editing.capacity_kg)} · target {editing.target_temp_c}°C
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Status">
                <Select value={editForm.status} onChange={(event) => setEditForm((prev) => ({ ...prev, status: event.target.value }))}>
                  {['available', 'in_transit', 'maintenance', 'full', 'offline'].map((status) => (
                    <option key={status} value={status}>{status.replace('_', ' ')}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Chamber temperature (°C)">
                <Input type="number" step={0.1} value={editForm.temperature_c} onChange={(event) => setEditForm((prev) => ({ ...prev, temperature_c: event.target.value }))} />
              </Field>
              <Field label="Used capacity (kg)" hint={`max ${formatNumber(editing.capacity_kg)}`}>
                <Input type="number" min={0} max={editing.capacity_kg} step={10} value={editForm.used_kg} onChange={(event) => setEditForm((prev) => ({ ...prev, used_kg: event.target.value }))} />
              </Field>
              <Field label="Battery (%)">
                <Input type="number" min={0} max={100} value={editForm.battery_pct} onChange={(event) => setEditForm((prev) => ({ ...prev, battery_pct: event.target.value }))} />
              </Field>
            </div>
            <Field label="Notes">
              <Textarea value={editForm.notes} onChange={(event) => setEditForm((prev) => ({ ...prev, notes: event.target.value }))} className="min-h-[80px]" />
            </Field>
            {editError ? <div className="rounded-xl border border-rose-500/20 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800">{editError}</div> : null}
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
