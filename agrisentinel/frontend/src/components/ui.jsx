import { createPortal } from 'react-dom'
import { useEffect } from 'react'
import { ArrowDownRight, ArrowUpRight, Loader2, Inbox, X } from 'lucide-react'
import { avatarColors, cn, initials } from '../lib/utils'

export function Spinner({ className = 'h-4 w-4' }) {
  return <Loader2 className={cn('animate-spin', className)} strokeWidth={2.4} />
}

const BUTTON_VARIANTS = {
  primary: 'bg-forest-900 text-cream-50 hover:bg-forest-800 shadow-soft',
  accent: 'bg-agri-lime text-forest-950 hover:bg-agri-lime-dark shadow-soft',
  secondary: 'border border-forest-950/10 bg-white/70 text-forest-900 hover:bg-white hover:border-forest-950/20',
  ghost: 'text-forest-800 hover:bg-forest-950/[0.06]',
  danger: 'bg-rose-700 text-white hover:bg-rose-800',
  softDanger: 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100',
  outlineLight: 'border border-cream-50/30 text-cream-50 hover:bg-cream-50/10',
  limeSoft: 'bg-agri-lime-soft text-forest-800 hover:bg-agri-lime/60 border border-agri-lime/40',
}

const BUTTON_SIZES = {
  sm: 'h-9 px-3.5 text-xs gap-1.5 rounded-xl',
  md: 'h-11 px-4.5 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-6 text-sm gap-2 rounded-2xl',
  icon: 'h-10 w-10 rounded-xl justify-center',
  iconSm: 'h-8 w-8 rounded-lg justify-center',
}

export function Button({
  variant = 'primary', size = 'md', className, children, loading, icon: Icon, disabled, ...props
}) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-600/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...props}
    >
      {loading ? <Spinner /> : Icon ? <Icon className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} strokeWidth={2.2} /> : null}
      {children}
    </button>
  )
}

export function Card({ className, children, padded = true, hover = false, ...props }) {
  return (
    <div
      className={cn(
        'rounded-[1.6rem] border border-forest-950/[0.07] bg-cream-50/90 shadow-soft backdrop-blur-[2px]',
        padded && 'p-5 sm:p-6',
        hover && 'transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lift',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

const BADGE_TONES = {
  neutral: 'bg-forest-950/[0.06] text-forest-800 border-forest-950/10',
  green: 'bg-forest-500/10 text-forest-700 border-forest-500/20',
  lime: 'bg-agri-lime-soft text-forest-800 border-agri-lime-dark/30',
  amber: 'bg-amber-500/10 text-amber-800 border-amber-500/25',
  red: 'bg-rose-500/10 text-rose-700 border-rose-500/25',
  sky: 'bg-sky-500/10 text-sky-700 border-sky-500/20',
  clay: 'bg-clay-100 text-clay-500 border-clay-500/20',
  dark: 'bg-forest-900 text-cream-100 border-forest-900',
  light: 'bg-cream-100 text-forest-700 border-cream-300',
}

export function Badge({ tone = 'neutral', children, className, dot = false }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-none tracking-wide',
        BADGE_TONES[tone] || BADGE_TONES.neutral,
        className,
      )}
    >
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" /> : null}
      {children}
    </span>
  )
}

export function Field({ label, hint, error, children, className, required }) {
  return (
    <label className={cn('block', className)}>
      {label ? (
        <span className="mb-1.5 flex items-center justify-between text-xs font-semibold text-forest-800">
          <span>
            {label}
            {required ? <span className="ml-0.5 text-clay-500">*</span> : null}
          </span>
          {hint ? <span className="font-normal text-forest-800/45">{hint}</span> : null}
        </span>
      ) : null}
      {children}
      {error ? <span className="mt-1.5 block text-xs font-medium text-rose-700">{error}</span> : null}
    </label>
  )
}

const CONTROL_CLASS =
  'w-full rounded-xl border border-forest-950/10 bg-white/80 px-3.5 py-2.5 text-sm text-forest-950 placeholder:text-forest-950/35 transition focus:border-forest-500 focus:outline-none focus:ring-2 focus:ring-forest-500/15 disabled:opacity-60'

export function Input({ className, leading: Leading, ...props }) {
  if (Leading) {
    return (
      <div className="relative">
        <Leading className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-forest-800/40" />
        <input className={cn(CONTROL_CLASS, 'pl-10', className)} {...props} />
      </div>
    )
  }
  return <input className={cn(CONTROL_CLASS, className)} {...props} />
}

export function Select({ className, children, ...props }) {
  return (
    <select className={cn(CONTROL_CLASS, 'appearance-none bg-[url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'16\' height=\'16\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%2328795d\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Cpath d=\'m6 9 6 6 6-6\'/%3E%3C/svg%3E")] bg-[right_0.85rem_center] bg-no-repeat pr-10', className)} {...props}>
      {children}
    </select>
  )
}

export function Textarea({ className, ...props }) {
  return <textarea className={cn(CONTROL_CLASS, 'min-h-[110px] resize-y', className)} {...props} />
}

export function Modal({ open, onClose, title, subtitle, children, footer, maxWidth = 'max-w-lg' }) {
  useEffect(() => {
    if (!open) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-6">
      <div className="absolute inset-0 animate-fade bg-forest-950/45 backdrop-blur-[3px]" onClick={onClose} />
      <div
        className={cn(
          'relative z-10 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-[2rem] border border-cream-50/40 bg-cream-50 shadow-lift animate-rise sm:rounded-[2rem]',
          maxWidth,
        )}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-4 border-b border-forest-950/[0.06] px-6 py-5">
          <div>
            <h2 className="font-display text-xl text-forest-950">{title}</h2>
            {subtitle ? <p className="mt-1 text-sm text-forest-800/60">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-forest-800/50 transition hover:bg-forest-950/[0.06] hover:text-forest-900"
            aria-label="Close"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer ? <div className="border-t border-forest-950/[0.06] bg-cream-100/60 px-6 py-4">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  )
}

export function Drawer({ open, onClose, title, subtitle, children, width = 'max-w-xl' }) {
  useEffect(() => {
    if (!open) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-[100]">
      <div className="absolute inset-0 animate-fade bg-forest-950/40 backdrop-blur-[2px]" onClick={onClose} />
      <aside
        className={cn(
          'absolute inset-y-0 right-0 flex w-full flex-col border-l border-forest-950/10 bg-cream-50 shadow-lift animate-rise',
          width,
        )}
        aria-modal="true"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4 border-b border-forest-950/[0.06] px-6 py-5">
          <div>
            <h2 className="font-display text-xl text-forest-950">{title}</h2>
            {subtitle ? <p className="mt-1 text-sm text-forest-800/60">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-forest-800/50 transition hover:bg-forest-950/[0.06]"
            aria-label="Close panel"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </aside>
    </div>,
    document.body,
  )
}

const BAR_TONES = {
  forest: 'bg-forest-600',
  lime: 'bg-agri-lime-dark',
  amber: 'bg-amber-500',
  red: 'bg-rose-500',
  sky: 'bg-sky-500',
  cream: 'bg-cream-300',
}

export function ProgressBar({ value = 0, tone = 'forest', className, track = 'bg-forest-950/[0.07]', height = 'h-2' }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0))
  return (
    <div className={cn('w-full overflow-hidden rounded-full', track, height, className)}>
      <div
        className={cn('h-full rounded-full transition-all duration-700', BAR_TONES[tone] || BAR_TONES.forest)}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export function ScoreRing({ score = 0, size = 150, stroke = 11, color, trackColor = 'rgba(11, 42, 32, 0.09)', children }) {
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const safe = Math.max(0, Math.min(100, Number(score) || 0))
  const offset = circumference - (safe / 100) * circumference
  const ringColor = color || (safe >= 85 ? '#2f7d5a' : safe >= 71 ? '#7a9a3d' : safe >= 56 ? '#c08a2e' : '#b34b3e')
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={trackColor} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={ringColor}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 900ms cubic-bezier(0.22, 1, 0.36, 1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  )
}

export function StatCard({ icon: Icon, label, value, suffix, hint, trend, tone = 'forest', className, onClick }) {
  const toneMap = {
    forest: 'bg-forest-600/10 text-forest-700',
    lime: 'bg-agri-lime/30 text-forest-800',
    amber: 'bg-amber-500/10 text-amber-700',
    sky: 'bg-sky-500/10 text-sky-700',
    clay: 'bg-clay-100 text-clay-500',
  }
  return (
    <Card
      className={cn('group relative overflow-hidden p-4.5 sm:p-5', onClick && 'cursor-pointer', className)}
      hover={Boolean(onClick)}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-forest-800/50">{label}</p>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="font-display text-2xl leading-none text-forest-950 sm:text-[1.7rem]">{value}</span>
            {suffix ? <span className="text-xs font-medium text-forest-800/55">{suffix}</span> : null}
          </div>
          {hint ? <p className="mt-2 text-[11px] leading-snug text-forest-800/55">{hint}</p> : null}
        </div>
        {Icon ? (
          <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', toneMap[tone])}>
            <Icon className="h-4.5 w-4.5" strokeWidth={2.1} />
          </span>
        ) : null}
      </div>
      {typeof trend === 'number' ? (
        <span className={cn('mt-3 inline-flex items-center gap-1 text-[11px] font-semibold', trend >= 0 ? 'text-forest-600' : 'text-rose-600')}>
          {trend >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
          {Math.abs(trend)}% vs prior period
        </span>
      ) : null}
    </Card>
  )
}

export function PageHeader({ eyebrow, title, description, actions, className }) {
  return (
    <div className={cn('flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="max-w-2xl">
        {eyebrow ? (
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-forest-600/70">{eyebrow}</p>
        ) : null}
        <h1 className="font-display text-[1.85rem] leading-[1.1] tracking-[-0.01em] text-forest-950 sm:text-[2.15rem]">
          {title}
        </h1>
        {description ? <p className="mt-2 text-sm leading-relaxed text-forest-800/60">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export function SectionTitle({ title, description, action, className }) {
  return (
    <div className={cn('mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4', className)}>
      <div className="min-w-0">
        <h3 className="font-display text-[1.1rem] leading-tight text-forest-950">{title}</h3>
        {description ? <p className="mt-1 text-xs leading-relaxed text-forest-800/55">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

export function EmptyState({ icon: Icon = Inbox, title, description, action, className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-2xl border border-dashed border-forest-950/12 bg-cream-100/40 px-6 py-10 text-center', className)}>
      <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-forest-950/[0.04] text-forest-700">
        <Icon className="h-5 w-5" strokeWidth={1.9} />
      </span>
      <p className="text-sm font-semibold text-forest-950">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-xs leading-relaxed text-forest-800/55">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

export function Skeleton({ className }) {
  return <div className={cn('animate-pulse rounded-xl bg-forest-950/[0.07]', className)} />
}

export function Avatar({ name = '', size = 'md', className }) {
  const [bg, fg] = avatarColors(name)
  const sizes = { xs: 'h-7 w-7 text-[10px]', sm: 'h-9 w-9 text-[11px]', md: 'h-10 w-10 text-xs', lg: 'h-12 w-12 text-sm', xl: 'h-16 w-16 text-lg' }
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-bold tracking-wide', sizes[size], className)}
      style={{ backgroundColor: bg, color: fg }}
    >
      {initials(name)}
    </span>
  )
}

export function Segmented({ options, value, onChange, className, size = 'md' }) {
  return (
    <div className={cn('inline-flex flex-wrap items-center gap-1 rounded-xl border border-forest-950/[0.07] bg-cream-100/70 p-1', className)}>
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg font-semibold transition-all',
              size === 'sm' ? 'px-2.5 py-1.5 text-[11px]' : 'px-3 py-2 text-xs',
              active ? 'bg-forest-900 text-cream-50 shadow-sm' : 'text-forest-800/65 hover:bg-white/60 hover:text-forest-900',
            )}
          >
            {option.icon ? <option.icon className="h-3.5 w-3.5" strokeWidth={2.2} /> : null}
            {option.label}
            {option.count !== undefined ? (
              <span className={cn('rounded-full px-1.5 py-0.5 text-[9px] font-bold', active ? 'bg-cream-50/20' : 'bg-forest-950/[0.06]')}>
                {option.count}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

export function InfoRow({ label, value, className }) {
  return (
    <div className={cn('flex items-center justify-between gap-4 border-b border-forest-950/[0.05] py-2.5 last:border-0', className)}>
      <span className="text-xs text-forest-800/55">{label}</span>
      <span className="text-right text-xs font-semibold text-forest-900">{value}</span>
    </div>
  )
}

export function Banner({ tone = 'info', icon: Icon, title, children, action, className }) {
  const tones = {
    info: 'border-sky-500/20 bg-sky-100/70 text-sky-900',
    warning: 'border-amber-500/25 bg-sun-100/80 text-[#6b4a16]',
    danger: 'border-rose-500/20 bg-rose-50 text-rose-900',
    success: 'border-forest-500/20 bg-forest-500/[0.07] text-forest-900',
    dark: 'border-forest-800 bg-forest-900 text-cream-100',
  }
  return (
    <div className={cn('flex items-start gap-3 rounded-2xl border px-4 py-3.5', tones[tone], className)}>
      {Icon ? <Icon className="mt-0.5 h-4.5 w-4.5 shrink-0 opacity-80" strokeWidth={2.1} /> : null}
      <div className="min-w-0 flex-1">
        {title ? <p className="text-xs font-bold">{title}</p> : null}
        {children ? <div className={cn('text-xs leading-relaxed opacity-75', title && 'mt-0.5')}>{children}</div> : null}
      </div>
      {action}
    </div>
  )
}
