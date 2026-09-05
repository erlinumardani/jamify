import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { DollarSign, Plus, Trash2 } from 'lucide-react'
import { useStore, uid } from '../store'
import { Button, EmptyState, Modal, PageHeader, ProjectDot, cn } from '../components/ui'
import { formatMoney, presetRange, RANGE_PRESETS, toDateKey, type RangePreset } from '../lib/time'
import { EXPENSE_CATEGORIES, type Expense } from '../types'

export default function Expenses() {
  const { state, dispatch, projectById, memberById } = useStore()
  const { settings } = state
  const [preset, setPreset] = useState<RangePreset>('thisMonth')
  const [custom, setCustom] = useState<[string, string]>(() => { const [f, t] = presetRange('thisMonth', settings.weekStart); return [toDateKey(f), toDateKey(t)] })
  const [projectFilter, setProjectFilter] = useState('')
  const [editing, setEditing] = useState<Expense | null>(null)

  const [from, to] = useMemo<[string, string]>(() => {
    if (preset === 'custom') return custom[0] <= custom[1] ? custom : [custom[1], custom[0]]
    const [f, t] = presetRange(preset, settings.weekStart)
    return [toDateKey(f), toDateKey(t)]
  }, [preset, custom, settings.weekStart])

  const list = state.expenses
    .filter((x) => x.date >= from && x.date <= to)
    .filter((x) => !projectFilter || x.projectId === projectFilter)
    .sort((a, b) => b.date.localeCompare(a.date))
  const total = list.reduce((a, x) => a + x.amount, 0)
  const billableTotal = list.filter((x) => x.billable).reduce((a, x) => a + x.amount, 0)

  const newExpense = (): Expense => ({
    id: uid(), projectId: projectFilter || null, memberId: state.currentUserId, date: toDateKey(new Date()), category: EXPENSE_CATEGORIES[0],
    amount: 0, note: '', billable: true, invoiceId: null,
  })

  return (
    <div>
      <PageHeader title="Expenses">
        <Button onClick={() => setEditing(newExpense())}><Plus size={16} /> Add expense</Button>
      </PageHeader>

      <div className="ck-card mb-4 flex flex-wrap items-center gap-2 p-3">
        <select className="ck-select" value={preset} onChange={(e) => setPreset(e.target.value as RangePreset)}>
          {RANGE_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        {preset === 'custom' && (
          <div className="flex items-center gap-1">
            <input type="date" className="ck-input w-auto" value={custom[0]} onChange={(e) => setCustom([e.target.value, custom[1]])} />
            <span className="text-ck-muted">–</span>
            <input type="date" className="ck-input w-auto" value={custom[1]} onChange={(e) => setCustom([custom[0], e.target.value])} />
          </div>
        )}
        <select className="ck-select" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
          <option value="">All projects</option>
          {state.projects.filter((p) => !p.isTemplate).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <div className="ml-auto flex gap-4 text-sm text-[#666]">
          <span>Total: <span className="font-mono text-ck-text">{formatMoney(total, settings.currency)}</span></span>
          <span>Billable: <span className="font-mono text-ck-text">{formatMoney(billableTotal, settings.currency)}</span></span>
        </div>
      </div>

      <div className="ck-card overflow-x-auto">
        {list.length === 0 ? (
          <EmptyState title="No expenses in this period" hint="Record travel, software, materials or any other cost. Billable expenses can be added to invoices and count toward project budgets." action={<Button onClick={() => setEditing(newExpense())}>Add expense</Button>} />
        ) : (
          <table className="ck-table w-full min-w-[760px]">
            <thead><tr><th>Date</th><th>Category</th><th>Project</th><th>Note</th><th>Member</th><th>Billable</th><th className="text-right">Amount</th><th className="w-12" /></tr></thead>
            <tbody>
              {list.map((x) => {
                const p = projectById(x.projectId)
                return (
                  <tr key={x.id} className="cursor-pointer hover:bg-ck-bg/40" onClick={() => setEditing(x)}>
                    <td className="whitespace-nowrap">{format(new Date(x.date), 'MMM d, yyyy')}</td>
                    <td>{x.category}</td>
                    <td>{p ? <span className="inline-flex items-center gap-1.5" style={{ color: p.color }}><ProjectDot color={p.color} />{p.name}</span> : <span className="text-ck-muted">—</span>}</td>
                    <td className="max-w-[260px] truncate text-[#555]">{x.note || <span className="text-ck-muted">—</span>}</td>
                    <td className="text-[#555]">{memberById(x.memberId)?.name ?? '—'}</td>
                    <td>
                      {x.billable ? <span className="text-ck-blue">Yes</span> : <span className="text-ck-muted">No</span>}
                      {x.invoiceId && <span className="ml-1 rounded-sm bg-green-50 px-1.5 py-0.5 text-[10px] font-medium uppercase text-green-700">invoiced</span>}
                    </td>
                    <td className="text-right font-mono">{formatMoney(x.amount, settings.currency)}</td>
                    <td className="text-center" onClick={(e) => e.stopPropagation()}>
                      <button type="button" className="text-ck-muted hover:text-ck-red" title="Delete" onClick={() => confirm('Delete this expense?') && dispatch({ type: 'col/delete', col: 'expenses', id: x.id })}><Trash2 size={15} /></button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {editing && <ExpenseModal expense={editing} isNew={!state.expenses.some((x) => x.id === editing.id)} onClose={() => setEditing(null)} />}
    </div>
  )
}

function ExpenseModal({ expense, isNew, onClose }: { expense: Expense; isNew: boolean; onClose: () => void }) {
  const { state, dispatch } = useStore()
  const [x, setX] = useState<Expense>(expense)
  const valid = x.amount > 0 && !!x.date
  const save = () => {
    if (!valid) return
    if (isNew) dispatch({ type: 'col/add', col: 'expenses', row: x })
    else dispatch({ type: 'col/update', col: 'expenses', id: x.id, patch: x })
    onClose()
  }
  return (
    <Modal open onClose={onClose} title={isNew ? 'Add expense' : 'Edit expense'} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={!valid}>{isNew ? 'Add' : 'Save'}</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="ck-label">Date</label>
            <input type="date" className="ck-input" value={x.date} onChange={(e) => setX({ ...x, date: e.target.value })} />
          </div>
          <div>
            <label className="ck-label">Amount ({state.settings.currency})</label>
            <input autoFocus type="number" min={0} step="0.01" className="ck-input" value={x.amount || ''} onChange={(e) => setX({ ...x, amount: Number(e.target.value) || 0 })} onKeyDown={(e) => e.key === 'Enter' && save()} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="ck-label">Category</label>
            <select className="ck-select w-full" value={x.category} onChange={(e) => setX({ ...x, category: e.target.value })}>
              {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="ck-label">Project</label>
            <select className="ck-select w-full" value={x.projectId ?? ''} onChange={(e) => setX({ ...x, projectId: e.target.value || null })}>
              <option value="">No project</option>
              {state.projects.filter((p) => !p.archived && !p.isTemplate).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="ck-label">Member</label>
          <select className="ck-select w-full" value={x.memberId ?? ''} onChange={(e) => setX({ ...x, memberId: e.target.value || null })}>
            {state.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div>
          <label className="ck-label">Note</label>
          <input className="ck-input" placeholder="What was this for?" value={x.note} onChange={(e) => setX({ ...x, note: e.target.value })} />
        </div>
        <button type="button" onClick={() => setX({ ...x, billable: !x.billable })} className={cn('inline-flex items-center gap-2 rounded-sm border px-3 py-1.5 text-sm', x.billable ? 'border-ck-blue bg-ck-blue-light text-ck-blue-dark' : 'border-ck-border text-ck-muted')}>
          <DollarSign size={15} /> {x.billable ? 'Billable' : 'Non-billable'}
        </button>
        {x.invoiceId && <p className="text-xs text-ck-muted">This expense is already on an invoice.</p>}
      </div>
    </Modal>
  )
}
