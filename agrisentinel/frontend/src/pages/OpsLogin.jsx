import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, KeyRound, Lock, ShieldCheck } from 'lucide-react'
import { Logo } from '../components/Logo'
import { Button } from '../components/ui'
import { useAuth } from '../context/AuthContext'

const CONTROL = 'w-full rounded-xl border border-cream-50/15 bg-forest-950/50 px-3.5 py-2.5 text-sm text-cream-50 placeholder:text-cream-100/25 transition focus:border-agri-lime/60 focus:outline-none focus:ring-2 focus:ring-agri-lime/15'

export default function OpsLogin() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }))

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      await login(form.email.trim(), form.password, 'admin')
      navigate('/ops/insights', { replace: true })
    } catch (err) {
      setError(err.message || 'Unable to sign in')
      setBusy(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-forest-950 px-5 py-12 text-cream-50">
      <div className="pointer-events-none absolute -left-40 top-0 h-[32rem] w-[32rem] rounded-full bg-forest-600/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-48 right-0 h-[30rem] w-[30rem] rounded-full bg-agri-lime/[0.07] blur-3xl" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.22] [background-image:radial-gradient(rgba(253,251,246,0.16)_1px,transparent_1px)] [background-size:28px_28px]" />

      <div className="relative w-full max-w-[24rem]">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo light />
          <p className="mt-7 text-[10px] font-bold uppercase tracking-[0.3em] text-agri-lime/75">
            AgriSentinel administration
          </p>
          <h1 className="mt-2 font-display text-[1.75rem] leading-tight tracking-[-0.025em] text-cream-50">
            Admin sign-in
          </h1>
          <p className="mt-2 max-w-[20rem] text-xs leading-relaxed text-cream-100/45">
            Network oversight, cold-chain fleet and farmer support.
          </p>
        </div>

        <form
          onSubmit={submit}
          className="rounded-3xl border border-cream-50/10 bg-cream-50/[0.04] p-6 shadow-2xl backdrop-blur-xl sm:p-7"
        >
          <div className="mb-5 flex items-center gap-2.5 rounded-xl border border-agri-lime/15 bg-agri-lime/[0.06] px-3 py-2">
            <Lock className="h-3.5 w-3.5 shrink-0 text-agri-lime" />
            <p className="text-[10px] font-semibold leading-snug text-cream-100/60">
              Authorised administrators only. Access attempts are recorded.
            </p>
          </div>

          <div className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-semibold text-cream-100/55">
                Admin email <span className="text-clay-500">*</span>
              </span>
              <input
                type="email"
                value={form.email}
                onChange={set('email')}
                placeholder="you@agrisentinel.africa"
                autoComplete="username"
                className={CONTROL}
                required
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-semibold text-cream-100/55">
                Password <span className="text-clay-500">*</span>
              </span>
              <input
                type="password"
                value={form.password}
                onChange={set('password')}
                placeholder="••••••••"
                autoComplete="current-password"
                className={CONTROL}
                required
              />
            </label>
          </div>

          {error ? (
            <div className="mt-4 rounded-xl border border-rose-400/25 bg-rose-500/10 px-3.5 py-2.5 text-xs font-medium text-rose-200">
              {error}
            </div>
          ) : null}

          <Button
            type="submit"
            variant="accent"
            size="lg"
            loading={busy}
            icon={busy ? undefined : KeyRound}
            className="mt-5 w-full"
          >
            Enter admin console
          </Button>

          <p className="mt-5 flex items-start gap-1.5 text-[10px] leading-relaxed text-cream-100/30">
            <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0" />
            Admin access is provisioned internally and is separate from farmer accounts.
          </p>
        </form>

        <div className="mt-7 flex items-center justify-between gap-3 text-[9px] font-bold uppercase tracking-[0.24em] text-cream-100/20">
          <span>AgriSentinel · Internal systems</span>
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 normal-case tracking-normal text-cream-100/40 transition hover:text-cream-50"
          >
            <ArrowLeft className="h-3 w-3" />
            Farmer sign-in
          </Link>
        </div>
      </div>
    </div>
  )
}
