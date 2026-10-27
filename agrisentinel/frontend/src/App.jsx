import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import Layout from './components/Layout'
import { Logo } from './components/Logo'
import { Button } from './components/ui'

import Login from './pages/Login'
import OpsLogin from './pages/OpsLogin'
import FarmerOverview from './pages/farmer/Overview'
import QualityScan from './pages/farmer/QualityScan'
import ColdStorage from './pages/farmer/ColdStorage'
import WeatherPage from './pages/farmer/Weather'
import Support from './pages/farmer/Support'

import ProviderInsights from './pages/provider/Insights'
import ProviderFleet from './pages/provider/Fleet'
import ProviderFarmers from './pages/provider/Farmers'
import QualityReport from './pages/provider/QualityReport'
import Operations from './pages/provider/Operations'

function Splash() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <Logo />
      <div className="flex items-center gap-2 text-xs font-semibold text-forest-800/45">
        <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-forest-500" />
        Preparing your harvest workspace
      </div>
    </div>
  )
}

const STAFF_ROLES = ['provider', 'admin']

function homeFor(user) {
  if (!user) return '/login'
  return STAFF_ROLES.includes(user.role) ? '/ops/insights' : '/farmer/overview'
}

function Protected({ roles, children }) {
  const { user, loading } = useAuth()
  if (loading) return <Splash />
  if (!user) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to={homeFor(user)} replace />
  return children
}

function OpsGate({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <Splash />
  if (!user) return <Navigate to="/ops/login" replace />
  if (!STAFF_ROLES.includes(user.role)) return <Navigate to="/farmer/overview" replace />
  return children
}

function LoginRoute() {
  const { user, loading } = useAuth()
  if (loading) return <Splash />
  if (user) return <Navigate to={homeFor(user)} replace />
  return <Login />
}

function OpsLoginRoute() {
  const { user, loading } = useAuth()
  if (loading) return <Splash />
  if (user) return <Navigate to={homeFor(user)} replace />
  return <OpsLogin />
}

function NotFound() {
  const { user } = useAuth()
  const navigate = useNavigate()
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <p className="font-display text-[6rem] leading-none tracking-[-0.05em] text-forest-950/10">404</p>
      <p className="mt-2 font-display text-2xl text-forest-950">This field is fallow</p>
      <p className="mt-2 max-w-sm text-sm text-forest-800/50">The page you are looking for does not exist or has moved.</p>
      <Button className="mt-6" onClick={() => navigate(homeFor(user))}>Back to dashboard</Button>
    </div>
  )
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route path="/ops/login" element={<OpsLoginRoute />} />
      <Route path="/" element={<Navigate to="/login" replace />} />

      <Route
        path="/farmer"
        element={
          <Protected roles={['farmer']}>
            <Layout />
          </Protected>
        }
      >
        <Route index element={<Navigate to="overview" replace />} />
        <Route path="overview" element={<FarmerOverview />} />
        <Route path="scan" element={<QualityScan />} />
        <Route path="storage" element={<ColdStorage />} />
        <Route path="weather" element={<WeatherPage />} />
        <Route path="support" element={<Support />} />
      </Route>

      <Route
        path="/ops"
        element={
          <OpsGate>
            <Layout />
          </OpsGate>
        }
      >
        <Route index element={<Navigate to="insights" replace />} />
        <Route path="insights" element={<ProviderInsights />} />
        <Route path="fleet" element={<ProviderFleet />} />
        <Route path="farmers" element={<ProviderFarmers />} />
        <Route path="quality" element={<QualityReport />} />
        <Route path="operations" element={<Operations />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
