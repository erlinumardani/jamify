import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { addDays, format } from 'date-fns'
import { ArrowLeft, Clock, Plus, Printer, Receipt, Trash2 } from 'lucide-react'
import { useStore, uid } from '../store'
import { Badge, Button, EmptyState, Modal, PageHeader, cn } from '../components/ui'
import { entrySeconds, formatMoney, roundSeconds, toDateKey } from '../lib/time'
import type { Invoice, InvoiceItem, InvoiceStatus } from '../types'

const STATUSES: InvoiceStatus[] = ['Draft', 'Sent', 'Paid', 'Void']
const tone = (s: InvoiceStatus) => (s === 'Paid' ? 'green' : s === 'Sent' ? 'blue' : s === 'Void' ? 'gray' : 'orange') as 'green' | 'blue' | 'gray' | 'orange'

export function invoiceTotals(inv: Invoice) {
  const subtotal = inv.items.reduce((a, i) => a + i.quantity * i.unitPrice, 0)
  const discount = subtotal * (inv.discountPercent / 100)
  const taxable = subtotal - discount
  const tax = taxable * (inv.taxPercent / 100)
  return { subtotal, discount, tax, total: taxable + tax }
}

export default function Invoices() {
  const { id } = useParams()
  if (id) return <InvoiceEditor id={id} />
  return <InvoiceList />
}

function InvoiceList() {
  const { state, dispatch, clientById } = useStore()
  const navigate = useNavigate()
  const { settings } = state
  const list = [...state.invoices].sort((a, b) => b.issueDate.localeCompare(a.issueDate) || b.number.localeCompare(a.number))
  const outstanding = list.filter((i) => i.status === 'Sent').reduce((a, i) => a + invoiceTotals(i).total, 0)
  const paid = list.filter((i) => i.status === 'Paid').reduce((a, i) => a + invoiceTotals(i).total, 0)

  const create = () => {
    const n = state.invoices.length + 1
    const today = toDateKey(new Date())
    const inv: Invoice = {
      id: uid(), clientId: state.clients[0]?.id ?? null, number: `INV-${String(n).padStart(4, '0')}`, issueDate: today,
      dueDate: toDateKey(addDays(new Date(), 14)), status: 'Draft', currency: settings.currency, taxPercent: 0, discountPercent: 0, note: '', items: [],
    }
    dispatch({ type: 'col/add', col: 'invoices', row: inv })
    navigate(`/invoices/${inv.id}`)
  }

  return (
    <div>
      <PageHeader title="Invoices">
        <Button onClick={create}><Plus size={16} /> Create invoice</Button>
      </PageHeader>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Tile label="Outstanding (sent)" value={formatMoney(outstanding, settings.currency)} />
        <Tile label="Paid" value={formatMoney(paid, settings.currency)} />
        <Tile label="Invoices" value={String(list.length)} />
      </div>
      <div className="ck-card overflow-x-auto">
        {list.length === 0 ? (
          <EmptyState title="No invoices yet" hint="Create an invoice, pull in unbilled billable time and expenses for a client, and print or save it as PDF." action={<Button onClick={create}>Create invoice</Button>} />
        ) : (
          <table className="ck-table w-full min-w-[720px]">
            <thead><tr><th>Number</th><th>Client</th><th>Issued</th><th>Due</th><th>Status</th><th className="text-right">Total</th><th className="w-12" /></tr></thead>
            <tbody>
              {list.map((inv) => (
                <tr key={inv.id} className="cursor-pointer hover:bg-ck-bg/40" onClick={() => navigate(`/invoices/${inv.id}`)}>
                  <td className="font-medium">{inv.number}</td>
                  <td>{clientById(inv.clientId)?.name ?? <span className="text-ck-muted">No client</span>}</td>
                  <td className="whitespace-nowrap">{format(new Date(inv.issueDate), 'MMM d, yyyy')}</td>
                  <td className={cn('whitespace-nowrap', inv.status === 'Sent' && inv.dueDate < toDateKey(new Date()) && 'text-ck-red')}>{format(new Date(inv.dueDate), 'MMM d, yyyy')}</td>
                  <td><Badge tone={tone(inv.status)}>{inv.status}</Badge></td>
                  <td className="text-right font-mono">{formatMoney(invoiceTotals(inv).total, inv.currency)}</td>
                  <td className="text-center" onClick={(e) => e.stopPropagation()}>
                    <button type="button" className="text-ck-muted hover:text-ck-red" title="Delete" onClick={() => confirm(`Delete invoice ${inv.number}? Its time entries and expenses become unbilled again.`) && dispatch({ type: 'col/delete', col: 'invoices', id: inv.id })}><Trash2 size={15} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="ck-card px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-ck-muted">{label}</div>
      <div className="mt-1 font-mono text-xl">{value}</div>
    </div>
  )
}

function InvoiceEditor({ id }: { id: string }) {
  const { state, dispatch, clientById, projectById, rateFor } = useStore()
  const navigate = useNavigate()
  const inv = state.invoices.find((i) => i.id === id)
  const [picker, setPicker] = useState<'time' | 'expense' | null>(null)
  const [rangeFrom, setRangeFrom] = useState(() => toDateKey(addDays(new Date(), -30)))
  const [rangeTo, setRangeTo] = useState(() => toDateKey(new Date()))

  if (!inv) {
    return (
      <div className="ck-card p-10 text-center">
        <div className="text-[#666]">Invoice not found.</div>
        <Link to="/invoices" className="mt-2 inline-block text-ck-blue hover:underline">Back to invoices</Link>
      </div>
    )
  }

  const update = (patch: Partial<Invoice>) => dispatch({ type: 'col/update', col: 'invoices', id: inv.id, patch })
  const setItems = (items: InvoiceItem[]) => update({ items })
  const locked = inv.status !== 'Draft'
  const client = clientById(inv.clientId)
  const totals = invoiceTotals(inv)
  const { roundingMinutes, roundingMode } = state.settings

  // unbilled billable work for this client (any project of the client, or projects without client when the invoice has none)
  const clientProjectIds = new Set(state.projects.filter((p) => (inv.clientId ? p.clientId === inv.clientId : !p.clientId)).map((p) => p.id))
  const unbilledEntries = state.entries.filter((e) => e.end && e.billable && !e.invoiceId && e.projectId && clientProjectIds.has(e.projectId) && e.start.slice(0, 10) >= rangeFrom && e.start.slice(0, 10) <= rangeTo)
  const unbilledExpenses = state.expenses.filter((x) => x.billable && !x.invoiceId && x.projectId && clientProjectIds.has(x.projectId) && x.date >= rangeFrom && x.date <= rangeTo)

  const addTime = () => {
    const groups = new Map<string, { desc: string; secs: number; rate: number; ids: string[] }>()
    for (const e of unbilledEntries) {
      const rate = rateFor(e)
      const key = `${e.projectId}|${rate}`
      const g = groups.get(key) ?? { desc: `${projectById(e.projectId)?.name ?? 'Project'} – time`, secs: 0, rate, ids: [] }
      g.secs += roundSeconds(entrySeconds(e), roundingMinutes, roundingMode)
      g.ids.push(e.id)
      groups.set(key, g)
    }
    const items: InvoiceItem[] = [...groups.values()].map((g) => ({ id: uid(), description: g.desc, quantity: Math.round((g.secs / 3600) * 100) / 100, unitPrice: g.rate, kind: 'time', refIds: g.ids }))
    if (!items.length) return alert('No unbilled billable time for this client in the selected period.')
    setItems([...inv.items, ...items])
    dispatch({ type: 'entry/updateMany', ids: unbilledEntries.map((e) => e.id), patch: { invoiceId: inv.id } })
    setPicker(null)
  }

  const addExpenses = () => {
    if (!unbilledExpenses.length) return alert('No unbilled billable expenses for this client in the selected period.')
    const items: InvoiceItem[] = unbilledExpenses.map((x) => ({ id: uid(), description: `${x.category}${x.note ? ` – ${x.note}` : ''} (${x.date})`, quantity: 1, unitPrice: x.amount, kind: 'expense', refIds: [x.id] }))
    setItems([...inv.items, ...items])
    dispatch({ type: 'expense/updateMany', ids: unbilledExpenses.map((x) => x.id), patch: { invoiceId: inv.id } })
    setPicker(null)
  }

  const removeItem = (item: InvoiceItem) => {
    setItems(inv.items.filter((i) => i.id !== item.id))
    if (item.refIds?.length) {
      if (item.kind === 'time') dispatch({ type: 'entry/updateMany', ids: item.refIds, patch: { invoiceId: null } })
      if (item.kind === 'expense') dispatch({ type: 'expense/updateMany', ids: item.refIds, patch: { invoiceId: null } })
    }
  }

  const patchItem = (itemId: string, patch: Partial<InvoiceItem>) => setItems(inv.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)))

  const remove = () => {
    if (!confirm(`Delete invoice ${inv.number}? Its time entries and expenses become unbilled again.`)) return
    dispatch({ type: 'col/delete', col: 'invoices', id: inv.id })
    navigate('/invoices')
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <Link to="/invoices" className="inline-flex items-center gap-1 text-sm text-ck-muted hover:text-ck-text"><ArrowLeft size={14} /> Invoices</Link>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select className="ck-select" value={inv.status} onChange={(e) => update({ status: e.target.value as InvoiceStatus })}>
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <Button variant="outline" onClick={() => window.print()}><Printer size={15} /> Print / PDF</Button>
          <Button variant="ghost" className="text-ck-red" onClick={remove}><Trash2 size={15} /> Delete</Button>
        </div>
      </div>

      <div className="ck-card p-6 print:border-0 print:shadow-none">
        {/* header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2"><img src="/favicon.svg" alt="" className="h-8 w-8" /><span className="text-xl font-medium">{state.settings.workspaceName}</span></div>
            <div className="mt-4 text-xs font-medium uppercase tracking-wide text-ck-muted">Bill to</div>
            {locked ? <div className="text-base">{client?.name ?? 'No client'}</div> : (
              <select className="ck-select mt-1" value={inv.clientId ?? ''} onChange={(e) => update({ clientId: e.target.value || null })}>
                <option value="">No client</option>
                {state.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
          </div>
          <div className="text-right">
            <div className="text-2xl font-light uppercase tracking-wide text-[#666]">Invoice</div>
            <div className="mt-2 grid grid-cols-[auto_auto] items-center justify-end gap-x-3 gap-y-1 text-sm">
              <span className="text-ck-muted">Number</span>
              <input disabled={locked} className="ck-input h-8 w-32 text-right disabled:border-transparent disabled:bg-transparent" value={inv.number} onChange={(e) => update({ number: e.target.value })} />
              <span className="text-ck-muted">Issued</span>
              <input disabled={locked} type="date" className="ck-input h-8 w-40 disabled:border-transparent disabled:bg-transparent" value={inv.issueDate} onChange={(e) => update({ issueDate: e.target.value })} />
              <span className="text-ck-muted">Due</span>
              <input disabled={locked} type="date" className="ck-input h-8 w-40 disabled:border-transparent disabled:bg-transparent" value={inv.dueDate} onChange={(e) => update({ dueDate: e.target.value })} />
              <span className="text-ck-muted">Status</span>
              <span className="text-right"><Badge tone={tone(inv.status)}>{inv.status}</Badge></span>
            </div>
          </div>
        </div>

        {/* items */}
        <table className="ck-table mt-6 w-full">
          <thead><tr><th>Description</th><th className="w-28 text-right">Qty / hours</th><th className="w-32 text-right">Unit price</th><th className="w-32 text-right">Amount</th>{!locked && <th className="w-10 print:hidden" />}</tr></thead>
          <tbody>
            {inv.items.map((it) => (
              <tr key={it.id}>
                <td>
                  <input disabled={locked} className="w-full rounded-sm border border-transparent bg-transparent px-1 outline-none hover:border-ck-border focus:border-ck-blue disabled:hover:border-transparent" value={it.description} onChange={(e) => patchItem(it.id, { description: e.target.value })} />
                  {it.kind !== 'custom' && <span className="ml-1 text-[10px] uppercase text-ck-muted">{it.kind}{it.refIds?.length ? ` · ${it.refIds.length} item${it.refIds.length > 1 ? 's' : ''}` : ''}</span>}
                </td>
                <td><input disabled={locked} type="number" step="0.01" min={0} className="w-full rounded-sm border border-transparent bg-transparent px-1 text-right font-mono outline-none hover:border-ck-border focus:border-ck-blue disabled:hover:border-transparent" value={it.quantity} onChange={(e) => patchItem(it.id, { quantity: Number(e.target.value) || 0 })} /></td>
                <td><input disabled={locked} type="number" step="0.01" min={0} className="w-full rounded-sm border border-transparent bg-transparent px-1 text-right font-mono outline-none hover:border-ck-border focus:border-ck-blue disabled:hover:border-transparent" value={it.unitPrice} onChange={(e) => patchItem(it.id, { unitPrice: Number(e.target.value) || 0 })} /></td>
                <td className="text-right font-mono">{formatMoney(it.quantity * it.unitPrice, inv.currency)}</td>
                {!locked && <td className="text-center print:hidden"><button type="button" className="text-ck-muted hover:text-ck-red" onClick={() => removeItem(it)}><Trash2 size={14} /></button></td>}
              </tr>
            ))}
            {inv.items.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-ck-muted">No line items yet. Add unbilled time, expenses, or a custom line.</td></tr>}
          </tbody>
        </table>

        {!locked && (
          <div className="mt-3 flex flex-wrap gap-2 print:hidden">
            <Button size="sm" variant="outline" onClick={() => setPicker('time')}><Clock size={14} /> Add unbilled time</Button>
            <Button size="sm" variant="outline" onClick={() => setPicker('expense')}><Receipt size={14} /> Add unbilled expenses</Button>
            <Button size="sm" variant="ghost" onClick={() => setItems([...inv.items, { id: uid(), description: 'Custom item', quantity: 1, unitPrice: 0, kind: 'custom' }])}><Plus size={14} /> Custom line</Button>
          </div>
        )}

        {/* totals */}
        <div className="mt-6 flex flex-wrap justify-between gap-6">
          <div className="min-w-[240px] flex-1">
            <label className="ck-label">Note / payment terms</label>
            <textarea disabled={locked} className="ck-input h-24 py-2 disabled:border-transparent disabled:bg-transparent disabled:px-0" placeholder="Thank you for your business. Payment due within 14 days." value={inv.note} onChange={(e) => update({ note: e.target.value })} />
          </div>
          <div className="w-72 space-y-1 text-sm">
            <Row label="Subtotal" value={formatMoney(totals.subtotal, inv.currency)} />
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1 text-[#666]">Discount <input disabled={locked} type="number" min={0} max={100} className="ck-input h-7 w-16 text-right disabled:border-transparent disabled:bg-transparent" value={inv.discountPercent} onChange={(e) => update({ discountPercent: Number(e.target.value) || 0 })} />%</span>
              <span className="font-mono">−{formatMoney(totals.discount, inv.currency)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1 text-[#666]">Tax <input disabled={locked} type="number" min={0} max={100} className="ck-input h-7 w-16 text-right disabled:border-transparent disabled:bg-transparent" value={inv.taxPercent} onChange={(e) => update({ taxPercent: Number(e.target.value) || 0 })} />%</span>
              <span className="font-mono">{formatMoney(totals.tax, inv.currency)}</span>
            </div>
            <div className="flex justify-between border-t border-ck-border-light pt-2 text-base font-medium"><span>Total</span><span className="font-mono">{formatMoney(totals.total, inv.currency)}</span></div>
          </div>
        </div>
      </div>

      {picker && (
        <Modal open onClose={() => setPicker(null)} title={picker === 'time' ? 'Add unbilled time' : 'Add unbilled expenses'} footer={<><Button variant="ghost" onClick={() => setPicker(null)}>Cancel</Button><Button onClick={picker === 'time' ? addTime : addExpenses}>Add to invoice</Button></>}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="ck-label">From</label><input type="date" className="ck-input" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} /></div>
              <div><label className="ck-label">To</label><input type="date" className="ck-input" value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} /></div>
            </div>
            <PickerSummary picker={picker} entries={unbilledEntries.length} expenses={unbilledExpenses.length} hours={unbilledEntries.reduce((a, e) => a + roundSeconds(entrySeconds(e), roundingMinutes, roundingMode), 0) / 3600} amount={picker === 'time' ? unbilledEntries.reduce((a, e) => a + (roundSeconds(entrySeconds(e), roundingMinutes, roundingMode) / 3600) * rateFor(e), 0) : unbilledExpenses.reduce((a, x) => a + x.amount, 0)} currency={inv.currency} client={client?.name ?? 'projects without a client'} rounding={roundingMinutes} />
          </div>
        </Modal>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between"><span className="text-[#666]">{label}</span><span className="font-mono">{value}</span></div>
}

function PickerSummary({ picker, entries, expenses, hours, amount, currency, client, rounding }: { picker: 'time' | 'expense'; entries: number; expenses: number; hours: number; amount: number; currency: string; client: string; rounding: number }) {
  return useMemo(() => (
    <div className="rounded-sm bg-ck-bg p-3 text-sm">
      {picker === 'time' ? (
        <>Found <b>{entries}</b> unbilled billable time entr{entries === 1 ? 'y' : 'ies'} for <b>{client}</b> totalling <b>{hours.toFixed(2)} h</b> = <b>{formatMoney(amount, currency)}</b>.{rounding > 0 && <span className="text-ck-muted"> Durations rounded to {rounding} minutes.</span>} Lines are grouped by project and rate.</>
      ) : (
        <>Found <b>{expenses}</b> unbilled billable expense{expenses === 1 ? '' : 's'} for <b>{client}</b> totalling <b>{formatMoney(amount, currency)}</b>.</>
      )}
    </div>
  ), [picker, entries, expenses, hours, amount, currency, client, rounding])
}
