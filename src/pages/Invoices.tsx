import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { addDays, format } from 'date-fns'
import { ArrowLeft, Clock, FileText, FileX, Lock, Plus, Printer, Receipt, Trash2 } from 'lucide-react'
import { useStore, uid } from '../store'
import { Badge, Button, EmptyState, Field, IconButton, Modal, PageHeader, cn } from '../components/ui'
import { useFeedback } from '../components/feedback'
import { entrySeconds, formatMoney, roundSeconds, toDateKey } from '../lib/time'
import type { Invoice, InvoiceItem, InvoiceStatus } from '../types'

const STATUSES: InvoiceStatus[] = ['Draft', 'Sent', 'Paid', 'Void']
const tone = (s: InvoiceStatus) => (s === 'Paid' ? 'green' : s === 'Sent' ? 'blue' : s === 'Void' ? 'gray' : 'orange') as 'green' | 'blue' | 'gray' | 'orange'
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const cellInput = 'w-full rounded-sm border border-transparent bg-transparent px-1 outline-none hover:border-ck-border focus:border-ck-blue disabled:hover:border-transparent'

export function invoiceTotals(inv: Invoice) {
  const subtotal = inv.items.reduce((a, i) => a + i.quantity * i.unitPrice, 0)
  const discount = subtotal * (inv.discountPercent / 100)
  const taxable = subtotal - discount
  const tax = taxable * (inv.taxPercent / 100)
  return { subtotal, discount, tax, total: taxable + tax }
}

export default function Invoices() {
  const { id } = useParams()
  const { can } = useStore()
  if (!can.manage) return <ManagersOnly />
  if (id) return <InvoiceEditor id={id} />
  return <InvoiceList />
}

function ManagersOnly() {
  return (
    <div>
      <PageHeader title="Invoices" />
      <div className="ck-card">
        <EmptyState icon={<Lock size={40} />} title="Invoices are managed by managers" hint="Only workspace managers and admins can create and send invoices. Your billable time and expenses are included on them." />
      </div>
    </div>
  )
}

/** Confirms, deletes the invoice and unlinks its entries/expenses; resolves true when deleted. */
function useDeleteInvoice() {
  const { state, dispatch } = useStore()
  const { confirm, notify } = useFeedback()
  return async (inv: Invoice) => {
    const entries = state.entries.filter((e) => e.invoiceId === inv.id).length
    const expenses = state.expenses.filter((x) => x.invoiceId === inv.id).length
    const linked = [entries && plural(entries, 'time entry', 'time entries'), expenses && plural(expenses, 'expense', 'expenses')].filter(Boolean).join(' and ')
    const ok = await confirm({
      title: `Delete invoice ${inv.number}?`,
      message: linked ? `Its ${linked} will be marked unbilled again, so they can go on another invoice. This can't be undone.` : "This can't be undone.",
      confirmLabel: 'Delete invoice', danger: true,
    })
    if (!ok) return false
    dispatch({ type: 'col/delete', col: 'invoices', id: inv.id })
    notify(`Invoice ${inv.number} deleted`)
    return true
  }
}

function InvoiceList() {
  const { state, dispatch, clientById } = useStore()
  const { notify } = useFeedback()
  const deleteInvoice = useDeleteInvoice()
  const navigate = useNavigate()
  const { settings } = state
  const todayKey = toDateKey(new Date())
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
    notify(`Draft invoice ${inv.number} created`)
    navigate(`/invoices/${inv.id}`)
  }

  return (
    <div>
      <PageHeader title="Invoices">
        <Button onClick={create}><Plus size={16} aria-hidden="true" /> Create invoice</Button>
      </PageHeader>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Tile label="Outstanding (sent)" value={formatMoney(outstanding, settings.currency)} />
        <Tile label="Paid" value={formatMoney(paid, settings.currency)} />
        <Tile label="Invoices" value={String(list.length)} />
      </div>
      <div className="ck-card overflow-x-auto">
        {list.length === 0 ? (
          <EmptyState icon={<FileText size={40} />} title="No invoices yet" hint="Create an invoice, pull in a client's unbilled time and expenses, then print or save it as PDF." action={<Button onClick={create}>Create invoice</Button>} />
        ) : (
          <table className="ck-table w-full min-w-[720px]">
            <thead><tr><th>Number</th><th>Client</th><th>Issued</th><th>Due</th><th>Status</th><th className="text-right">Total</th><th className="w-12"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {list.map((inv) => {
                const overdue = inv.status === 'Sent' && inv.dueDate < todayKey
                return (
                  <tr key={inv.id} className="cursor-pointer hover:bg-ck-bg/40" onClick={() => navigate(`/invoices/${inv.id}`)}>
                    <td className="font-medium"><Link to={`/invoices/${inv.id}`} className="rounded-sm hover:underline" onClick={(e) => e.stopPropagation()}>{inv.number}</Link></td>
                    <td>{clientById(inv.clientId)?.name ?? <span className="text-ck-muted">No client</span>}</td>
                    <td className="whitespace-nowrap">{format(new Date(inv.issueDate), 'MMM d, yyyy')}</td>
                    <td className={cn('whitespace-nowrap', overdue && 'text-ck-red')}>{format(new Date(inv.dueDate), 'MMM d, yyyy')}{overdue && <span className="ml-1 text-xs font-medium">· Overdue</span>}</td>
                    <td><Badge tone={tone(inv.status)}>{inv.status}</Badge></td>
                    <td className="text-right font-mono">{formatMoney(invoiceTotals(inv).total, inv.currency)}</td>
                    <td className="py-1 text-center" onClick={(e) => e.stopPropagation()}>
                      <IconButton title={`Delete invoice ${inv.number}`} className="hover:bg-red-50 hover:text-ck-red" onClick={() => deleteInvoice(inv)}><Trash2 size={15} aria-hidden="true" /></IconButton>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="ck-card min-w-0 px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-ck-muted">{label}</div>
      <div className="mt-1 break-words font-mono text-xl">{value}</div>
    </div>
  )
}

function InvoiceEditor({ id }: { id: string }) {
  const { state, dispatch, clientById, projectById, rateFor } = useStore()
  const { notify } = useFeedback()
  const deleteInvoice = useDeleteInvoice()
  const navigate = useNavigate()
  const inv = state.invoices.find((i) => i.id === id)
  const [picker, setPicker] = useState<'time' | 'expense' | null>(null)
  const [rangeFrom, setRangeFrom] = useState(() => toDateKey(addDays(new Date(), -30)))
  const [rangeTo, setRangeTo] = useState(() => toDateKey(new Date()))

  if (!inv) {
    return (
      <div className="ck-card">
        <EmptyState icon={<FileX size={40} />} title="Invoice not found" hint="It may have been deleted." action={<Button variant="outline" onClick={() => navigate('/invoices')}>Back to invoices</Button>} />
      </div>
    )
  }

  const update = (patch: Partial<Invoice>) => dispatch({ type: 'col/update', col: 'invoices', id: inv.id, patch })
  const setItems = (items: InvoiceItem[]) => update({ items })
  const locked = inv.status !== 'Draft'
  const client = clientById(inv.clientId)
  const totals = invoiceTotals(inv)
  const { roundingMinutes, roundingMode } = state.settings
  const rangeError = rangeFrom && rangeTo && rangeFrom > rangeTo ? 'The end date must be on or after the start date' : null

  // unbilled billable work for this client (any project of the client, or projects without client when the invoice has none)
  const clientProjectIds = new Set(state.projects.filter((p) => (inv.clientId ? p.clientId === inv.clientId : !p.clientId)).map((p) => p.id))
  const unbilledEntries = state.entries.filter((e) => e.end && e.billable && !e.invoiceId && e.projectId && clientProjectIds.has(e.projectId) && e.start.slice(0, 10) >= rangeFrom && e.start.slice(0, 10) <= rangeTo)
  const unbilledExpenses = state.expenses.filter((x) => x.billable && !x.invoiceId && x.projectId && clientProjectIds.has(x.projectId) && x.date >= rangeFrom && x.date <= rangeTo)
  const pickerCount = picker === 'time' ? unbilledEntries.length : unbilledExpenses.length

  const setStatus = (status: InvoiceStatus) => {
    update({ status })
    notify(status === 'Draft' ? `${inv.number} is a draft again and can be edited` : status === 'Void' ? `${inv.number} voided` : `${inv.number} marked as ${status.toLowerCase()}`)
  }

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
    if (!items.length) return notify('No unbilled billable time for this client in the selected period', { tone: 'info' })
    setItems([...inv.items, ...items])
    dispatch({ type: 'entry/updateMany', ids: unbilledEntries.map((e) => e.id), patch: { invoiceId: inv.id } })
    notify(`Added ${plural(items.length, 'line', 'lines')} from ${plural(unbilledEntries.length, 'time entry', 'time entries')}`)
    setPicker(null)
  }

  const addExpenses = () => {
    if (!unbilledExpenses.length) return notify('No unbilled billable expenses for this client in the selected period', { tone: 'info' })
    const items: InvoiceItem[] = unbilledExpenses.map((x) => ({ id: uid(), description: `${x.category}${x.note ? ` – ${x.note}` : ''} (${x.date})`, quantity: 1, unitPrice: x.amount, kind: 'expense', refIds: [x.id] }))
    setItems([...inv.items, ...items])
    dispatch({ type: 'expense/updateMany', ids: unbilledExpenses.map((x) => x.id), patch: { invoiceId: inv.id } })
    notify(`Added ${plural(items.length, 'expense line', 'expense lines')}`)
    setPicker(null)
  }

  const removeItem = (item: InvoiceItem) => {
    setItems(inv.items.filter((i) => i.id !== item.id))
    if (item.refIds?.length) {
      if (item.kind === 'time') dispatch({ type: 'entry/updateMany', ids: item.refIds, patch: { invoiceId: null } })
      if (item.kind === 'expense') dispatch({ type: 'expense/updateMany', ids: item.refIds, patch: { invoiceId: null } })
      notify(`Line removed; ${item.kind === 'time' ? plural(item.refIds.length, 'time entry is', 'time entries are') : plural(item.refIds.length, 'expense is', 'expenses are')} unbilled again`)
    }
  }

  const patchItem = (itemId: string, patch: Partial<InvoiceItem>) => setItems(inv.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)))

  const remove = async () => {
    if (await deleteInvoice(inv)) navigate('/invoices')
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <Link to="/invoices" className="inline-flex items-center gap-1 text-sm text-ck-muted hover:text-ck-text"><ArrowLeft size={14} aria-hidden="true" /> Invoices</Link>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select className="ck-select" aria-label="Invoice status" value={inv.status} onChange={(e) => setStatus(e.target.value as InvoiceStatus)}>
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <Button variant="outline" onClick={() => window.print()}><Printer size={15} aria-hidden="true" /> Print / PDF</Button>
          <span className="mx-1 hidden h-6 w-px bg-ck-border-light sm:block" aria-hidden="true" />
          <Button variant="ghost" className="text-ck-red hover:bg-red-50" onClick={remove}><Trash2 size={15} aria-hidden="true" /> Delete</Button>
        </div>
      </div>

      {locked && (
        <p className="flex items-center gap-2 rounded-sm bg-ck-blue-light px-3 py-2 text-sm text-ck-blue-dark print:hidden">
          <Lock size={14} className="shrink-0" aria-hidden="true" /> This invoice is {inv.status.toLowerCase()}, so it can't be edited. Set the status back to Draft to make changes.
        </p>
      )}

      <div className="ck-card p-4 sm:p-6 print:border-0 print:p-0 print:shadow-none">
        {/* header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2"><img src="/favicon.svg" alt="" className="h-8 w-8" /><span className="text-xl font-medium">{state.settings.workspaceName}</span></div>
            <div className="mt-4 text-xs font-medium uppercase tracking-wide text-ck-muted" id="inv-bill-to">Bill to</div>
            {locked ? <div className="text-base">{client?.name ?? 'No client'}</div> : (
              <select className="ck-select mt-1" aria-labelledby="inv-bill-to" value={inv.clientId ?? ''} onChange={(e) => update({ clientId: e.target.value || null })}>
                <option value="">No client</option>
                {state.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
          </div>
          <div className="sm:text-right">
            <div className="text-2xl font-light uppercase tracking-wide text-[#666]">Invoice</div>
            <div className="mt-2 grid grid-cols-[auto_auto] items-center gap-x-3 gap-y-1 text-sm sm:justify-end">
              <label htmlFor="inv-number" className="text-ck-muted">Number</label>
              <input id="inv-number" disabled={locked} className="ck-input h-8 w-32 text-right disabled:border-transparent disabled:bg-transparent" value={inv.number} onChange={(e) => update({ number: e.target.value })} />
              <label htmlFor="inv-issued" className="text-ck-muted">Issued</label>
              <input id="inv-issued" disabled={locked} type="date" className="ck-input h-8 w-40 disabled:border-transparent disabled:bg-transparent" value={inv.issueDate} onChange={(e) => update({ issueDate: e.target.value })} />
              <label htmlFor="inv-due" className="text-ck-muted">Due</label>
              <input id="inv-due" disabled={locked} type="date" className="ck-input h-8 w-40 disabled:border-transparent disabled:bg-transparent" value={inv.dueDate} onChange={(e) => update({ dueDate: e.target.value })} />
              <span className="text-ck-muted">Status</span>
              <span className="text-right"><Badge tone={tone(inv.status)}>{inv.status}</Badge></span>
            </div>
          </div>
        </div>

        {/* items */}
        <div className="mt-6 overflow-x-auto print:overflow-visible">
          <table className="ck-table w-full min-w-[520px] print:min-w-0">
            <thead><tr><th>Description</th><th className="w-28 text-right">Qty / hours</th><th className="w-32 text-right">Unit price</th><th className="w-32 text-right">Amount</th>{!locked && <th className="w-12 print:hidden"><span className="sr-only">Actions</span></th>}</tr></thead>
            <tbody>
              {inv.items.map((it, idx) => (
                <tr key={it.id}>
                  <td>
                    <input disabled={locked} aria-label={`Description, line ${idx + 1}`} className={cellInput} value={it.description} onChange={(e) => patchItem(it.id, { description: e.target.value })} />
                    {it.kind !== 'custom' && <span className="ml-1 text-[10px] uppercase text-ck-muted">{it.kind}{it.refIds?.length ? ` · ${plural(it.refIds.length, 'item', 'items')}` : ''}</span>}
                  </td>
                  <td><input disabled={locked} aria-label={`Quantity, line ${idx + 1}`} type="number" inputMode="decimal" step="0.01" min={0} className={cn(cellInput, 'text-right font-mono')} value={it.quantity} onChange={(e) => patchItem(it.id, { quantity: Number(e.target.value) || 0 })} /></td>
                  <td><input disabled={locked} aria-label={`Unit price, line ${idx + 1}`} type="number" inputMode="decimal" step="0.01" min={0} className={cn(cellInput, 'text-right font-mono')} value={it.unitPrice} onChange={(e) => patchItem(it.id, { unitPrice: Number(e.target.value) || 0 })} /></td>
                  <td className="text-right font-mono">{formatMoney(it.quantity * it.unitPrice, inv.currency)}</td>
                  {!locked && <td className="py-1 text-center print:hidden"><IconButton title={`Remove line ${idx + 1}`} className="hover:bg-red-50 hover:text-ck-red" onClick={() => removeItem(it)}><Trash2 size={14} aria-hidden="true" /></IconButton></td>}
                </tr>
              ))}
              {inv.items.length === 0 && <tr className="print:hidden"><td colSpan={5} className="py-8 text-center text-ck-muted">{locked ? 'This invoice has no line items.' : 'No line items yet. Add unbilled time, expenses, or a custom line.'}</td></tr>}
            </tbody>
          </table>
        </div>

        {!locked && (
          <div className="mt-3 flex flex-wrap gap-2 print:hidden">
            <Button size="sm" variant="outline" onClick={() => setPicker('time')}><Clock size={14} aria-hidden="true" /> Add unbilled time</Button>
            <Button size="sm" variant="outline" onClick={() => setPicker('expense')}><Receipt size={14} aria-hidden="true" /> Add unbilled expenses</Button>
            <Button size="sm" variant="ghost" onClick={() => setItems([...inv.items, { id: uid(), description: 'Custom item', quantity: 1, unitPrice: 0, kind: 'custom' }])}><Plus size={14} aria-hidden="true" /> Custom line</Button>
          </div>
        )}

        {/* totals */}
        <div className="mt-6 flex flex-wrap justify-between gap-6">
          <div className="min-w-[220px] flex-1">
            <label htmlFor="inv-note" className="ck-label">Note / payment terms</label>
            <textarea id="inv-note" disabled={locked} className="ck-input h-24 py-2 disabled:border-transparent disabled:bg-transparent disabled:px-0" placeholder="Thank you for your business. Payment due within 14 days." value={inv.note} onChange={(e) => update({ note: e.target.value })} />
          </div>
          <div className="w-full space-y-1 text-sm tabular-nums sm:w-72">
            <Row label="Subtotal" value={formatMoney(totals.subtotal, inv.currency)} />
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1 text-[#666]"><label htmlFor="inv-discount">Discount</label> <input id="inv-discount" disabled={locked} type="number" inputMode="decimal" min={0} max={100} className="ck-input h-7 w-16 text-right disabled:border-transparent disabled:bg-transparent" value={inv.discountPercent} onChange={(e) => update({ discountPercent: Number(e.target.value) || 0 })} />%</span>
              <span className="font-mono">−{formatMoney(totals.discount, inv.currency)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1 text-[#666]"><label htmlFor="inv-tax">Tax</label> <input id="inv-tax" disabled={locked} type="number" inputMode="decimal" min={0} max={100} className="ck-input h-7 w-16 text-right disabled:border-transparent disabled:bg-transparent" value={inv.taxPercent} onChange={(e) => update({ taxPercent: Number(e.target.value) || 0 })} />%</span>
              <span className="font-mono">{formatMoney(totals.tax, inv.currency)}</span>
            </div>
            <div className="flex justify-between border-t-2 border-ck-border pt-2 text-base font-medium"><span>Total</span><span className="font-mono">{formatMoney(totals.total, inv.currency)}</span></div>
          </div>
        </div>
      </div>

      {picker && (
        <Modal
          open
          onClose={() => setPicker(null)}
          title={picker === 'time' ? 'Add unbilled time' : 'Add unbilled expenses'}
          footer={<><Button variant="ghost" onClick={() => setPicker(null)}>Cancel</Button><Button onClick={picker === 'time' ? addTime : addExpenses} disabled={!pickerCount || !!rangeError}>Add to invoice</Button></>}
        >
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="From">{(p) => <input {...p} type="date" className="ck-input" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} />}</Field>
              <Field label="To" error={rangeError}>{(p) => <input {...p} type="date" className="ck-input" value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} />}</Field>
            </div>
            <PickerSummary picker={picker} entries={unbilledEntries.length} expenses={unbilledExpenses.length} hours={unbilledEntries.reduce((a, e) => a + roundSeconds(entrySeconds(e), roundingMinutes, roundingMode), 0) / 3600} amount={picker === 'time' ? unbilledEntries.reduce((a, e) => a + (roundSeconds(entrySeconds(e), roundingMinutes, roundingMode) / 3600) * rateFor(e), 0) : unbilledExpenses.reduce((a, x) => a + x.amount, 0)} currency={inv.currency} client={client?.name ?? 'projects without a client'} rounding={roundingMinutes} />
            {!pickerCount && !rangeError && <p className="text-xs text-[#666]">Try a wider date range, or check that the {picker === 'time' ? 'time entries are' : 'expenses are'} marked billable and belong to this client's projects.</p>}
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
    <div className="rounded-sm bg-ck-bg p-3 text-sm" aria-live="polite">
      {picker === 'time' ? (
        <>Found <b>{entries}</b> unbilled billable time entr{entries === 1 ? 'y' : 'ies'} for <b>{client}</b> totalling <b className="tabular-nums">{hours.toFixed(2)} h</b> = <b className="tabular-nums">{formatMoney(amount, currency)}</b>.{rounding > 0 && <span className="text-ck-muted"> Durations rounded to {rounding} minutes.</span>} Lines are grouped by project and rate.</>
      ) : (
        <>Found <b>{expenses}</b> unbilled billable expense{expenses === 1 ? '' : 's'} for <b>{client}</b> totalling <b className="tabular-nums">{formatMoney(amount, currency)}</b>.</>
      )}
    </div>
  ), [picker, entries, expenses, hours, amount, currency, client, rounding])
}
