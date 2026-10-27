import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight, Check, CloudSun, Leaf, LockKeyhole, ScanLine, ShieldCheck, Snowflake, Sparkles, Sprout,
} from 'lucide-react'
import { Logo, LogoMark } from '../components/Logo'
import GoogleSignIn from '../components/GoogleSignIn'
import { Button, Field, Input, ScoreRing, Segmented, Select } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useApi } from '../lib/useApi'

const FALLBACK_REGIONS = [
  { name: 'Nakuru' }, { name: 'Kiambu' }, { name: 'Meru' }, { name: 'Eldoret' },
  { name: 'Naivasha' }, { name: 'Machakos' }, { name: 'Kisumu' }, { name: 'Nyeri' },
]

const TRUST = [
  { icon: ScanLine, label: 'Photo quality scan', detail: 'Grade in seconds' },
  { icon: CloudSun, label: 'Weather shelf life', detail: '3-day forecast model' },
  { icon: Snowflake, label: 'Sentinel cold storage', detail: 'Mobile & solar rooms' },
]

export default function Login() {
  const { user, login, googleLogin, register } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const { data: meta } = useApi('/meta')

  const [mode, setMode] = useState('login')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({
    email: '',
    password: '',
    name: '',
    phone: '',
    region: 'Nakuru',
    farm_name: '',
  })

  const regions = meta?.regions?.length ? meta.regions : FALLBACK_REGIONS
  const googleClientId = meta?.google_client_id || ''
  const demo = meta?.demo_accounts?.farmer || { email: 'amina@farm.africa', password: 'demo1234' }

  useEffect(() => {
    if (user && !busy) {
      navigate(['provider', 'admin'].includes(user.role) ? '/ops/insights' : '/farmer/overview', { replace: true })
    }
  }, [user, busy, navigate])

  useEffect(() => {
    // Discreet admin entrance; never rendered in the public UI.
    const onKeyDown = (event) => {
      if (event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey && event.code === 'KeyO') {
        event.preventDefault()
        navigate('/ops/login')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [navigate])

  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }))

  const fillDemo = () => {
    setMode('login')
    setError('')
    setForm((prev) => ({ ...prev, email: demo.email, password: demo.password }))
  }

  const finish = (account) => {
    toast({
      type: 'success',
      title: `Karibu, ${account.name.split(' ')[0]}`,
      message: 'Your harvest workspace is ready.',
    })
    navigate('/farmer/overview', { replace: true })
  }

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const account =
        mode === 'login'
          ? await login(form.email.trim(), form.password, 'farmer')
          : await register({
              name: form.name.trim(),
              email: form.email.trim(),
              password: form.password,
              phone: form.phone.trim(),
              region: form.region,
              farm_name: form.farm_name.trim(),
            })
      finish(account)
    } catch (err) {
      setError(err.message || 'Could not sign you in')
      setBusy(false)
    }
  }

  const handleGoogle = async (credential) => {
    setError('')
    setBusy(true)
    try {
      finish(await googleLogin(credential))
    } catch (err) {
      setError(err.message || 'Google sign-in failed')
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[1.06fr_0.94fr]">
      <section className="relative isolate overflow-hidden bg-forest-950 px-5 pb-10 pt-5 text-cream-50 sm:px-9 lg:flex lg:min-h-screen lg:flex-col lg:px-12 lg:py-10 xl:px-16">
        <img
          src="/images/login-hero.jpg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 -z-10 h-full w-full object-cover object-[62%_center] opacity-60 sm:opacity-65"
        />
        <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-forest-950/90 via-forest-950/60 to-forest-950 lg:bg-gradient-to-r lg:from-forest-950 lg:via-forest-950/85 lg:to-forest-950/25" />
        <div className="pointer-events-none absolute -bottom-32 -left-24 -z-10 h-80 w-80 rounded-full bg-agri-lime/15 blur-3xl" />

        <div className="relative flex items-center justify-between gap-3">
          <Logo light />
          <span className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-cream-50/15 bg-forest-950/30 px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-cream-100/70 backdrop-blur-md sm:text-[10px] sm:tracking-[0.16em]">
            <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-agri-lime" />
            <span className="hidden sm:inline">Works on any phone ·&nbsp;</span>*384*74#
          </span>
        </div>

        <div className="relative mt-12 max-w-xl sm:mt-14 lg:mt-20 xl:mt-24">
          <p className="text-[10px] font-bold uppercase tracking-[0.26em] text-agri-lime/85 sm:text-[11px]">
            Scan. Store. Sell with certainty.
          </p>
          <h1 className="mt-3 font-display text-[2.15rem] leading-[1.02] tracking-[-0.03em] text-cream-50 sm:text-[3rem] xl:text-[3.55rem]">
            Know your harvest
            <span className="block text-agri-lime">before the market does.</span>
          </h1>
          <p className="mt-4 max-w-md text-[13px] leading-relaxed text-cream-100/65 sm:text-sm">
            One photo gives you a quality grade, a shelf-life forecast and a nearby cold room —
            on a smartphone or a basic phone.
          </p>

          <div className="mt-7 max-w-[25rem] rounded-[1.5rem] border border-cream-50/15 bg-forest-950/45 p-3.5 shadow-2xl backdrop-blur-xl sm:p-4">
            <div className="flex items-center gap-3">
              <img
                src="/samples/tomato.jpg"
                alt="Tomato quality scan sample"
                className="h-14 w-14 shrink-0 rounded-xl object-cover ring-1 ring-cream-50/20 sm:h-16 sm:w-16"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[8px] font-bold uppercase tracking-[0.18em] text-cream-100/40 sm:text-[9px]">
                  Quality scan · just now
                </p>
                <p className="mt-1 truncate font-display text-[15px] leading-tight text-cream-50 sm:text-base">
                  Tomatoes · Grade A
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px]">
                  <span className="rounded-md bg-agri-lime/15 px-1.5 py-0.5 font-bold text-agri-lime">88 / 100</span>
                  <span className="text-cream-100/55">+6.2 days shelf life</span>
                </div>
              </div>
              <ScoreRing score={88} size={52} stroke={5} color="#b9d95e" trackColor="rgba(253,251,246,0.16)">
                <span className="font-display text-xs text-cream-50">A</span>
              </ScoreRing>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-cream-50/10 pt-3 text-[10px]">
              <div>
                <p className="text-[8px] font-bold uppercase tracking-[0.16em] text-cream-100/35">Sentinel cold room</p>
                <p className="mt-0.5 font-semibold text-cream-100/80">2.4 km · solar</p>
              </div>
              <div>
                <p className="text-[8px] font-bold uppercase tracking-[0.16em] text-cream-100/35">Market window</p>
                <p className="mt-0.5 font-semibold text-cream-100/80">Tue · best price</p>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={fillDemo}
              className="group inline-flex items-center gap-2 rounded-2xl bg-agri-lime px-5 py-3 text-xs font-bold text-forest-950 shadow-lift transition hover:bg-agri-lime-dark"
            >
              <Sprout className="h-4 w-4" />
              Try the demo farm
              <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
            </button>
            <span className="text-[10px] font-medium text-cream-100/40">Fills the sign-in · no sign-up</span>
          </div>
        </div>

        <div className="relative mt-auto hidden gap-3 pt-14 lg:grid lg:grid-cols-3">
          {TRUST.map((item) => (
            <div key={item.label} className="rounded-2xl border border-cream-50/10 bg-cream-50/[0.05] p-3.5 backdrop-blur-md">
              <item.icon className="h-4 w-4 text-agri-lime" strokeWidth={2} />
              <p className="mt-2.5 text-[11px] font-bold text-cream-50">{item.label}</p>
              <p className="mt-0.5 text-[10px] leading-snug text-cream-100/45">{item.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="relative flex flex-col justify-center overflow-hidden bg-cream-100 px-5 py-10 sm:px-10 lg:min-h-screen lg:py-12 xl:px-16">
        <div className="pointer-events-none absolute -right-24 top-1/4 h-72 w-72 rounded-full bg-agri-lime/10 blur-3xl" />

        <div className="relative mx-auto w-full max-w-[26.5rem]">
          <div className="mb-6">
            <LogoMark className="mb-4 h-10 w-10 lg:hidden" />
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-forest-600/70">
              {mode === 'login' ? 'Farmer sign-in' : 'New farmer account'}
            </p>
            <h2 className="mt-2 font-display text-[1.85rem] leading-tight tracking-[-0.025em] text-forest-950 sm:text-[2rem]">
              {mode === 'login' ? 'Sign in to your farm' : 'Create your farm workspace'}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-forest-800/55">
              {mode === 'login'
                ? 'Your scans, storage bookings and market window in one place.'
                : 'Free to start, and it works with any phone.'}
            </p>
          </div>

          <Segmented
            className="w-full [&>button]:flex-1"
            value={mode}
            onChange={(value) => {
              setMode(value)
              setError('')
            }}
            options={[
              { value: 'login', label: 'Sign in' },
              { value: 'register', label: 'Create account' },
            ]}
          />

          {mode === 'login' && googleClientId ? (
            <div className="mt-5">
              <GoogleSignIn clientId={googleClientId} onCredential={handleGoogle} onError={setError} />
              <div className="mt-5 flex items-center gap-3">
                <span className="h-px flex-1 bg-forest-950/[0.08]" />
                <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-forest-800/35">or use email</span>
                <span className="h-px flex-1 bg-forest-950/[0.08]" />
              </div>
            </div>
          ) : null}

          <form onSubmit={submit} className="mt-5 space-y-4">
            {mode === 'register' ? (
              <>
                <Field label="Full name" required>
                  <Input
                    value={form.name}
                    onChange={set('name')}
                    placeholder="Amina Wanjiku"
                    autoComplete="name"
                    maxLength={150}
                    required
                  />
                </Field>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Phone" hint="USSD synced">
                    <Input
                      value={form.phone}
                      onChange={set('phone')}
                      placeholder="+254 7xx xxx xxx"
                      autoComplete="tel"
                      maxLength={24}
                    />
                  </Field>
                  <Field label="Region">
                    <Select value={form.region} onChange={set('region')}>
                      {regions.map((region) => (
                        <option key={region.name} value={region.name}>{region.name}</option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <Field label="Farm name" hint="Optional">
                  <Input
                    value={form.farm_name}
                    onChange={set('farm_name')}
                    placeholder="Wanjiku Greens"
                    maxLength={120}
                  />
                </Field>
              </>
            ) : null}

            <Field label="Email address" required>
              <Input
                type="email"
                value={form.email}
                onChange={set('email')}
                placeholder="you@farm.africa"
                autoComplete="email"
                maxLength={254}
                required
              />
            </Field>
            <Field label="Password" hint={mode === 'register' ? '8+ characters' : undefined} required>
              <Input
                type="password"
                value={form.password}
                onChange={set('password')}
                placeholder="••••••••"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
                minLength={mode === 'register' ? 8 : undefined}
              />
            </Field>

            {error ? (
              <div className="rounded-xl border border-rose-500/20 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800">
                {error}
              </div>
            ) : null}

            <Button type="submit" size="lg" loading={busy} className="w-full">
              {mode === 'login' ? 'Sign in' : 'Create account'}
              {!busy ? <ArrowRight className="h-4 w-4" /> : null}
            </Button>
          </form>

          {mode === 'login' ? (
            <div className="mt-5 rounded-2xl border border-forest-950/[0.07] bg-cream-50/80 p-3">
              <button
                type="button"
                onClick={fillDemo}
                className="group flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left transition hover:bg-white/70"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-forest-500/10 text-forest-700">
                  <Leaf className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-[11px] font-bold text-forest-950">
                    Try the demo farm
                    <Sparkles className="h-3 w-3 text-forest-500" />
                  </span>
                  <span className="mt-0.5 block truncate text-[10px] text-forest-800/45">
                    Amina · Nakuru smallholder · fills the sign-in for you
                  </span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-forest-800/30 transition group-hover:translate-x-0.5 group-hover:text-forest-700" />
              </button>
            </div>
          ) : (
            <p className="mt-5 flex items-start gap-2 text-[11px] leading-relaxed text-forest-800/45">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-forest-500" />
              Create one account for scans, storage bookings and the USSD line. Your farm stays linked by phone number.
            </p>
          )}

          <p className="mt-6 flex items-start gap-2 text-[10px] leading-relaxed text-forest-800/40">
            <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0 text-forest-500" />
            Crop photos and records stay private to your farm and are never shared.
          </p>

          <div className="mt-7 flex items-center justify-between gap-3 border-t border-forest-950/[0.06] pt-4">
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-forest-800/30">
              AgriSentinel · Built for Kenyan smallholders
            </p>
            <span className="flex items-center gap-1 text-[9px] font-semibold text-forest-800/35">
              <ShieldCheck className="h-3 w-3 text-forest-500" /> Secure sign-in
            </span>
          </div>
        </div>
      </section>
    </div>
  )
}
