export interface Client {
  id: string
  name: string
  archived: boolean
}

export interface Task {
  id: string
  name: string
  done: boolean
  hourlyRate: number | null
}

export interface Project {
  id: string
  name: string
  clientId: string | null
  color: string
  billable: boolean
  archived: boolean
  hourlyRate: number | null
  estimateHours: number | null
  budget: number | null
  isTemplate: boolean
  favorite: boolean
  note: string
  tasks: Task[]
}

export interface Tag {
  id: string
  name: string
  archived: boolean
}

export interface TimeEntry {
  id: string
  description: string
  projectId: string | null
  taskId: string | null
  tagIds: string[]
  billable: boolean
  /** ISO string */
  start: string
  /** ISO string, null while the timer is running */
  end: string | null
  userId: string
  invoiceId: string | null
}

export type Role = 'Owner' | 'Admin' | 'Manager' | 'Member'

export interface Member {
  id: string
  name: string
  email: string
  role: Role
  status: 'Active' | 'Pending'
  hourlyRate: number | null
  /** internal labor cost per hour */
  costRate: number | null
  /** working hours per day, used for time off and scheduling capacity */
  workingHours: number
}

export type DurationFormat = 'full' | 'compact' | 'decimal'
export type TimeFormat = '12' | '24'
export type RoundingMode = 'nearest' | 'up' | 'down'

export interface Settings {
  workspaceName: string
  currency: string
  hourlyRate: number
  weekStart: 0 | 1
  timeFormat: TimeFormat
  durationFormat: DurationFormat
  billableByDefault: boolean
  roundingMinutes: number
  roundingMode: RoundingMode
  /** entries starting before this date (yyyy-MM-dd) cannot be edited */
  lockBefore: string | null
  requireProject: boolean
  requireDescription: boolean
  requireTags: boolean
  dailyTargetHours: number | null
  weeklyTargetHours: number | null
  budgetAlertPercent: number
}

export interface Expense {
  id: string
  projectId: string | null
  memberId: string | null
  /** yyyy-MM-dd */
  date: string
  category: string
  amount: number
  note: string
  billable: boolean
  invoiceId: string | null
}

export type InvoiceStatus = 'Draft' | 'Sent' | 'Paid' | 'Void'

export interface InvoiceItem {
  id: string
  description: string
  quantity: number
  unitPrice: number
  kind: 'time' | 'expense' | 'custom'
  /** ids of the time entries or expenses this line was generated from */
  refIds?: string[]
}

export interface Invoice {
  id: string
  clientId: string | null
  number: string
  issueDate: string
  dueDate: string
  status: InvoiceStatus
  currency: string
  taxPercent: number
  discountPercent: number
  note: string
  items: InvoiceItem[]
}

export interface TimeOffPolicy {
  id: string
  name: string
  color: string
  daysPerYear: number | null
}

export type RequestStatus = 'Pending' | 'Approved' | 'Rejected'

export interface TimeOffRequest {
  id: string
  memberId: string
  policyId: string
  startDate: string
  endDate: string
  note: string
  status: RequestStatus
}

export interface Approval {
  id: string
  memberId: string
  /** yyyy-MM-dd of the week's first day */
  weekStart: string
  status: RequestStatus
  note: string
  submittedAt: string
  decidedAt: string | null
}

export interface Schedule {
  id: string
  memberId: string
  projectId: string | null
  startDate: string
  endDate: string
  hoursPerDay: number
  note: string
}

export interface AppState {
  version: number
  clients: Client[]
  projects: Project[]
  tags: Tag[]
  entries: TimeEntry[]
  members: Member[]
  settings: Settings
  currentUserId: string
  expenses: Expense[]
  invoices: Invoice[]
  timeOffPolicies: TimeOffPolicy[]
  timeOffRequests: TimeOffRequest[]
  approvals: Approval[]
  schedules: Schedule[]
}

/** Collections handled by the generic add/update/delete actions. */
export type CollectionName = 'expenses' | 'invoices' | 'timeOffPolicies' | 'timeOffRequests' | 'approvals' | 'schedules'

export interface EntryDraft {
  description: string
  projectId: string | null
  taskId: string | null
  tagIds: string[]
  billable: boolean
}

export const EXPENSE_CATEGORIES = ['Travel', 'Meals', 'Software', 'Hardware', 'Office', 'Marketing', 'Other']

export const PROJECT_COLORS = [
  '#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3',
  '#03a9f4', '#00bcd4', '#009688', '#4caf50', '#8bc34a', '#cddc39',
  '#ffc107', '#ff9800', '#ff5722', '#795548', '#607d8b', '#9e9e9e',
]

export const DEFAULT_SETTINGS: Omit<Settings, 'workspaceName'> = {
  currency: 'USD',
  hourlyRate: 0,
  weekStart: 1,
  timeFormat: '24',
  durationFormat: 'full',
  billableByDefault: false,
  roundingMinutes: 0,
  roundingMode: 'nearest',
  lockBefore: null,
  requireProject: false,
  requireDescription: false,
  requireTags: false,
  dailyTargetHours: null,
  weeklyTargetHours: null,
  budgetAlertPercent: 80,
}
