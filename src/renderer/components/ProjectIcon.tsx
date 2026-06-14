import {
  Archive, Bot, BookOpen, Boxes, Braces, Code2, Database, Folder, Globe2, Layers3,
  Settings2, TerminalSquare, type LucideIcon,
} from 'lucide-react'

export interface ProjectIconOption {
  id: string
  label: string
  icon: LucideIcon
}

export const PROJECT_ICON_OPTIONS: ProjectIconOption[] = [
  { id: 'folder', label: 'Folder', icon: Folder },
  { id: 'terminal', label: 'Terminal', icon: TerminalSquare },
  { id: 'code', label: 'Code', icon: Code2 },
  { id: 'braces', label: 'Config', icon: Braces },
  { id: 'database', label: 'Data', icon: Database },
  { id: 'package', label: 'Package', icon: Boxes },
  { id: 'book', label: 'Docs', icon: BookOpen },
  { id: 'web', label: 'Web', icon: Globe2 },
  { id: 'bot', label: 'AI', icon: Bot },
  { id: 'layers', label: 'Stack', icon: Layers3 },
  { id: 'settings', label: 'Tools', icon: Settings2 },
  { id: 'archive', label: 'Archive', icon: Archive },
]

export function getProjectIconOption(iconId?: string | null): ProjectIconOption {
  return PROJECT_ICON_OPTIONS.find(option => option.id === iconId) || PROJECT_ICON_OPTIONS[0]
}

// Maps an icon id (e.g. "folder") to its translation key (e.g. "projects.iconFolder")
// so icon labels can be localized instead of relying on the English fallback in PROJECT_ICON_OPTIONS.
export function projectIconLabelKey(iconId?: string | null): string {
  const id = iconId && iconId.length > 0 ? iconId : 'folder'
  return `projects.icon${id.charAt(0).toUpperCase()}${id.slice(1)}`
}

export function ProjectIcon({ iconId, className = 'h-4 w-4' }: {
  iconId?: string | null
  className?: string
}) {
  const Icon = getProjectIconOption(iconId).icon
  return <Icon className={className} />
}
