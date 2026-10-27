import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line,
  LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'

const AXIS = {
  tick: { fill: '#5f6f65', fontSize: 10, fontWeight: 500 },
  axisLine: false,
  tickLine: false,
  dy: 4,
}

export function ChartTooltip({ active, payload, label, suffix = '', formatter }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-forest-950/10 bg-cream-50/95 px-3 py-2 shadow-lift backdrop-blur">
      {label ? <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-forest-800/45">{label}</p> : null}
      {payload.map((entry) => (
        <div key={`${entry.name}-${entry.dataKey}`} className="flex items-center gap-2 text-xs">
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: entry.color || entry.fill }} />
          <span className="text-forest-800/60">{entry.name}</span>
          <span className="ml-auto font-bold text-forest-950">
            {formatter ? formatter(entry.value, entry) : `${entry.value}${entry.unit || suffix}`}
          </span>
        </div>
      ))}
    </div>
  )
}

export function TrendArea({ data = [], dataKey = 'avg_score', label = 'Quality', height = 210, color = '#2f7d5a', suffix = '', domain = [0, 100] }) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="96%" stopColor={color} stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 5" vertical={false} stroke="rgba(11,42,32,0.07)" />
          <XAxis dataKey="label" {...AXIS} interval="preserveStartEnd" minTickGap={22} />
          <YAxis {...AXIS} width={36} domain={domain} />
          <Tooltip content={<ChartTooltip suffix={suffix} />} cursor={{ stroke: 'rgba(11,42,32,0.15)', strokeDasharray: '4 4' }} />
          <Area
            type="monotone"
            dataKey={dataKey}
            name={label}
            stroke={color}
            strokeWidth={2.4}
            fill={`url(#grad-${dataKey})`}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: '#fdfbf6', fill: color }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

export function ScanVolumeBars({ data = [], height = 210, color = '#c9e265' }) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 4, bottom: 0, left: -24 }}>
          <CartesianGrid strokeDasharray="3 5" vertical={false} stroke="rgba(11,42,32,0.07)" />
          <XAxis dataKey="label" {...AXIS} interval="preserveStartEnd" minTickGap={22} />
          <YAxis {...AXIS} width={30} allowDecimals={false} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(11,42,32,0.04)' }} />
          <Bar dataKey="scans" name="Scans" fill={color} radius={[5, 5, 0, 0]} maxBarSize={26} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function Sparkline({ data = [], dataKey = 'score', color = '#2f7d5a', height = 40 }) {
  if (!data.length) return <div style={{ height }} />
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`spark-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.8} fill={`url(#spark-${dataKey})`} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

export function Donut({ data = [], height = 190, inner = 58, outer = 82, centerLabel, centerValue }) {
  const total = data.reduce((sum, item) => sum + (item.count || 0), 0)
  return (
    <div className="relative w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="count"
            nameKey="label"
            innerRadius={inner}
            outerRadius={outer}
            paddingAngle={2}
            stroke="none"
            startAngle={90}
            endAngle={-270}
          >
            {data.map((entry) => <Cell key={entry.grade || entry.label} fill={entry.color} />)}
          </Pie>
          <Tooltip content={<ChartTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-2xl leading-none text-forest-950">{centerValue ?? total}</span>
        <span className="mt-1 text-[9px] font-bold uppercase tracking-[0.14em] text-forest-800/40">{centerLabel || 'Total'}</span>
      </div>
    </div>
  )
}

export function RevenueBars({ data = [], height = 230 }) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 4, bottom: 0, left: -8 }}>
          <CartesianGrid strokeDasharray="3 5" vertical={false} stroke="rgba(11,42,32,0.07)" />
          <XAxis dataKey="label" {...AXIS} />
          <YAxis {...AXIS} width={48} tickFormatter={(value) => (value >= 1000 ? `${Math.round(value / 1000)}k` : value)} />
          <Tooltip
            content={<ChartTooltip formatter={(value) => new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 0 }).format(value)} />}
            cursor={{ fill: 'rgba(11,42,32,0.04)' }}
          />
          <Bar dataKey="revenue" name="Revenue" fill="#1d5f48" radius={[6, 6, 0, 0]} maxBarSize={34} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function DualShelfChart({ data = [], height = 200 }) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 8, bottom: 0, left: -22 }}>
          <CartesianGrid strokeDasharray="3 5" vertical={false} stroke="rgba(11,42,32,0.07)" />
          <XAxis dataKey="day" tickFormatter={(v) => `D${v}`} {...AXIS} />
          <YAxis {...AXIS} width={34} domain={[0, 100]} />
          <Tooltip content={<ChartTooltip suffix="%" />} cursor={{ stroke: 'rgba(11,42,32,0.15)', strokeDasharray: '4 4' }} />
          <Line type="monotone" dataKey="ambient" name="Ambient" stroke="#c08a2e" strokeWidth={2.3} dot={{ r: 2.5, strokeWidth: 0, fill: '#c08a2e' }} />
          <Line type="monotone" dataKey="cold" name="Cold storage" stroke="#2f7d5a" strokeWidth={2.3} dot={{ r: 2.5, strokeWidth: 0, fill: '#2f7d5a' }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export function TempHistory({ data = [], height = 120, color = '#4e89a8' }) {
  const normalized = data.length ? data : [{ time: '—', temp: 0 }]
  const values = normalized.map((point) => point.temp)
  const min = Math.min(...values) - 0.8
  const max = Math.max(...values) + 0.8
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={normalized} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="temp-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <YAxis hide domain={[min, max]} />
          <XAxis dataKey="time" hide />
          <Tooltip content={<ChartTooltip suffix="°C" />} />
          <Area type="monotone" dataKey="temp" name="Temp" stroke={color} strokeWidth={1.8} fill="url(#temp-grad)" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

export function HourlyWeather({ data = [], height = 220 }) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 12, right: 6, bottom: 0, left: -20 }}>
          <defs>
            <linearGradient id="hourly-temp" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#c08a2e" stopOpacity={0.26} />
              <stop offset="100%" stopColor="#c08a2e" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 5" vertical={false} stroke="rgba(11,42,32,0.07)" />
          <XAxis dataKey="time" {...AXIS} interval={3} />
          <YAxis {...AXIS} width={34} tickFormatter={(v) => `${v}°`} />
          <Tooltip content={<ChartTooltip />} />
          <Bar dataKey="rain_prob" name="Rain probability" fill="#9ec9dd" radius={[3, 3, 0, 0]} maxBarSize={10} opacity={0.75} />
          <Area type="monotone" dataKey="temp" name="Temperature" stroke="#c08a2e" strokeWidth={2.2} fill="url(#hourly-temp)" dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
