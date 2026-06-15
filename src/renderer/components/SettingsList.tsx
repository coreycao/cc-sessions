import { BadgeInfo, BarChart3, Bot, Brush, Database, FolderKanban, type LucideIcon } from 'lucide-react'
import { useI18n } from '../lib/i18n'

export type SettingsSection =
  | 'app'
  | 'ai'
  | 'projects'
  | 'statistics'
  | 'data'
  | 'appearance'

interface SettingsListProps {
  selected: SettingsSection
  onSelect: (section: SettingsSection) => void
}

export function SettingsList({ selected, onSelect }: SettingsListProps) {
  const { t } = useI18n()
  const items: { id: SettingsSection; icon: LucideIcon; label: string; description: string }[] = [
    { id: 'app', icon: BadgeInfo, label: t('settings.app'), description: t('settings.appDescription') },
    { id: 'appearance', icon: Brush, label: t('settings.appearance'), description: t('settings.appearanceDescription') },
    { id: 'ai', icon: Bot, label: t('settings.ai'), description: t('settings.aiDescription') },
    { id: 'projects', icon: FolderKanban, label: t('settings.projects'), description: t('settings.projectsDescription') },
    { id: 'statistics', icon: BarChart3, label: t('settings.statistics'), description: t('settings.statisticsDescription') },
    { id: 'data', icon: Database, label: t('settings.data'), description: t('settings.dataDescription') },
  ]

  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="relative flex-shrink-0 h-[42px] flex items-center justify-center border-b border-edge/50">
        <h2 className="text-[14px] font-semibold text-content">{t('settings.title')}</h2>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-8">
        <div className="space-y-1">
          {items.map(({ id, icon: Icon, label, description }) => {
            const active = selected === id
            return (
              <button
                key={id}
                onClick={() => onSelect(id)}
                className={`group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors ${active ? 'bg-surface-2 text-content shadow-[inset_0_0_0_1px_var(--color-edge)]' : 'text-content-3 hover:bg-surface-2/70 hover:text-content-2'}`}
                aria-pressed={active}
              >
                <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${active ? 'text-accent bg-accent-subtle' : 'text-content-4 group-hover:text-content-3'}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold">{label}</span>
                  <span className="block truncate text-[11px] text-content-4">{description}</span>
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
