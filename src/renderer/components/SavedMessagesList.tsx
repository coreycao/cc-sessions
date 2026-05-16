import type { SavedMessage } from '../../shared/types'
import { formatDate } from '../lib/utils'
import { Bookmark } from 'lucide-react'

interface SavedMessagesListProps {
  savedMessages: SavedMessage[]
  selectedSavedId: string | null
  setSelectedSavedId: (id: string | null) => void
}

export function SavedMessagesList({ savedMessages, selectedSavedId, setSelectedSavedId }: SavedMessagesListProps) {
  if (savedMessages.length === 0) {
    return (
      <div className="flex-1 min-h-0 border-r border-edge/70 flex flex-col bg-surface" role="list" aria-label="Saved messages">
        <div className="flex-1 flex flex-col items-center justify-center text-content-4 text-xs gap-2">
          <Bookmark className="w-6 h-6 text-content-5" />
          <span>No saved messages</span>
          <span className="text-[11px] text-content-5">Right-click a message to save it</span>
        </div>
      </div>
    )
  }

  const sorted = [...savedMessages].sort((a, b) => b.savedAt.localeCompare(a.savedAt))

  return (
    <div className="flex-1 min-h-0 border-r border-edge/70 flex flex-col bg-surface" role="list" aria-label="Saved messages">
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
              className={`group w-full text-left px-3 py-2.5 border-b border-edge-2/50 transition-colors ${isSelected ? 'bg-surface-3/60' : 'hover:bg-surface-2/60'}`}
            >
              <div className="flex items-start gap-2">
                <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${roleColor}`} title={msg.role} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-content-2 line-clamp-2 leading-snug">
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
