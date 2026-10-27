import { cn } from '../lib/utils'

const LEAF = (
  <>
    <path
      d="M7 24.6c3.1 0 5.5-1.8 9-1.8s5.9 1.8 9 1.8"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      opacity="0.5"
    />
    <path d="M16 23.2V9.4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M16.4 15.8c.4-4.6 3.3-7.1 7.7-7.4 0 4.8-3 7.2-7.7 7.4Z" fill="currentColor" />
    <path d="M15.7 19.6c-.4-3.8-2.8-6-6.4-6.3.2 4 2.7 6.1 6.4 6.3Z" fill="currentColor" opacity="0.68" />
  </>
)

export function LogoMark({ className = 'h-9 w-9' }) {
  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center rounded-[0.95rem] bg-agri-lime text-forest-950',
        'shadow-[inset_0_-1px_0_rgba(8,30,23,0.14),inset_0_1px_0_rgba(253,251,246,0.35)]',
        className,
      )}
    >
      <svg viewBox="0 0 32 32" className="h-[68%] w-[68%]" fill="none" aria-hidden="true">
        {LEAF}
      </svg>
    </span>
  )
}

export function Logo({ light = false, compact = false, className }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <LogoMark className="h-9 w-9" />
      {!compact ? (
        <div className="leading-none">
          <p
            className={cn(
              'font-display text-[1.3rem] font-semibold leading-none tracking-[-0.03em]',
              light ? 'text-cream-50' : 'text-forest-950',
            )}
          >
            AgriSentinel
          </p>
          <p
            className={cn(
              'mt-1.5 text-[8px] font-bold uppercase tracking-[0.24em]',
              light ? 'text-agri-lime/75' : 'text-forest-600/65',
            )}
          >
            Harvest intelligence
          </p>
        </div>
      ) : null}
    </div>
  )
}
