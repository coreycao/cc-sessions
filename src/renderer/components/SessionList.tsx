import { useRef, useState, useEffect, useCallback } from 'react'
import type { SessionInfo, GTDMetadata, ContentSearchResult } from '../../shared/types'
import { formatDate, relativeProjectName, STATUS_CONFIG } from '../lib/utils'
import { Calendar, MessageSquare, GitBranch, Star, FileText, Search, CheckSquare, Square } from 'lucide-react'

const ITEM_HEIGHT = 88
const OVERSCAN = 5

interface SessionListProps {
  filteredSessions: SessionInfo[]
  selectedSessionId: string | null
  selectSession: (session: SessionInfo) => void
  getGTD: (sessionId: string) => GTDMetadata
  hasFilters: boolean
  contentResults: Map<string, ContentSearchResult>
  batchSelectedIds: Set<string>
  toggleBatchSelect: (sessionId: string) => void
  batchSelectRange: (fromIndex: number, toIndex: number, filteredSessions: SessionInfo[]) => void
  lastClickedIndex: React.MutableRefObject<number | null>
}

export function SessionList({ filteredSessions, selectedSessionId, selectSession, getGTD, hasFilters, contentResults, batchSelectedIds, toggleBatchSelect, batchSelectRange, lastClickedIndex }: SessionListProps) {
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

  const hasBatchSelection = batchSelectedIds.size > 0

  if (filteredSessions.length === 0) {
    return (
      <div className="flex-1 min-h-0 border-r border-edge/40 flex flex-col bg-surface" role="list" aria-label="Session list">
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
    <div className="flex-1 min-h-0 border-r border-edge/40 flex flex-col bg-surface" role="list" aria-label="Session list">
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto"
        onScroll={handleScroll}
      >
        <div style={{ height: totalHeight, position: 'relative' }}>
          <div style={{ position: 'absolute', top: startIndex * ITEM_HEIGHT, left: 0, right: 0 }}>
            {visibleItems.map((session, visibleIdx) => {
              const actualIndex = startIndex + visibleIdx
              const gtd = getGTD(session.sessionId)
              const statusConfig = STATUS_CONFIG[gtd.status] || STATUS_CONFIG['new']
              const isSelected = selectedSessionId === session.sessionId
              const isBatchSelected = batchSelectedIds.has(session.sessionId)

              return (
                <button
                  key={session.sessionId}
                  role="listitem"
                  aria-selected={isSelected}
                  onClick={(e) => {
                    const sessionId = session.sessionId
                    if (e.shiftKey && lastClickedIndex.current !== null) {
                      e.preventDefault()
                      batchSelectRange(lastClickedIndex.current, actualIndex, filteredSessions)
                    } else if (e.metaKey || e.ctrlKey) {
                      e.preventDefault()
                      toggleBatchSelect(sessionId)
                      lastClickedIndex.current = actualIndex
                    } else {
                      selectSession(session)
                      lastClickedIndex.current = actualIndex
                    }
                  }}
                  className={`group w-full text-left px-3 border-b border-edge-2/50 transition-colors ${isSelected ? 'bg-accent-subtle shadow-[inset_2px_0_0_0_var(--color-accent)]' : 'hover:bg-surface-2/60'} ${isBatchSelected ? 'bg-accent-subtle ring-2 ring-accent/40 ring-inset' : ''}`}
                  style={{ height: ITEM_HEIGHT }}
                >
                  <div className="flex items-start gap-2.5 py-2.5">
                    {hasBatchSelection && (
                      <span
                        className="mt-1 flex-shrink-0"
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleBatchSelect(session.sessionId)
                          lastClickedIndex.current = actualIndex
                        }}
                      >
                        {isBatchSelected
                          ? <CheckSquare className="w-3.5 h-3.5 text-accent" />
                          : <Square className="w-3.5 h-3.5 text-content-4" />
                        }
                      </span>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={`h-2 w-2 rounded-full flex-shrink-0 ring-1 ring-white/80 dark:ring-surface/80 ${statusConfig.dotColor}`} title={statusConfig.label} />
                        {gtd.starred && <Star className="w-3 h-3 text-warning fill-warning flex-shrink-0" />}
                        <span className={`text-xs font-medium truncate ${isSelected ? 'text-content' : 'text-content-2'}`}>
                          {session.title}
                        </span>
                      </div>
                      <div className="text-[11px] text-content-4 mt-1 truncate">
                        {relativeProjectName(session.projectName)}
                      </div>
                      {contentResults.has(session.sessionId) && (
                        <div className="mt-1 flex min-w-0 items-center gap-1 text-[10px] text-content-3">
                          <span className="shrink-0 rounded bg-tool-subtle px-1 py-0.5 font-medium text-tool">Content</span>
                          <span className="truncate italic">{contentResults.get(session.sessionId)!.snippet}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 mt-1.5 overflow-hidden">
                        <MetaPill icon={<MessageSquare className="w-2.5 h-2.5" />}>{session.messageCount}</MetaPill>
                        <MetaPill icon={<Calendar className="w-2.5 h-2.5" />}>{formatDate(session.modified)}</MetaPill>
                        {session.gitBranch && session.gitBranch !== 'HEAD' && (
                          <MetaPill icon={<GitBranch className="w-2.5 h-2.5" />} truncate>{session.gitBranch}</MetaPill>
                        )}
                      </div>
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

function MetaPill({ icon, children, truncate }: {
  icon: React.ReactNode
  children: React.ReactNode
  truncate?: boolean
}) {
  return (
    <span className={`inline-flex h-5 min-w-0 items-center gap-1 rounded border border-edge/50 bg-surface-2/70 px-1.5 text-[10px] text-content-4 ${truncate ? 'max-w-[96px]' : 'shrink-0'}`}>
      <span className="shrink-0 text-content-5">{icon}</span>
      <span className={truncate ? 'truncate' : 'tabular-nums'}>{children}</span>
    </span>
  )
}
