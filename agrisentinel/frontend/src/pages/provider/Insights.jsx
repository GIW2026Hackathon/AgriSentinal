import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart3, Download, Leaf, LineChart, PackageCheck, Snowflake, Wallet,
} from 'lucide-react'
import {
  Badge, Banner, Button, Card, EmptyState, PageHeader, SectionTitle, Skeleton, StatCard,
} from '../../components/ui'
import { Donut, TrendArea } from '../../components/charts'
import { useApi } from '../../lib/useApi'
import { downloadFile } from '../../lib/api'
import { useToast } from '../../context/ToastContext'
import { formatKES, formatNumber } from '../../lib/utils'

export default function ProviderInsights() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { data, loading, error } = useApi('/provider/insights')
  const [exporting, setExporting] = useState(false)

  const kpis = data?.kpis || {}
  const trend = data?.quality_trend || []
  const gradeMix = data?.grade_mix || []

  const exportCsv = async () => {
    setExporting(true)
    try {
      await downloadFile('/provider/quality-report.csv', 'agrisentinel-quality.csv')
      toast({ type: 'success', title: 'Quality report exported' })
    } catch (err) {
      toast({ type: 'error', title: 'Export failed', message: err.message })
    } finally {
      setExporting(false)
    }
  }

  if (loading && !data) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-24 w-full" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((key) => <Skeleton key={key} className="h-32" />)}</div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12"><Skeleton className="h-80 xl:col-span-8" /><Skeleton className="h-80 xl:col-span-4" /></div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Admin console"
        title="Network insights"
        description="Quality and capacity across the network."
        actions={
          <>
            <Button variant="secondary" icon={Download} loading={exporting} onClick={exportCsv}>
              Export CSV
            </Button>
            <Button variant="accent" icon={Snowflake} onClick={() => navigate('/ops/fleet')}>
              Manage fleet
            </Button>
          </>
        }
      />

      {error ? <Banner tone="danger" icon={BarChart3} title="Insights unavailable">{error}</Banner> : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Wallet}
          label="Cold chain revenue"
          value={formatKES(kpis.revenue_30d_kes ?? 0)}
          hint="Last 30 days"
          tone="forest"
        />
        <StatCard
          icon={LineChart}
          label="Average quality"
          value={kpis.avg_quality ?? 0}
          suffix="/100"
          hint={`${formatNumber(kpis.scans_30d ?? 0)} scans in 30 days`}
          tone="lime"
        />
        <StatCard
          icon={PackageCheck}
          label="Loss avoided"
          value={formatNumber(kpis.loss_avoided_kg ?? 0)}
          suffix="kg"
          hint="Protected by cold storage"
          tone="amber"
        />
        <StatCard
          icon={Snowflake}
          label="Fleet utilisation"
          value={`${kpis.utilization_pct ?? 0}%`}
          hint={`${formatNumber(kpis.used_kg ?? 0)} of ${formatNumber(kpis.capacity_kg ?? 0)} kg`}
          tone="sky"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-8">
          <SectionTitle
            title="Quality trend"
            description="Average score across the last 14 days"
            action={<Badge tone="neutral">{kpis.scans_30d ?? 0} scans</Badge>}
          />
          <TrendArea data={trend} dataKey="avg_score" label="Avg quality" height={240} color="#28795d" />
        </Card>

        <Card className="xl:col-span-4">
          <SectionTitle title="Grade distribution" description="Quality mix across the last 30 days" />
          {gradeMix.some((item) => item.count) ? (
            <>
              <Donut data={gradeMix} height={190} inner={54} outer={78} centerLabel="Quality scans" centerValue={kpis.scans_30d ?? 0} />
              <div className="mt-3 grid grid-cols-2 gap-2">
                {gradeMix.map((grade) => (
                  <div key={grade.grade} className="flex items-center gap-2 rounded-lg bg-cream-100/60 px-2.5 py-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: grade.color }} />
                    <span className="text-[10px] font-bold text-forest-900">Grade {grade.grade}</span>
                    <span className="ml-auto text-[10px] text-forest-800/45">{grade.count} · {grade.pct}%</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <EmptyState icon={Leaf} title="No scans yet" description="Quality grades appear once farmers scan produce." />
          )}
        </Card>
      </div>
    </div>
  )
}
