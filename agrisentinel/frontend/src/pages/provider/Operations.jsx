import { useMemo, useState } from 'react'
import {
  AlertTriangle, BatteryCharging, CheckCircle2, Clock, LifeBuoy, Phone, Send, Smartphone,
  Snowflake, Terminal, XCircle,
} from 'lucide-react'
import {
  Badge, Banner, Button, Card, EmptyState, Field, Input, Modal, PageHeader, SectionTitle,
  Segmented, Skeleton, StatCard,
} from '../../components/ui'
import { api } from '../../lib/api'
import { useApi } from '../../lib/useApi'
import { useToast } from '../../context/ToastContext'
import { cn, formatDate, formatKES, formatKg, relativeTime } from '../../lib/utils'

const BOOKING_TONE = { pending: 'amber', active: 'green', completed: 'neutral', cancelled: 'neutral' }

function UssdSimulator({ open, onClose, onLogged }) {
  const { toast } = useToast()
  const [phone, setPhone] = useState('+254712345678')
  const [segment, setSegment] = useState('')
  const [sessionId, setSessionId] = useState(`SIM-${Math.random().toString(16).slice(2, 8).toUpperCase()}`)
  const [text, setText] = useState('')
  const [transcript, setTranscript] = useState([])
  const [busy, setBusy] = useState(false)
  const [ended, setEnded] = useState(false)

  const reset = () => {
    setText('')
    setSegment('')
    setTranscript([])
    setEnded(false)
    setSessionId(`SIM-${Math.random().toString(16).slice(2, 8).toUpperCase()}`)
  }

  const send = async (override) => {
    const choice = (override ?? segment).trim()
    if (!choice && !text) {
      toast({ type: 'warning', title: 'Choose an option', message: 'Type a menu number such as 1, or press 0 to exit.' })
      return
    }
    const nextText = choice ? (text ? `${text}*${choice}` : choice) : text
    setBusy(true)
    try {
      const data = await api.post('/provider/ussd/simulate', {
        phone,
        text: nextText,
        session_id: sessionId,
      })
      setText(nextText)
      setSegment('')
      setEnded(data.ended)
      setTranscript((prev) => [...prev, { input: choice || '(menu)', response: data.response, at: new Date().toISOString() }])
      onLogged?.()
    } catch (err) {
      toast({ type: 'error', title: 'USSD error', message: err.message })
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="USSD simulator"
      subtitle="Run the Africa's Talking session flow without a phone."
      maxWidth="max-w-xl"
      footer={
        <div className="flex items-center justify-between gap-2">
          <Button size="sm" variant="ghost" onClick={reset}>New session</Button>
          <Button size="sm" variant="secondary" onClick={onClose}>Close</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Phone number">
            <Input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+254712345678" />
          </Field>
          <Field label="Session">
            <Input value={sessionId} readOnly className="bg-cream-100/70 text-forest-800/60" />
          </Field>
        </div>

        <div className="overflow-hidden rounded-2xl border border-forest-900 bg-forest-950">
          <div className="flex items-center gap-2 border-b border-cream-50/10 px-4 py-2.5 text-cream-100/60">
            <Terminal className="h-3.5 w-3.5 text-agri-lime" />
            <span className="text-[10px] font-bold uppercase tracking-[0.16em]">USSD · *384*74#</span>
            <span className="ml-auto text-[9px] text-cream-100/35">{phone}</span>
          </div>
          <div className="max-h-64 space-y-2 overflow-y-auto p-4 font-mono text-[11px] leading-relaxed">
            {transcript.length === 0 ? (
              <p className="text-cream-100/35">Session ready. Send a menu choice to begin.</p>
            ) : (
              transcript.map((entry, index) => (
                <div key={`${entry.at}-${index}`} className="space-y-1.5">
                  <p className="text-agri-lime/80">&gt; {entry.input}</p>
                  <p className={cn('whitespace-pre-wrap', entry.response.startsWith('END') ? 'text-cream-100/50' : 'text-cream-50')}>
                    {entry.response}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {[
            ['1', 'Scan quality'],
            ['2', 'Cold storage'],
            ['3', 'Weather risk'],
            ['4', 'Support'],
            ['5', 'My bookings'],
            ['6', 'Services'],
            ['7', 'Nearest'],
            ['0', 'Exit'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => send(value)}
              disabled={busy || ended}
              className="rounded-full border border-forest-950/10 bg-cream-50 px-2.5 py-1 text-[10px] font-semibold text-forest-800/60 transition hover:border-forest-500/30 disabled:opacity-40"
            >
              {value} · {label}
            </button>
          ))}
        </div>

        <div className="flex items-end gap-2">
          <Field label="Next input" hint={text ? `accumulated: ${text}` : 'e.g. 1 or 2*1'} className="flex-1">
            <Input
              value={segment}
              onChange={(event) => setSegment(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); send() } }}
              placeholder={text ? 'Type the next menu option' : 'Type 1 to start'}
              disabled={ended}
            />
          </Field>
          <Button icon={Send} loading={busy} onClick={() => send()} disabled={ended} className="h-[42px]">Send</Button>
        </div>
        {ended ? (
          <p className="rounded-xl bg-cream-100/70 px-3.5 py-2 text-[10px] text-forest-800/50">
            Session ended. Start a new session to run the flow again.
          </p>
        ) : (
          <p className="text-[9px] leading-relaxed text-forest-800/35">
            Each send accumulates the choice, matching how Africa's Talking delivers the text field (e.g. 2*1*AG-12345).
          </p>
        )}
      </div>
    </Modal>
  )
}

export default function Operations() {
  const { toast } = useToast()
  const { data, loading, error, reload } = useApi('/provider/operations')
  const [bookingTab, setBookingTab] = useState('pending')
  const [busyId, setBusyId] = useState(null)
  const [ussdOpen, setUssdOpen] = useState(false)
  const [ticketBusy, setTicketBusy] = useState(null)

  const bookings = data?.bookings || []
  const statusCounts = data?.status_counts || {}
  const alerts = data?.alerts || []
  const ussdLogs = data?.ussd_logs || []
  const ussdVolume = data?.ussd_volume || []
  const tickets = data?.tickets || []

  const visibleBookings = useMemo(
    () => (bookingTab === 'all' ? bookings : bookings.filter((booking) => booking.status === bookingTab)),
    [bookings, bookingTab],
  )
  const openTickets = tickets.filter((ticket) => ticket.status !== 'resolved')
  const pendingCount = statusCounts.pending || 0
  const ussdSessions = ussdVolume.reduce((sum, day) => sum + day.sessions, 0)

  const setBookingStatus = async (booking, status) => {
    setBusyId(booking.id)
    try {
      await api.patch(`/provider/bookings/${booking.id}`, { status })
      toast({
        type: 'success',
        title: `${booking.ref} ${status}`,
        message: status === 'active' ? 'Capacity reserved and farmer notified.' : 'Farmer has been notified.',
      })
      reload({ silent: true })
    } catch (err) {
      toast({ type: 'error', title: 'Could not update booking', message: err.message })
    } finally {
      setBusyId(null)
    }
  }

  const resolveTicket = async (ticket) => {
    setTicketBusy(ticket.id)
    try {
      await api.patch(`/provider/tickets/${ticket.id}/status`, { status: 'resolved' })
      toast({ type: 'success', title: `${ticket.ref} resolved` })
      reload({ silent: true })
    } catch (err) {
      toast({ type: 'error', title: 'Could not update ticket', message: err.message })
    } finally {
      setTicketBusy(null)
    }
  }

  if (loading && !data) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-24 w-full" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">{[0, 1, 2].map((key) => <Skeleton key={key} className="h-32" />)}</div>
        <Skeleton className="h-80 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Admin console"
        title="Operations"
        description="Confirm storage requests, monitor alerts and answer farmers."
        actions={<Button variant="accent" icon={Smartphone} onClick={() => setUssdOpen(true)}>USSD simulator</Button>}
      />

      {error ? <Banner tone="danger" icon={AlertTriangle} title="Operations data unavailable">{error}</Banner> : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={Clock} label="Pending requests" value={pendingCount} suffix="bookings" hint="Awaiting confirmation" tone="amber" />
        <StatCard icon={Snowflake} label="Active storage" value={statusCounts.active || 0} suffix="lots" hint={`${statusCounts.completed || 0} completed all-time`} tone="forest" />
        <StatCard icon={LifeBuoy} label="Open tickets" value={openTickets.length} suffix="tickets" hint={`${tickets.length} total conversations`} tone="sky" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-8">
          <SectionTitle
            title="Storage requests & lots"
            description="Confirm requests to reserve capacity, complete lots on collection"
            action={
              <Segmented
                size="sm"
                value={bookingTab}
                onChange={setBookingTab}
                options={[
                  { value: 'pending', label: 'Pending' },
                  { value: 'active', label: 'Active' },
                  { value: 'completed', label: 'Completed' },
                  { value: 'all', label: 'All' },
                ]}
              />
            }
          />
          {visibleBookings.length ? (
            <div className="space-y-2.5">
              {visibleBookings.slice(0, 12).map((booking) => (
                <div key={booking.id} className="rounded-xl border border-forest-950/[0.06] bg-cream-50/70 px-3.5 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-bold text-forest-950">
                        {booking.farmer.name} <span className="font-medium text-forest-800/40">→ {booking.facility.code}</span>
                      </p>
                      <p className="mt-0.5 text-[10px] text-forest-800/45">
                        {booking.crop_label} · {formatKg(booking.quantity_kg)} · {booking.days} days from {formatDate(booking.start_date)}
                      </p>
                      <p className="mt-0.5 text-[9px] text-forest-800/30">
                        {booking.ref} · {booking.farmer.phone || 'no phone'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-forest-950">{formatKES(booking.total_cost)}</span>
                      <Badge tone={BOOKING_TONE[booking.status] || 'neutral'}>{booking.status_label}</Badge>
                    </div>
                  </div>
                  {booking.status === 'pending' ? (
                    <div className="mt-2.5 flex flex-wrap justify-end gap-2">
                      <Button size="sm" variant="softDanger" icon={XCircle} loading={busyId === booking.id} onClick={() => setBookingStatus(booking, 'cancelled')}>Decline</Button>
                      <Button size="sm" icon={CheckCircle2} loading={busyId === booking.id} onClick={() => setBookingStatus(booking, 'active')}>Confirm booking</Button>
                    </div>
                  ) : booking.status === 'active' ? (
                    <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                      <p className="flex items-center gap-1 text-[9px] text-forest-800/35"><Snowflake className="h-2.5 w-2.5" /> {booking.facility.temperature_c}°C</p>
                      <Button size="sm" variant="secondary" icon={CheckCircle2} loading={busyId === booking.id} onClick={() => setBookingStatus(booking, 'completed')}>Mark completed</Button>
                    </div>
                  ) : (
                    <p className="mt-2.5 text-right text-[9px] text-forest-800/35">
                      {booking.status === 'cancelled'
                        ? 'Declined or cancelled'
                        : `Completed ${booking.completed_at ? formatDate(booking.completed_at) : ''}`}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={Snowflake} title={bookingTab === 'pending' ? 'No pending requests' : 'Nothing here'} description="The queue is clear for this stage." />
          )}
        </Card>

        <div className="space-y-4 xl:col-span-4">
          <Card>
            <SectionTitle title="Action queue" description="Operational alerts needing attention" />
            {alerts.length ? (
              <div className="space-y-2">
                {alerts.slice(0, 5).map((alert, index) => (
                  <div key={`${alert.title}-${index}`} className="flex gap-2.5 rounded-xl border border-forest-950/[0.06] bg-cream-50/70 px-3 py-2.5">
                    <span className={cn('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg', alert.severity === 'high' ? 'bg-rose-500/10 text-rose-600' : 'bg-amber-500/10 text-amber-600')}>
                      {alert.kind === 'battery' ? <BatteryCharging className="h-3 w-3" /> : alert.kind === 'temperature' ? <Snowflake className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold text-forest-950">{alert.title}</p>
                      <p className="mt-0.5 text-[9px] leading-relaxed text-forest-800/45">{alert.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-xl bg-forest-500/[0.06] px-3.5 py-3 text-[11px] font-semibold text-forest-700">All units and queues are healthy.</p>
            )}
          </Card>

          <Card>
            <SectionTitle title="Support queue" description="Open farmer conversations" />
            {openTickets.length ? (
              <div className="space-y-2">
                {openTickets.slice(0, 5).map((ticket) => (
                  <div key={ticket.id} className="rounded-xl border border-forest-950/[0.06] bg-cream-50/70 px-3 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate text-[10px] font-bold text-forest-950">{ticket.subject}</p>
                      <Badge tone={ticket.status === 'in_progress' ? 'amber' : 'sky'}>{ticket.status_label}</Badge>
                    </div>
                    <p className="mt-0.5 truncate text-[9px] text-forest-800/40">{ticket.ref} · {relativeTime(ticket.updated_at)}</p>
                    <div className="mt-2 flex justify-end">
                      <Button size="sm" variant="ghost" icon={CheckCircle2} loading={ticketBusy === ticket.id} onClick={() => resolveTicket(ticket)}>Resolve</Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-xl bg-forest-500/[0.06] px-3.5 py-3 text-[11px] font-semibold text-forest-700">Support queue is clear.</p>
            )}
          </Card>
        </div>
      </div>

      <Card>
        <SectionTitle
          title="USSD desk"
          description={`${ussdSessions} sessions in the last 7 days`}
          action={<Button size="sm" variant="secondary" icon={Terminal} onClick={() => setUssdOpen(true)}>Open simulator</Button>}
        />
        {ussdLogs.length ? (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {ussdLogs.slice(0, 8).map((log) => (
              <div key={log.id} className="rounded-lg border border-forest-950/[0.05] bg-cream-50/60 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1 text-[10px] font-bold text-forest-950"><Phone className="h-2.5 w-2.5 text-forest-600" /> {log.phone}</span>
                  <span className="text-[8px] text-forest-800/30">{log.time_label}</span>
                </div>
                <p className="mt-0.5 truncate font-mono text-[9px] text-forest-800/45">{log.text || '(main menu)'} → {log.response}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[10px] text-forest-800/40">No USSD sessions logged yet.</p>
        )}
      </Card>

      <UssdSimulator open={ussdOpen} onClose={() => setUssdOpen(false)} onLogged={() => reload({ silent: true })} />
    </div>
  )
}
