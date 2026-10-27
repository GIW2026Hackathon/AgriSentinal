import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, CheckCircle2, ChevronRight, Clock, HelpCircle, LifeBuoy, MessageSquare,
  PhoneCall, Plus, Send, ShieldCheck, Sparkles,
} from 'lucide-react'
import {
  Badge, Banner, Button, Card, EmptyState, Field, Input, Modal, PageHeader, SectionTitle, Select,
  Skeleton, Textarea,
} from '../../components/ui'
import { api } from '../../lib/api'
import { useApi } from '../../lib/useApi'
import { useToast } from '../../context/ToastContext'
import { useAuth } from '../../context/AuthContext'
import { cn, formatDate, relativeTime } from '../../lib/utils'

const CATEGORIES = [
  ['quality', 'Quality scan'],
  ['storage', 'Cold storage'],
  ['payment', 'Payments'],
  ['ussd', 'USSD help'],
  ['other', 'Other'],
]

const CATEGORY_LABEL = Object.fromEntries(CATEGORIES)

const STATUS_META = {
  open: { tone: 'sky', label: 'Open' },
  in_progress: { tone: 'amber', label: 'In progress' },
  resolved: { tone: 'green', label: 'Resolved' },
}

const FAQS = [
  {
    q: 'My scan result looks wrong. What should I do?',
    a: 'Retake the photo in daylight with a plain background and only one crop type in frame. If the grade still looks off, open a Quality scan ticket and include the scan reference.',
  },
  {
    q: 'How do I book storage without a smartphone?',
    a: 'Dial *384*74# and choose 2 for Sentinel cold storage. Follow the prompts for facility, crop, quantity and days. The booking appears in your farmer account automatically.',
  },
  {
    q: 'When is a cold storage booking confirmed?',
    a: 'Requests start as Pending. Our team confirms capacity and the booking becomes Active. You are notified in the app and can cancel before drop-off.',
  },
  {
    q: 'How is shelf life calculated?',
    a: 'A weather-aware LSTM combines the 3-day local forecast with crop type, harvest quality and storage temperature to estimate ambient and cold-storage shelf life.',
  },
]

function TicketConversation({ ticketId, onUpdated }) {
  const { user } = useAuth()
  const { toast } = useToast()
  const [ticket, setTicket] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (!ticketId) return
    let active = true
    setLoading(true)
    setError('')
    api
      .get(`/support/tickets/${ticketId}`)
      .then((data) => {
        if (active) setTicket(data.ticket)
      })
      .catch((err) => {
        if (active) setError(err.message || 'Could not load the conversation')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [ticketId])

  const send = async () => {
    const body = reply.trim()
    if (body.length < 2) return
    setSending(true)
    try {
      const data = await api.post(`/support/tickets/${ticketId}/messages`, { body })
      setTicket(data.ticket)
      setReply('')
      onUpdated?.()
      toast({ type: 'success', title: 'Reply sent', message: 'The support team has been notified.' })
    } catch (err) {
      toast({ type: 'error', title: 'Could not send reply', message: err.message })
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return <div className="space-y-3 p-1"><Skeleton className="h-16 w-3/4" /><Skeleton className="ml-auto h-16 w-2/3" /><Skeleton className="h-16 w-3/4" /></div>
  }
  if (error) {
    return <EmptyState icon={AlertTriangle} title="Could not load ticket" description={error} />
  }
  if (!ticket) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 py-12 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-forest-500/10 text-forest-700">
          <MessageSquare className="h-5 w-5" />
        </span>
        <p className="mt-3 text-sm font-bold text-forest-950">Select a conversation</p>
        <p className="mt-1 max-w-xs text-xs leading-relaxed text-forest-800/50">
          Pick a support ticket to read the thread and reply to the AgriSentinel team.
        </p>
      </div>
    )
  }

  const status = STATUS_META[ticket.status] || STATUS_META.open

  return (
    <div className="flex h-full min-h-[26rem] flex-col">
      <div className="border-b border-forest-950/[0.06] pb-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-forest-800/40">{ticket.ref} · {CATEGORY_LABEL[ticket.category] || ticket.category}</p>
            <h3 className="mt-1 font-display text-lg leading-tight text-forest-950">{ticket.subject}</h3>
          </div>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
        <p className="mt-1.5 text-[10px] text-forest-800/40">
          Opened {formatDate(ticket.created_at)} · {ticket.message_count} message{ticket.message_count === 1 ? '' : 's'}
          {ticket.priority === 'high' ? <span className="ml-1 font-bold text-clay-500">· Priority</span> : null}
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto py-4 pr-1">
        {(ticket.messages || []).map((message) => {
          const mine = message.sender === 'farmer'
          return (
            <div key={message.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
              <div className={cn('max-w-[85%] rounded-2xl px-3.5 py-2.5', mine ? 'rounded-br-md bg-forest-950 text-cream-50' : 'rounded-bl-md border border-forest-950/[0.07] bg-cream-100/80 text-forest-900')}>
                <p className={cn('text-[9px] font-bold uppercase tracking-wider', mine ? 'text-agri-lime/70' : 'text-forest-800/40')}>
                  {mine ? 'You' : message.author_name || 'Support'}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed">{message.body}</p>
                <p className={cn('mt-1 text-[9px]', mine ? 'text-cream-100/40' : 'text-forest-800/35')}>{message.time_label}</p>
              </div>
            </div>
          )
        })}
      </div>

      {ticket.status === 'resolved' ? (
        <div className="flex items-center gap-2 rounded-xl border border-forest-500/20 bg-forest-500/[0.06] px-3.5 py-3 text-[11px] font-semibold text-forest-800">
          <CheckCircle2 className="h-4 w-4 text-forest-600" />
          This ticket is resolved. Reply to reopen the conversation.
        </div>
      ) : null}

      <div className="mt-3 border-t border-forest-950/[0.06] pt-3">
        <div className="flex items-end gap-2">
          <Textarea
            value={reply}
            onChange={(event) => setReply(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                send()
              }
            }}
            placeholder={`Reply as ${user?.name?.split(' ')[0] || 'farmer'}…`}
            className="min-h-[52px] max-h-32 py-2.5 text-xs"
            rows={2}
          />
          <Button icon={Send} loading={sending} onClick={send} disabled={reply.trim().length < 2} className="h-[52px]">
            Send
          </Button>
        </div>
        <p className="mt-1.5 text-[9px] text-forest-800/30">Enter to send · Shift + Enter for a new line</p>
      </div>
    </div>
  )
}

export default function Support() {
  const { toast } = useToast()
  const { data, loading, error, reload } = useApi('/support/tickets')
  const [activeId, setActiveId] = useState(null)
  const [newOpen, setNewOpen] = useState(false)
  const [filter, setFilter] = useState('all')
  const [form, setForm] = useState({ category: 'quality', subject: '', message: '' })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [mobileDetail, setMobileDetail] = useState(false)

  const tickets = data?.tickets || []

  const counts = useMemo(() => {
    const result = { all: tickets.length, open: 0, in_progress: 0, resolved: 0 }
    tickets.forEach((ticket) => { result[ticket.status] = (result[ticket.status] || 0) + 1 })
    return result
  }, [tickets])

  const visible = useMemo(
    () => (filter === 'all' ? tickets : tickets.filter((ticket) => ticket.status === filter)),
    [tickets, filter],
  )

  useEffect(() => {
    if (!activeId && tickets.length) setActiveId(tickets[0].id)
  }, [tickets, activeId])

  const submit = async () => {
    setFormError('')
    if (form.subject.trim().length < 4) {
      setFormError('Add a short subject so support can route your ticket.')
      return
    }
    if (form.message.trim().length < 8) {
      setFormError('Describe the issue in a little more detail.')
      return
    }
    setSaving(true)
    try {
      const created = await api.post('/support/tickets', {
        category: form.category,
        subject: form.subject.trim(),
        message: form.message.trim(),
      })
      setNewOpen(false)
      setForm({ category: 'quality', subject: '', message: '' })
      setFilter('all')
      setActiveId(created.ticket.id)
      reload({ silent: true })
      toast({
        type: 'success',
        title: `Ticket ${created.ticket.ref} opened`,
        message: 'The AgriSentinel team usually replies within a few hours.',
      })
    } catch (err) {
      setFormError(err.message || 'Could not open the ticket.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Farmer care"
        title="Support"
        description="Talk to a real agronomist or cold-chain specialist. Quality, storage, payments and USSD help all start here."
        actions={
          <Button variant="accent" icon={Plus} onClick={() => setNewOpen(true)}>
            New support ticket
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-forest-950/[0.06] bg-cream-50/80 p-4">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-forest-800/40"><MessageSquare className="h-3 w-3" /> Open tickets</p>
          <p className="mt-2 font-display text-2xl text-forest-950">{(counts.open || 0) + (counts.in_progress || 0)}</p>
          <p className="mt-1 text-[10px] text-forest-800/40">{counts.in_progress || 0} being worked on</p>
        </div>
        <div className="rounded-2xl border border-forest-950/[0.06] bg-cream-50/80 p-4">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-forest-800/40"><Clock className="h-3 w-3" /> Response time</p>
          <p className="mt-2 font-display text-2xl text-forest-950">&lt; 4h</p>
          <p className="mt-1 text-[10px] text-forest-800/40">Typical support reply during working hours</p>
        </div>
        <div className="rounded-2xl border border-forest-950/[0.06] bg-cream-50/80 p-4">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-forest-800/40"><CheckCircle2 className="h-3 w-3" /> Resolved</p>
          <p className="mt-2 font-display text-2xl text-forest-950">{counts.resolved || 0}</p>
          <p className="mt-1 text-[10px] text-forest-800/40">Tickets closed across your account</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-5">
          <SectionTitle
            title="Your tickets"
            description="Every conversation with the support desk"
            action={<Badge tone="neutral">{tickets.length}</Badge>}
          />
          <div className="mb-3 flex flex-wrap gap-1.5">
            {[
              { key: 'all', label: 'All', count: counts.all },
              { key: 'open', label: 'Open', count: counts.open },
              { key: 'in_progress', label: 'In progress', count: counts.in_progress },
              { key: 'resolved', label: 'Resolved', count: counts.resolved },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilter(tab.key)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold transition',
                  filter === tab.key
                    ? 'border-forest-900 bg-forest-950 text-cream-50'
                    : 'border-forest-950/10 bg-cream-50 text-forest-800/55 hover:border-forest-500/30',
                )}
              >
                {tab.label}
                <span className={cn('rounded-full px-1 text-[9px]', filter === tab.key ? 'bg-cream-50/20' : 'bg-forest-950/[0.05]')}>{tab.count || 0}</span>
              </button>
            ))}
          </div>

          {loading && !tickets.length ? (
            <div className="space-y-2">{[0, 1, 2].map((key) => <Skeleton key={key} className="h-20 w-full" />)}</div>
          ) : error ? (
            <Banner tone="danger" icon={AlertTriangle} title="Could not load tickets">{error}</Banner>
          ) : visible.length ? (
            <div className="max-h-[31rem] space-y-2 overflow-y-auto pr-1">
              {visible.map((ticket) => {
                const status = STATUS_META[ticket.status] || STATUS_META.open
                const active = ticket.id === activeId
                return (
                  <button
                    key={ticket.id}
                    type="button"
                    onClick={() => { setActiveId(ticket.id); setMobileDetail(true) }}
                    className={cn(
                      'w-full rounded-xl border px-3.5 py-3 text-left transition',
                      active
                        ? 'border-forest-500/35 bg-forest-500/[0.07]'
                        : 'border-forest-950/[0.06] bg-cream-50/70 hover:border-forest-500/25 hover:bg-white',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-forest-800/35">{ticket.ref} · {CATEGORY_LABEL[ticket.category] || ticket.category}</p>
                        <p className="mt-0.5 truncate text-xs font-bold text-forest-950">{ticket.subject}</p>
                      </div>
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </div>
                    {ticket.last_message ? (
                      <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-forest-800/45">{ticket.last_message}</p>
                    ) : null}
                    <div className="mt-1.5 flex items-center justify-between text-[9px] text-forest-800/35">
                      <span>{relativeTime(ticket.updated_at)}</span>
                      <span className="flex items-center gap-0.5">{ticket.message_count} message{ticket.message_count === 1 ? '' : 's'} <ChevronRight className="h-2.5 w-2.5" /></span>
                    </div>
                  </button>
                )
              })}
            </div>
          ) : (
            <EmptyState
              icon={LifeBuoy}
              title="No tickets in this view"
              description="Open a new ticket and the team will pick it up."
              action={<Button size="sm" icon={Plus} onClick={() => setNewOpen(true)}>New ticket</Button>}
            />
          )}
        </Card>

        <Card className="hidden xl:col-span-7 xl:block">
          <TicketConversation ticketId={activeId} onUpdated={() => reload({ silent: true })} />
        </Card>

        {mobileDetail && activeId ? (
          <Modal open={mobileDetail} onClose={() => setMobileDetail(false)} title="Conversation" maxWidth="max-w-2xl">
            <TicketConversation ticketId={activeId} onUpdated={() => reload({ silent: true })} />
          </Modal>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:col-span-7">
          <Card>
            <div className="flex items-center gap-2 text-forest-600">
              <PhoneCall className="h-4 w-4" />
              <p className="text-[10px] font-bold uppercase tracking-[0.14em]">USSD support</p>
            </div>
            <p className="mt-2 font-display text-lg leading-tight text-forest-950">Dial *384*74#</p>
            <p className="mt-1 text-[11px] leading-relaxed text-forest-800/50">
              Choose 4 from the main menu to send a support message. A field agent can call you back.
            </p>
          </Card>
          <Card>
            <div className="flex items-center gap-2 text-forest-600">
              <ShieldCheck className="h-4 w-4" />
              <p className="text-[10px] font-bold uppercase tracking-[0.14em]">Service SLA</p>
            </div>
            <p className="mt-2 font-display text-lg leading-tight text-forest-950">Cold chain escalation</p>
            <p className="mt-1 text-[11px] leading-relaxed text-forest-800/50">
              Temperature or battery alarms on a unit are escalated to the operations desk automatically.
            </p>
          </Card>
        </div>

        <Card className="xl:col-span-5">
          <SectionTitle title="Common questions" description="Answers before you open a ticket" action={<HelpCircle className="h-4 w-4 text-forest-800/30" />} />
          <div className="space-y-1">
            {FAQS.map((item) => (
              <details key={item.q} className="group rounded-xl border border-forest-950/[0.06] bg-cream-50/60 px-3.5 py-2.5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[11px] font-bold text-forest-950">
                  {item.q}
                  <Plus className="h-3.5 w-3.5 shrink-0 text-forest-800/30 transition group-open:rotate-45" />
                </summary>
                <p className="mt-2 text-[10px] leading-relaxed text-forest-800/50">{item.a}</p>
              </details>
            ))}
          </div>
        </Card>
      </div>

      <Modal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        title="Open a support ticket"
        subtitle="Tell us what happened and we'll route it to the right specialist."
        maxWidth="max-w-xl"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setNewOpen(false)}>Cancel</Button>
            <Button icon={Send} loading={saving} onClick={submit}>Send ticket</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-xl bg-agri-lime-soft px-3.5 py-2.5 text-[10px] font-semibold text-forest-800">
            <Sparkles className="h-3.5 w-3.5" />
            Include a scan reference or booking number when relevant — it speeds up the fix.
          </div>
          <Field label="Category">
            <Select value={form.category} onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}>
              {CATEGORIES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </Select>
          </Field>
          <Field label="Subject" required>
            <Input
              value={form.subject}
              onChange={(event) => setForm((prev) => ({ ...prev, subject: event.target.value }))}
              placeholder="e.g. Tomato scan shows grade D but fruit looks fine"
              maxLength={160}
            />
          </Field>
          <Field label="What happened?" required hint={`${form.message.length}/2000`}>
            <Textarea
              value={form.message}
              onChange={(event) => setForm((prev) => ({ ...prev, message: event.target.value.slice(0, 2000) }))}
              placeholder="Share the scan or booking reference, what you expected, and what you saw."
            />
          </Field>
          {formError ? (
            <div className="rounded-xl border border-rose-500/20 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800">{formError}</div>
          ) : null}
        </div>
      </Modal>
    </div>
  )
}
