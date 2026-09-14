import { useMemo } from 'react'
import { format, isSameDay } from 'date-fns'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, ClipboardCheck, Palmtree, PieChart, Timer } from 'lucide-react'
import { useStore } from '../store'
import { Button, EmptyState, PageHeader, ProjectDot, cn } from '../components/ui'
import { Donut } from './Reports'
import { entrySeconds, formatDuration, formatMoney, presetRange, sumSeconds, weekDays, formatTime, toDateKey } from '../lib/time'

export default function Dashboard() {
  const { state, can, myEntries, now, running, projectById, rateFor, costRateFor } = useStore()
  const navigate = useNavigate()
  const { settings } = state
  const today = new Date()
  const days = weekDays(today, settings.weekStart)
  const [wFrom, wTo] = presetRange('thisWeek', settings.weekStart)

  const weekEntries = useMemo(() => {
    const f = wFrom.getTime(), t = wTo.getTime()
    return myEntries.filter((e) => { const s = new Date(e.start).getTime(); return s >= f && s <= t })
  }, [myEntries, wFrom, wTo])

  const todaySecs = sumSeconds(myEntries.filter((e) => isSameDay(new Date(e.start), today)), now)
  const weekSecs = sumSeconds(weekEntries, now)
  const billableSecs = sumSeconds(weekEntries.filter((e) => e.billable), now)
  const weekAmount = weekEntries.reduce((a, e) => a + (entrySeconds(e, now) / 3600) * rateFor(e), 0)
  const weekCost = weekEntries.reduce((a, e) => a + (entrySeconds(e, now) / 3600) * costRateFor(e), 0)
  const perDay = days.map((d) => sumSeconds(weekEntries.filter((e) => isSameDay(new Date(e.start), d)), now))
  const maxDay = Math.max(1, ...perDay, (settings.dailyTargetHours ?? 0) * 3600)

  const byProject = useMemo(() => {
    const m = new Map<string | null, number>()
    for (const e of weekEntries) m.set(e.projectId, (m.get(e.projectId) ?? 0) + entrySeconds(e, now))
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [weekEntries, now])

  // budget / estimate alerts across all projects
  const alerts = useMemo(() => {
    const out: { id: string; name: string; color: string; kind: 'estimate' | 'budget'; pct: number }[] = []
    for (const p of state.projects) {
      if (p.archived || p.isTemplate) continue
      const entries = state.entries.filter((e) => e.projectId === p.id)
      const secs = sumSeconds(entries, now)
      const amount = entries.reduce((a, e) => a + (entrySeconds(e, now) / 3600) * rateFor(e), 0) + state.expenses.filter((x) => x.projectId === p.id && x.billable).reduce((a, x) => a + x.amount, 0)
      if (p.estimateHours) { const pct = (secs / 3600 / p.estimateHours) * 100; if (pct >= settings.budgetAlertPercent) out.push({ id: p.id, name: p.name, color: p.color, kind: 'estimate', pct }) }
      if (p.budget) { const pct = (amount / p.budget) * 100; if (pct >= settings.budgetAlertPercent) out.push({ id: p.id, name: p.name, color: p.color, kind: 'budget', pct }) }
    }
    return out.sort((a, b) => b.pct - a.pct)
  }, [state.projects, state.entries, state.expenses, now, rateFor, settings.budgetAlertPercent])
  // members only load their own entries, so project-wide budget numbers are only meaningful for managers
  const showAlerts = can.manage && alerts.length > 0

  const pendingApprovals = state.approvals.filter((a) => a.status === 'Pending').length
  const pendingTimeOff = state.timeOffRequests.filter((r) => r.status === 'Pending').length
  const todayKey = toDateKey(today)
  const offToday = state.timeOffRequests.filter((r) => r.status === 'Approved' && r.startDate <= todayKey && r.endDate >= todayKey)
  const scheduledToday = state.schedules.filter((s) => s.startDate <= todayKey && s.endDate >= todayKey)
  const hasTeamNews = pendingApprovals > 0 || pendingTimeOff > 0 || offToday.length > 0 || scheduledToday.length > 0

  const recent = useMemo(() => [...myEntries].sort((a, b) => b.start.localeCompare(a.start)).slice(0, 8), [myEntries])
  const hasData = myEntries.length > 0

  return (
    <div className="space-y-4">
      <PageHeader title="Dashboard">
        <span className="text-sm text-ck-muted">{format(wFrom, 'MMM d')} – {format(wTo, 'MMM d, yyyy')}</span>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Today" value={formatDuration(todaySecs, settings.durationFormat)} accent={!!running} sub={running ? 'Timer running' : undefined} target={settings.dailyTargetHours ? { pct: (todaySecs / 3600 / settings.dailyTargetHours) * 100, label: `of ${settings.dailyTargetHours}h target` } : undefined} />
        <Stat label="This week" value={formatDuration(weekSecs, settings.durationFormat)} target={settings.weeklyTargetHours ? { pct: (weekSecs / 3600 / settings.weeklyTargetHours) * 100, label: `of ${settings.weeklyTargetHours}h target` } : undefined} />
        <Stat label="Billable this week" value={formatDuration(billableSecs, settings.durationFormat)} sub={weekSecs ? `${Math.round((billableSecs / weekSecs) * 100)}% of tracked` : undefined} />
        <Stat label="Earned this week" value={formatMoney(weekAmount, settings.currency)} sub={weekCost ? `Profit ${formatMoney(weekAmount - weekCost, settings.currency)}` : undefined} />
      </div>

      {(showAlerts || hasTeamNews) && (
        <div className="grid gap-3 md:grid-cols-2">
          {showAlerts && (
            <div className="ck-card border-l-[3px] border-l-amber-500 p-4">
              <h2 className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-amber-700"><AlertTriangle size={14} aria-hidden="true" /> Budget alerts</h2>
              <ul className="space-y-1 text-sm">
                {alerts.map((a) => (
                  <li key={`${a.id}-${a.kind}`} className="flex items-center gap-2">
                    <ProjectDot color={a.color} />
                    <Link to={`/projects/${a.id}`} className="min-w-0 flex-1 truncate hover:underline">{a.name}</Link>
                    <span className={cn('font-mono', a.pct >= 100 ? 'text-ck-red' : 'text-amber-700')}>{Math.round(a.pct)}% of {a.kind}{a.pct >= 100 && ' · over'}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {hasTeamNews && (
            <div className="ck-card p-4">
              <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-ck-muted">Team today</h2>
              <ul className="space-y-1.5 text-sm">
                {pendingApprovals > 0 && <li className="flex items-center gap-2"><ClipboardCheck size={15} className="shrink-0 text-ck-blue" aria-hidden="true" /><Link to="/approvals" className="hover:underline">{pendingApprovals} timesheet{pendingApprovals > 1 ? 's' : ''} waiting for approval</Link></li>}
                {pendingTimeOff > 0 && <li className="flex items-center gap-2"><Palmtree size={15} className="shrink-0 text-ck-green" aria-hidden="true" /><Link to="/time-off" className="hover:underline">{pendingTimeOff} time off request{pendingTimeOff > 1 ? 's' : ''} pending</Link></li>}
                {offToday.map((r) => <li key={r.id} className="flex items-center gap-2 text-[#555]"><Palmtree size={15} className="shrink-0 text-ck-muted" aria-hidden="true" />{state.members.find((m) => m.id === r.memberId)?.name} is off today ({state.timeOffPolicies.find((p) => p.id === r.policyId)?.name})</li>)}
                {scheduledToday.map((s) => <li key={s.id} className="flex items-center gap-2 text-[#555]"><ProjectDot color={projectById(s.projectId)?.color ?? '#999'} />{state.members.find((m) => m.id === s.memberId)?.name}: {projectById(s.projectId)?.name ?? 'Unassigned'} · {s.hoursPerDay}h</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {!hasData ? (
        <div className="ck-card">
          <EmptyState
            icon={<Timer size={40} />}
            title="No time tracked yet"
            hint="Start the timer or add time manually, and your daily totals, targets and top projects show up here."
            action={<Button onClick={() => navigate('/tracker')}><Timer size={16} aria-hidden="true" /> Start tracking</Button>}
          />
        </div>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <div className="ck-card p-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs font-medium uppercase tracking-wide text-ck-muted">
                <h2 id="week-chart-title">Tracked time this week</h2>
                {settings.dailyTargetHours && <span className="normal-case tracking-normal">dashed line = {settings.dailyTargetHours}h daily target</span>}
              </div>
              <div role="group" aria-labelledby="week-chart-title" className="relative flex h-52 items-end gap-2 sm:gap-3">
                {settings.dailyTargetHours && (
                  <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 border-t border-dashed border-ck-blue/60" style={{ bottom: `calc(${((settings.dailyTargetHours * 3600) / maxDay) * 100}% * (1 - 44px / 100%) + 28px)` }} />
                )}
                {!weekSecs && <p className="pointer-events-none absolute inset-x-0 top-1/3 text-center text-sm text-ck-muted">No time tracked this week yet</p>}
                {days.map((d, i) => {
                  const isT = isSameDay(d, today)
                  const value = formatDuration(perDay[i], 'compact')
                  return (
                    <div
                      key={i}
                      tabIndex={0}
                      role="img"
                      aria-label={`${format(d, 'EEEE')}${isT ? ' (today)' : ''}: ${value}`}
                      className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ck-blue"
                    >
                      <div aria-hidden="true" className="whitespace-nowrap font-mono text-[11px] text-[#666] opacity-0 transition-opacity group-hover:opacity-100 group-focus:opacity-100 sm:opacity-100">{perDay[i] ? value : ''}</div>
                      <div aria-hidden="true" className="relative w-full max-w-[56px] flex-1">
                        <div className="absolute inset-x-0 bottom-0 rounded-t-sm bg-ck-border-light" style={{ height: '100%' }} />
                        <div
                          className={`ck-grow absolute inset-x-0 bottom-0 rounded-t-sm ${isT ? 'bg-ck-blue' : 'bg-ck-blue/60'}`}
                          style={{ height: `${(perDay[i] / maxDay) * 100}%`, animationDelay: `${i * 60}ms` }}
                        />
                      </div>
                      <div aria-hidden="true" className={`text-xs ${isT ? 'font-medium text-ck-blue underline underline-offset-4' : 'text-ck-muted'}`}>{format(d, 'EEE')}</div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="ck-card p-4">
              <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-ck-muted">Top projects</h2>
              {byProject.length === 0 ? (
                <EmptyState icon={<PieChart size={40} />} title="Nothing tracked this week" hint="Projects you track time on this week appear here." />
              ) : (
                <>
                  <Donut slices={byProject.map(([id, v]) => ({ value: v, color: projectById(id)?.color ?? '#c6d2d9', label: projectById(id)?.name ?? 'Without project' }))} total={weekSecs} size={140} label="Time by project this week" />
                  <ul className="mt-4 space-y-2 text-sm">
                    {byProject.slice(0, 6).map(([id, v]) => {
                      const p = projectById(id)
                      return (
                        <li key={id ?? 'none'}>
                          <div className="flex items-center gap-2">
                            <ProjectDot color={p?.color ?? '#c6d2d9'} />
                            <span className="min-w-0 flex-1 truncate">{p ? <Link to={`/projects/${p.id}`} className="hover:underline">{p.name}</Link> : 'Without project'}</span>
                            <span className="font-mono text-[#666]">{formatDuration(v, settings.durationFormat)}</span>
                          </div>
                          <div className="ml-4 mt-1 h-1 rounded-full bg-ck-border-light" aria-hidden="true">
                            <div className="h-1 rounded-full" style={{ width: `${weekSecs ? (v / weekSecs) * 100 : 0}%`, background: p?.color ?? '#c6d2d9' }} />
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </>
              )}
            </div>
          </div>

          <div className="ck-card overflow-hidden">
            <h2 className="border-b border-ck-border-light px-4 py-3 text-xs font-medium uppercase tracking-wide text-ck-muted">Recent activity</h2>
            <ul>
              {recent.map((e) => {
                const p = projectById(e.projectId)
                const isRunning = e.end === null
                return (
                  <li key={e.id} className="flex items-center gap-3 border-b border-ck-border-light px-4 py-2.5 text-sm last:border-b-0">
                    <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${isRunning ? 'bg-ck-red ck-pulse' : ''}`} style={!isRunning ? { background: p?.color ?? '#c6d2d9' } : undefined} />
                    <span className="min-w-0 flex-1 truncate">{e.description || <span className="text-ck-muted">(no description)</span>}</span>
                    {isRunning && <span className="shrink-0 text-xs font-medium uppercase text-ck-red">Running</span>}
                    {p && <span className="hidden truncate text-xs sm:inline" style={{ color: p.color }}>{p.name}</span>}
                    <span className="hidden whitespace-nowrap text-xs text-ck-muted md:inline">{format(new Date(e.start), 'MMM d')} · {formatTime(new Date(e.start), settings.timeFormat)}</span>
                    <span className="w-20 shrink-0 text-right font-mono text-[#555]">{formatDuration(entrySeconds(e, now), settings.durationFormat)}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        </>
      )}
    </div>
  )
}

function Stat({ label, value, sub, accent, target }: { label: string; value: string; sub?: string; accent?: boolean; target?: { pct: number; label: string } }) {
  return (
    <div className={`ck-card min-w-0 px-4 py-3 ${accent ? 'border-l-[3px] border-l-ck-blue' : ''}`}>
      <div className="text-[11px] font-medium uppercase tracking-wide text-ck-muted">{label}</div>
      <div className="mt-1 break-words font-mono text-xl font-light sm:text-2xl">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-ck-muted">{sub}</div>}
      {target && (
        <div className="mt-2">
          <div className="h-1.5 rounded-full bg-ck-border-light" aria-hidden="true"><div className={cn('h-1.5 rounded-full', target.pct >= 100 ? 'bg-ck-green' : 'bg-ck-blue')} style={{ width: `${Math.min(100, target.pct)}%` }} /></div>
          <div className="mt-0.5 text-[11px] text-ck-muted">{Math.round(target.pct)}% {target.label}{target.pct >= 100 && ' · reached'}</div>
        </div>
      )}
    </div>
  )
}
