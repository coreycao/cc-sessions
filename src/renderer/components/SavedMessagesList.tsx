import type { SavedMessage } from '../../shared/types'
import { formatDate } from '../lib/utils'
import { Bookmark } from 'lucide-react'
import { useI18n } from '../lib/i18n'

interface SavedMessagesListProps {
  savedMessages: SavedMessage[]
  selectedSavedId: string | null
  setSelectedSavedId: (id: string | null) => void
}

export function SavedMessagesList({ savedMessages, selectedSavedId, setSelectedSavedId }: SavedMessagesListProps) {
  const { t } = useI18n()
  if (savedMessages.length === 0) {
    return (
      <div className="flex-1 min-h-0 flex flex-col bg-surface" role="list" aria-label={t('app.savedTitle')}>
        <div className="flex-1 flex flex-col items-center justify-center text-content-4 text-xs gap-2">
          <Bookmark className="w-6 h-6 text-content-5" />
          <span>{t('session.noSavedMessages')}</span>
          <span className="text-[11px] text-content-5">{t('session.rightClickToSave')}</span>
        </div>
      </div>
    )
  }

  const sorted = [...savedMessages].sort((a, b) => b.savedAt.localeCompare(a.savedAt))

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-surface" role="list" aria-label={t('app.savedTitle')}>
      <div className="flex-1 overflow-y-auto">
        {sorted.map(msg => {
          const isSelected = selectedSavedId === msg.id
          const roleColor = msg.role === 'user' ? 'bg-blue-400' : 'bg-emerald-400'
          return (
            <button
              key={msg.id}
              role="listitem"
              aria-selected={isSelected}
              onClick={() => setSelectedSavedId(msg.id)}
              className={`group w-full text-left px-4 py-3 border-b border-edge-2/70 transition-colors ${isSelected ? 'bg-surface-2 shadow-[inset_3px_0_0_0_var(--color-accent)]' : 'hover:bg-surface-2/70'}`}
            >
              <div className="flex items-start gap-2">
                {msg.messageCount && msg.messageCount > 1 ? (
                  <span
                    className="mt-1 flex-shrink-0 rounded-md bg-accent-subtle px-1.5 py-0.5 text-[9px] font-bold leading-none text-accent"
                    title={t('session.savedGroup', { count: msg.messageCount })}
                  >
                    {msg.messageCount}
                  </span>
                ) : (
                  <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${roleColor}`} title={msg.role} />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-content-2 line-clamp-2 leading-snug">
                    {msg.content.trim().slice(0, 240)}
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-content-4">
                    <span className="truncate flex-1 min-w-0">{msg.sessionTitle}</span>
                    <span className="flex-shrink-0">{formatDate(msg.savedAt)}</span>
                  </div>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
