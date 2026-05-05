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

export const GTD_STATUS_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  'inbox': { label: 'Inbox', color: 'bg-zinc-500', icon: 'Inbox' },
  'todo': { label: 'Todo', color: 'bg-blue-500', icon: 'CircleDot' },
  'in-progress': { label: 'In Progress', color: 'bg-amber-500', icon: 'LoaderCircle' },
  'waiting': { label: 'Waiting', color: 'bg-orange-500', icon: 'Clock' },
  'done': { label: 'Done', color: 'bg-emerald-500', icon: 'CircleCheck' },
  'archived': { label: 'Archived', color: 'bg-zinc-700', icon: 'Archive' },
}

export const GTD_STATUS_LIST = ['inbox', 'todo', 'in-progress', 'waiting', 'done', 'archived'] as const
