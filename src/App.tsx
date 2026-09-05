import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { StoreProvider } from './store'
import { AuthProvider } from './auth'
import Layout from './components/Layout'
import TimeTracker from './pages/TimeTracker'
import Timesheet from './pages/Timesheet'
import CalendarPage from './pages/Calendar'
import Dashboard from './pages/Dashboard'
import Reports from './pages/Reports'
import Projects from './pages/Projects'
import ProjectDetail from './pages/ProjectDetail'
import Clients from './pages/Clients'
import Tags from './pages/Tags'
import Team from './pages/Team'
import SettingsPage from './pages/Settings'
import Expenses from './pages/Expenses'
import Invoices from './pages/Invoices'
import TimeOff from './pages/TimeOff'
import Approvals from './pages/Approvals'
import Schedule from './pages/Schedule'

export default function App() {
  return (
    <AuthProvider>
      {(user) => (
        <StoreProvider user={user}>
          <BrowserRouter>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<Navigate to="/tracker" replace />} />
                <Route path="/tracker" element={<TimeTracker />} />
                <Route path="/timesheet" element={<Timesheet />} />
                <Route path="/calendar" element={<CalendarPage />} />
                <Route path="/approvals" element={<Approvals />} />
                <Route path="/time-off" element={<TimeOff />} />
                <Route path="/schedule" element={<Schedule />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/expenses" element={<Expenses />} />
                <Route path="/invoices" element={<Invoices />} />
                <Route path="/invoices/:id" element={<Invoices />} />
                <Route path="/projects" element={<Projects />} />
                <Route path="/projects/:id" element={<ProjectDetail />} />
                <Route path="/clients" element={<Clients />} />
                <Route path="/tags" element={<Tags />} />
                <Route path="/team" element={<Team />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<Navigate to="/tracker" replace />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </StoreProvider>
      )}
    </AuthProvider>
  )
}
