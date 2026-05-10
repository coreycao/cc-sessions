import { useRef, useState, useEffect, useCallback } from 'react'
import type { SessionInfo, GTDMetadata, ContentSearchResult } from '../../shared/types'
import { formatDate, relativeProjectName, GTD_STATUS_CONFIG } from '../lib/utils'
import { MessageSquare, GitBranch, Star, FileText, Search } from 'lucide-react'

const ITEM_HEIGHT = 80
const OVERSCAN = 5

interface SessionListProps {
  filteredSessions: SessionInfo[]
  selectedSessionId: string | null
  selectSession: (session: SessionInfo) => void
  getGTD: (sessionId: string) => GTDMetadata
  hasFilters: boolean
  contentResults: Map<string, ContentSearchResult>
}

export function SessionList({ filteredSessions, selectedSessionId, selectSession, getGTD, hasFilters, contentResults }: SessionListProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setViewportHeight(entry.contentRect.height))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const handleScroll = useCallback(() => {
    if (scrollRef.current) setScrollTop(scrollRef.current.scrollTop)
  }, [])

  if (filteredSessions.length === 0) {
    return (
      <div className="w-[320px] flex-shrink-0 border-r border-edge/70 flex flex-col bg-surface" role="list" aria-label="Session list">
        <div className="flex-1 flex flex-col items-center justify-center text-content-4 text-xs gap-2">
          {hasFilters ? (
            <>
              <Search className="w-6 h-6 text-content-5" />
              <span>No matching sessions</span>
              <span className="text-[11px] text-content-5">Try adjusting your filters</span>
            </>
          ) : (
            <>
              <FileText className="w-6 h-6 text-content-5" />
              <span>No sessions yet</span>
              <span className="text-[11px] text-content-5">Sessions appear after using Claude Code</span>
            </>
          )}
        </div>
      </div>
    )
  }

  const totalHeight = filteredSessions.length * ITEM_HEIGHT
  const startIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN)
  const endIndex = Math.min(filteredSessions.length - 1, Math.ceil((scrollTop + viewportHeight) / ITEM_HEIGHT) + OVERSCAN)
  const visibleItems = filteredSessions.slice(startIndex, endIndex + 1)

  return (
    <div className="w-[320px] flex-shrink-0 border-r border-edge/70 flex flex-col bg-surface" role="list" aria-label="Session list">
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto"
        onScroll={handleScroll}
      >
        <div style={{ height: totalHeight, position: 'relative' }}>
          <div style={{ position: 'absolute', top: startIndex * ITEM_HEIGHT, left: 0, right: 0 }}>
            {visibleItems.map(session => {
              const gtd = getGTD(session.sessionId)
              const statusConfig = GTD_STATUS_CONFIG[gtd.status]
              const isSelected = selectedSessionId === session.sessionId

              return (
                <button
                  key={session.sessionId}
                  role="listitem"
                  aria-selected={isSelected}
                  onClick={() => selectSession(session)}
                  className={`w-full text-left px-3 border-b border-edge-2/50 transition-colors ${isSelected ? 'bg-surface-3/60' : 'hover:bg-surface-2/60'}`}
                  style={{ height: ITEM_HEIGHT }}
                >
                  <div className="flex items-start gap-2 py-2.5">
                    <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${statusConfig.color} ${gtd.status === 'in-progress' ? 'animate-pulse' : ''}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        {gtd.starred && <Star className="w-3 h-3 text-amber-400 fill-amber-400 flex-shrink-0" />}
                        <span className={`text-xs font-medium truncate ${isSelected ? 'text-content' : 'text-content-2'}`}>
                          {session.title}
                        </span>
                      </div>
                      <div className="text-[11px] text-content-4 mt-0.5 truncate">
                        {relativeProjectName(session.projectName)}
                      </div>
                      {contentResults.has(session.sessionId) && (
                        <div className="text-[10px] text-content-3 mt-0.5 truncate italic">
                          {contentResults.get(session.sessionId)!.snippet}
                        </div>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-content-4 flex items-center gap-0.5">
                          <MessageSquare className="w-2.5 h-2.5" />{session.messageCount}
                        </span>
                        <span className="text-[10px] text-content-4">{formatDate(session.modified)}</span>
                        {session.gitBranch && session.gitBranch !== 'HEAD' && (
                          <span className="text-[10px] text-content-4 flex items-center gap-0.5">
                            <GitBranch className="w-2.5 h-2.5" />{session.gitBranch}
                          </span>
                        )}
                      </div>
                      {gtd.tags.length > 0 && (
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {gtd.tags.map(tag => (
                            <span key={tag} className="text-[10px] bg-surface-3 text-content-2 px-1.5 py-0.5 rounded-sm">{tag}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
