import {
  Banana, Bean, Cherry, Citrus, CloudDrizzle, CloudFog, CloudLightning, CloudRain,
  CloudSun, Cloud, Leaf, Moon, Nut, Salad, Snowflake, Sprout, Sun,
} from 'lucide-react'

export function cn(...values) {
  return values.filter(Boolean).join(' ')
}

export const CROP_ICONS = {
  tomato: Cherry,
  kale: Leaf,
  avocado: Nut,
  mango: Citrus,
  potato: Bean,
  onion: Sprout,
  cabbage: Salad,
  banana: Banana,
}

export const CROP_COLORS = {
  tomato: '#d2553a',
  kale: '#3f7a3a',
  avocado: '#5c7a37',
  mango: '#dea52d',
  potato: '#b58b57',
  onion: '#96506e',
  cabbage: '#8cb563',
  banana: '#dfbd3f',
}

export const CROP_SAMPLES = {
  tomato: '/samples/tomato.jpg',
  kale: '/samples/kale.jpg',
  potato: '/samples/potato.jpg',
  cabbage: '/samples/cabbage.jpg',
}

export const WEATHER_ICONS = {
  sun: Sun,
  'cloud-sun': CloudSun,
  cloud: Cloud,
  fog: CloudFog,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  'heavy-rain': CloudRain,
  snow: Snowflake,
  storm: CloudLightning,
  moon: Moon,
}

export const GRADE_TONES = {
  A: { bg: 'bg-forest-600', soft: 'bg-forest-500/10 text-forest-700 border-forest-500/20', text: 'text-forest-700', hex: '#2f7d5a' },
  B: { bg: 'bg-lime-500', soft: 'bg-lime-500/10 text-lime-800 border-lime-500/25', text: 'text-lime-800', hex: '#7a9a3d' },
  C: { bg: 'bg-amber-500', soft: 'bg-amber-500/10 text-amber-800 border-amber-500/25', text: 'text-amber-800', hex: '#c08a2e' },
  D: { bg: 'bg-rose-500', soft: 'bg-rose-500/10 text-rose-800 border-rose-500/25', text: 'text-rose-800', hex: '#b34b3e' },
}

export const STATUS_TONES = {
  available: 'bg-forest-500/10 text-forest-700 border-forest-500/20',
  active: 'bg-forest-500/10 text-forest-700 border-forest-500/20',
  in_transit: 'bg-sky-500/10 text-sky-700 border-sky-500/20',
  pending: 'bg-amber-500/10 text-amber-800 border-amber-500/25',
  in_progress: 'bg-amber-500/10 text-amber-800 border-amber-500/25',
  maintenance: 'bg-amber-500/10 text-amber-800 border-amber-500/25',
  completed: 'bg-forest-600/10 text-forest-700 border-forest-600/20',
  resolved: 'bg-forest-600/10 text-forest-700 border-forest-600/20',
  full: 'bg-clay-100 text-clay-500 border-clay-500/20',
  offline: 'bg-rose-500/10 text-rose-700 border-rose-500/20',
  open: 'bg-sky-500/10 text-sky-700 border-sky-500/20',
  cancelled: 'bg-cream-200 text-forest-800/60 border-cream-300',
}

export const SEVERITY = {
  high: { label: 'High', tone: 'bg-rose-500/10 text-rose-700 border-rose-500/25', dot: '#b34b3e' },
  extreme: { label: 'Extreme', tone: 'bg-rose-500/15 text-rose-800 border-rose-500/30', dot: '#9a2f24' },
  medium: { label: 'Watch', tone: 'bg-amber-500/10 text-amber-800 border-amber-500/25', dot: '#c08a2e' },
  moderate: { label: 'Moderate', tone: 'bg-amber-500/10 text-amber-800 border-amber-500/25', dot: '#c08a2e' },
  low: { label: 'Low', tone: 'bg-forest-500/10 text-forest-700 border-forest-500/20', dot: '#2f7d5a' },
  info: { label: 'Info', tone: 'bg-sky-500/10 text-sky-700 border-sky-500/20', dot: '#4e89a8' },
  none: { label: 'Clear', tone: 'bg-forest-500/10 text-forest-700 border-forest-500/20', dot: '#2f7d5a' },
}

export function cropIcon(key) {
  return CROP_ICONS[key] || Leaf
}

export function cropColor(key) {
  return CROP_COLORS[key] || '#3f7a3a'
}

export function weatherIcon(key) {
  return WEATHER_ICONS[key] || CloudSun
}

export function formatNumber(value, options = {}) {
  return new Intl.NumberFormat('en-KE', options).format(Number(value || 0))
}

export function formatKES(value) {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    maximumFractionDigits: 0,
  }).format(Number(value || 0))
}

export function formatKg(value) {
  return `${formatNumber(value)} kg`
}

export function formatDate(iso, options = {}) {
  if (!iso) return '—'
  const date = new Date(iso)
  return date.toLocaleDateString('en-KE', {
    day: 'numeric', month: 'short', ...options,
  })
}

export function formatDateLong(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-KE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

export function formatTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })
}

export function relativeTime(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  const diff = Date.now() - date.getTime()
  const minutes = Math.round(diff / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d ago`
  return formatDate(iso)
}

export function initials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

const AVATAR_PALETTE = [
  ['#dcebc2', '#33591f'],
  ['#f2e3c6', '#7a531d'],
  ['#d9e8ee', '#27566b'],
  ['#f2dcd3', '#8a4029'],
  ['#e5e0ef', '#4b3f70'],
  ['#d6ece4', '#1f5d48'],
  ['#f5e2ce', '#80512a'],
]

export function avatarColors(name = '') {
  let hash = 0
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) % 997
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length]
}

export function scoreTone(score) {
  if (score >= 85) return { label: 'Premium', color: '#2f7d5a', soft: '#e7f1e9' }
  if (score >= 71) return { label: 'Healthy', color: '#7a9a3d', soft: '#eff3dc' }
  if (score >= 56) return { label: 'Fair', color: '#c08a2e', soft: '#f8eed5' }
  return { label: 'At risk', color: '#b34b3e', soft: '#f6e2dd' }
}

export function weatherTone(risk) {
  return SEVERITY[risk] || SEVERITY.low
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function todayLabel() {
  return new Date().toLocaleDateString('en-KE', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
}

export function truncate(text = '', length = 90) {
  if (text.length <= length) return text
  return `${text.slice(0, length).trim()}…`
}

export function mediaSrc(url = '') {
  if (!url) return ''
  const marker = url.indexOf('/media/')
  return marker >= 0 ? url.slice(marker) : url
}
