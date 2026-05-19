import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined })
}

export function relativeProjectName(name: string): string {
  return name.replace(/^~\//, '').replace(/^corey\//, '~/')
}

export const STATUS_CONFIG: Record<string, { label: string; dotColor: string }> = {
  'new': { label: 'New', dotColor: 'bg-blue-500' },
  'archived': { label: 'Archived', dotColor: 'bg-zinc-600' },
}

// ---- Date Grouping ----

export type DateGroup = 'today' | 'yesterday' | 'thisWeek' | 'earlier'

export const DATE_GROUP_LABELS: Record<DateGroup, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  thisWeek: 'This Week',
  earlier: 'Earlier',
}

export function getDateGroup(dateStr: string): DateGroup {
  const date = new Date(dateStr)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diffDays = Math.floor((today.getTime() - target.getTime()) / 86400000)

  if (diffDays === 0) return 'today'
  if (diffDays === 1) return 'yesterday'
  if (diffDays >= 2 && diffDays < 7) return 'thisWeek'
  return 'earlier'
}

export interface GroupHeader {
  kind: 'header'
  id: string
  group: DateGroup
}

export interface SessionRow {
  kind: 'session'
  id: string
  session: import('../../shared/types').SessionInfo
}

export type ListRow = GroupHeader | SessionRow

export function buildGroupedRows(sessions: import('../../shared/types').SessionInfo[]): ListRow[] {
  const groups: Record<DateGroup, import('../../shared/types').SessionInfo[]> = {
    today: [],
    yesterday: [],
    thisWeek: [],
    earlier: [],
  }

  for (const s of sessions) {
    groups[getDateGroup(s.modified)].push(s)
  }

  const rows: ListRow[] = []
  const order: DateGroup[] = ['today', 'yesterday', 'thisWeek', 'earlier']

  for (const group of order) {
    if (groups[group].length === 0) continue
    rows.push({ kind: 'header', id: `header-${group}`, group })
    groups[group].forEach(s => {
      rows.push({ kind: 'session', id: s.sessionId, session: s })
    })
  }

  return rows
}
