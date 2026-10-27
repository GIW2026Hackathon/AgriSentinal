import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Bell, ChevronRight, ClipboardCheck, CloudSun, LayoutDashboard, LifeBuoy, LineChart,
  LogOut, Menu, Radio, ScanLine, Snowflake, Truck, Users, X, PhoneCall, CircleDot,
} from 'lucide-react'
import { Logo } from './Logo'
import { Avatar } from './ui'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { cn, relativeTime, todayLabel } from '../lib/utils'

const FARMER_NAV = [
  { to: '/farmer/overview', label: 'Overview', icon: LayoutDashboard },
  { to: '/farmer/scan', label: 'Quality scan', icon: ScanLine },
  { to: '/farmer/storage', label: 'Sentinel', icon: Snowflake },
  { to: '/farmer/weather', label: 'Weather', icon: CloudSun },
  { to: '/farmer/support', label: 'Support', icon: LifeBuoy },
]

const STAFF_NAV = [
  { to: '/ops/insights', label: 'Insights', icon: LineChart },
  { to: '/ops/fleet', label: 'Fleet', icon: Truck },
  { to: '/ops/farmers', label: 'Farmers', icon: Users },
  { to: '/ops/quality', label: 'Quality report', icon: ClipboardCheck },
  { to: '/ops/operations', label: 'Operations', icon: Radio },
]

const TITLES = {
  '/farmer/overview': 'Overview',
  '/farmer/scan': 'Quality scan',
  '/farmer/storage': 'Sentinel',
  '/farmer/weather': 'Weather',
  '/farmer/support': 'Support',
  '/ops/insights': 'Insights',
  '/ops/fleet': 'Fleet',
  '/ops/farmers': 'Farmers',
  '/ops/quality': 'Quality report',
  '/ops/operations': 'Operations',
}

function NavItems({ items, onNavigate }) {
  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition-all duration-200',
              isActive
                ? 'bg-cream-50 text-forest-950 shadow-soft'
                : 'text-cream-100/60 hover:bg-cream-50/[0.07] hover:text-cream-50',
            )
          }
        >
          {({ isActive }) => (
            <>
              <item.icon className={cn('h-4.5 w-4.5 shrink-0', isActive ? 'text-forest-700' : 'text-cream-100/45 group-hover:text-agri-lime')} strokeWidth={2} />
              <span className="flex-1">{item.label}</span>
              {isActive ? <span className="h-1.5 w-1.5 rounded-full bg-agri-lime-dark" /> : null}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

const STAFF_ROLES = ['provider', 'admin']

function Sidebar({ user, items, onNavigate, onLogout }) {
  const isStaff = STAFF_ROLES.includes(user?.role)
  const isAdmin = user?.role === 'admin'
  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-forest-950 px-4 pb-4 pt-5 text-cream-50">
      <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-forest-600/25 blur-3xl" />
      <div className="pointer-events-none absolute -left-20 bottom-24 h-56 w-56 rounded-full bg-agri-lime/10 blur-3xl" />

      <div className="relative flex items-center justify-between px-1">
        <Logo light />
      </div>

      <div className="relative mt-5 rounded-2xl border border-cream-50/10 bg-cream-50/[0.05] px-3.5 py-3">
        <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-agri-lime/70">
          {isAdmin ? 'Admin console' : isStaff ? 'Operations console' : 'Farmer workspace'}
        </p>
        <p className="mt-1 truncate text-xs font-semibold text-cream-50/90">
          {isAdmin
            ? 'Network oversight & dispatch'
            : isStaff
              ? 'Fleet & market operations'
              : user?.farm_name || 'Your harvest command centre'}
        </p>
      </div>

      <div className="relative mt-5 flex-1 overflow-y-auto no-scrollbar">
        <NavItems items={items} onNavigate={onNavigate} />
      </div>

      <div className="relative mt-4 rounded-2xl border border-agri-lime/20 bg-agri-lime/[0.08] p-3.5">
        <div className="flex items-center gap-2 text-agri-lime">
          <PhoneCall className="h-4 w-4" />
          <span className="text-[10px] font-bold uppercase tracking-[0.16em]">Works on any phone</span>
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-cream-100/60">
          Dial <span className="font-bold text-cream-50">*384*74#</span> for scans, storage and the weather line — no data needed.
        </p>
      </div>

      <div className="relative mt-4 flex items-center gap-3 rounded-2xl border border-cream-50/10 px-3 py-2.5">
        <Avatar name={user?.name || ''} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold text-cream-50">{user?.name}</p>
          <p className="truncate text-[10px] uppercase tracking-wider text-cream-100/45">
            {isAdmin ? 'Administrator' : isStaff ? 'Operations' : user?.region || 'Farmer'}
          </p>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="rounded-lg p-2 text-cream-100/50 transition hover:bg-cream-50/10 hover:text-cream-50"
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

function Notifications({ open, onClose }) {
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    setLoading(true)
    api
      .get('/notifications')
      .then((data) => setNotes(data.notifications || []))
      .catch(() => setNotes([]))
      .finally(() => setLoading(false))
    const onDown = (event) => {
      if (ref.current && !ref.current.contains(event.target)) onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open, onClose])

  const markRead = async (note) => {
    if (note.read) return
    setNotes((list) => list.map((item) => (item.id === note.id ? { ...item, read: true } : item)))
    try {
      await api.post(`/notifications/${note.id}/read`)
    } catch {
      // Keep optimistic state; badge refreshes on next open.
    }
  }

  if (!open) return null
  return (
    <div ref={ref} className="absolute right-0 top-[calc(100%+0.6rem)] z-50 w-[22rem] overflow-hidden rounded-2xl border border-forest-950/10 bg-cream-50 shadow-lift animate-rise">
      <div className="flex items-center justify-between border-b border-forest-950/[0.06] px-4 py-3">
        <p className="text-sm font-bold text-forest-950">Notifications</p>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-forest-800/40">
          {notes.filter((n) => !n.read).length} unread
        </span>
      </div>
      <div className="max-h-[22rem] overflow-y-auto">
        {loading ? (
          <p className="px-4 py-8 text-center text-xs text-forest-800/50">Loading updates…</p>
        ) : notes.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-forest-800/50">You are all caught up.</p>
        ) : (
          notes.map((note) => (
            <button
              key={note.id}
              type="button"
              onClick={() => markRead(note)}
              className={cn(
                'flex w-full items-start gap-3 border-b border-forest-950/[0.04] px-4 py-3 text-left transition hover:bg-cream-100/70',
                !note.read && 'bg-agri-lime/[0.07]',
              )}
            >
              <span className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', note.read ? 'bg-forest-950/15' : 'bg-agri-lime-dark')} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-bold text-forest-950">{note.title}</span>
                  <span className="shrink-0 text-[10px] text-forest-800/40">{relativeTime(note.created_at)}</span>
                </span>
                <span className="mt-0.5 block text-[11px] leading-relaxed text-forest-800/60">{note.body}</span>
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const [mlStatus, setMlStatus] = useState('checking')

  const isStaff = STAFF_ROLES.includes(user?.role)
  const isAdmin = user?.role === 'admin'
  const items = isStaff ? STAFF_NAV : FARMER_NAV
  const title = TITLES[location.pathname] || 'AgriSentinel'

  useEffect(() => {
    api.get('/notifications').then((data) => setUnread(data.unread || 0)).catch(() => {})
  }, [location.pathname])

  useEffect(() => {
    if (notesOpen) {
      api.get('/notifications').then((data) => setUnread(data.unread || 0)).catch(() => {})
    }
  }, [notesOpen])

  useEffect(() => {
    api
      .get('/health')
      .then((data) => setMlStatus(data.ml === 'ok' ? 'online' : 'degraded'))
      .catch(() => setMlStatus('offline'))
  }, [])

  useEffect(() => {
    setMobileOpen(false)
    setNotesOpen(false)
  }, [location.pathname])

  const handleLogout = async () => {
    await logout()
    navigate(isStaff ? '/ops/login' : '/login', { replace: true })
  }

  return (
    <div className="min-h-screen lg:flex">
      <aside className="sticky top-0 hidden h-screen w-[15.5rem] shrink-0 lg:block xl:w-[16.5rem]">
        <Sidebar user={user} items={items} onLogout={handleLogout} />
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-[90] lg:hidden">
          <div className="absolute inset-0 animate-fade bg-forest-950/50 backdrop-blur-[2px]" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[17rem] animate-rise shadow-lift">
            <Sidebar
              user={user}
              items={items}
              onNavigate={() => setMobileOpen(false)}
              onLogout={handleLogout}
            />
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute -right-11 top-4 rounded-full bg-cream-50 p-2.5 text-forest-900 shadow-soft"
              aria-label="Close menu"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-40 border-b border-forest-950/[0.06] bg-cream-100/85 backdrop-blur-xl">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="rounded-xl p-2 text-forest-900 transition hover:bg-forest-950/[0.06] lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-2 lg:hidden">
              <Logo compact />
            </div>

            <div className="hidden items-center gap-1.5 text-xs lg:flex">
              <span className="font-semibold text-forest-800/40">AgriSentinel</span>
              <ChevronRight className="h-3 w-3 text-forest-800/25" />
              <span className="font-bold text-forest-950">{title}</span>
            </div>

            <div className="ml-auto flex items-center gap-2 sm:gap-3">
              <div className="hidden items-center gap-2 rounded-full border border-forest-950/[0.07] bg-cream-50/70 px-3 py-1.5 md:flex">
                <CircleDot
                  className={cn(
                    'h-3 w-3',
                    mlStatus === 'online' ? 'text-forest-500' : mlStatus === 'degraded' ? 'text-amber-500' : 'text-rose-500',
                  )}
                />
                <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-forest-800/55">
                  {mlStatus === 'online' ? 'Vision engine online' : mlStatus === 'checking' ? 'Checking engine' : 'Fallback mode'}
                </span>
              </div>

              <span className="hidden text-xs font-medium text-forest-800/50 xl:block">{todayLabel()}</span>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setNotesOpen((value) => !value)}
                  className="relative rounded-xl border border-forest-950/[0.07] bg-cream-50/70 p-2.5 text-forest-900 transition hover:bg-cream-50"
                  aria-label="Notifications"
                >
                  <Bell className="h-4 w-4" />
                  {unread > 0 ? (
                    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-clay-500 px-1 text-[9px] font-bold text-cream-50">
                      {unread > 9 ? '9+' : unread}
                    </span>
                  ) : null}
                </button>
                <Notifications open={notesOpen} onClose={() => setNotesOpen(false)} />
              </div>

              <button
                type="button"
                onClick={() => navigate(isStaff ? '/ops/insights' : '/farmer/overview')}
                className="flex items-center gap-2 rounded-xl border border-forest-950/[0.07] bg-cream-50/70 py-1.5 pl-1.5 pr-3 transition hover:bg-cream-50"
              >
                <Avatar name={user?.name || ''} size="xs" />
                <span className="hidden text-left sm:block">
                  <span className="block max-w-[9rem] truncate text-[11px] font-bold leading-tight text-forest-950">{user?.name}</span>
                  <span className="block text-[9px] uppercase tracking-wider text-forest-800/45">
                    {isAdmin ? 'Admin' : isStaff ? 'Operations' : 'Farmer'}
                  </span>
                </span>
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[86rem] px-4 pb-16 pt-6 sm:px-6 lg:px-8 lg:pt-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
