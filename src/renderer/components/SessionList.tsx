import { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import type { SessionInfo, GTDMetadata, ContentSearchResult } from '../../shared/types'
import { formatDate, relativeProjectName, buildGroupedRows } from '../lib/utils'
import { MessageSquare, GitBranch, Star, FileText, Search, CheckSquare, Square } from 'lucide-react'
import { ProviderLogo } from './ProviderLogo'
import { useI18n } from '../lib/i18n'

type FilterView = 'all' | 'new' | 'archived' | 'starred'

const ITEM_HEIGHT = 76
const HEADER_HEIGHT = 34
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
  filterStatus: FilterView
}

export function SessionList({
  filteredSessions,
  selectedSessionId,
  selectSession,
  getGTD,
  hasFilters,
  contentResults,
  batchSelectedIds,
  toggleBatchSelect,
  batchSelectRange,
  lastClickedIndex,
  filterStatus,
}: SessionListProps) {
  const { t } = useI18n()
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

  const groupedRows = useMemo(() => buildGroupedRows(filteredSessions), [filteredSessions])

  const positions = useMemo(() => {
    const pos: number[] = []
    let acc = 0
    for (const row of groupedRows) {
      pos.push(acc)
      acc += row.kind === 'header' ? HEADER_HEIGHT : ITEM_HEIGHT
    }
    return pos
  }, [groupedRows])

  const sessionIndexMap = useMemo(() => {
    const map = new Map<string, number>()
    filteredSessions.forEach((s, i) => map.set(s.sessionId, i))
    return map
  }, [filteredSessions])

  if (filteredSessions.length === 0) {
    return (
      <div className="flex-1 min-h-0 flex flex-col bg-surface" role="list" aria-label="Session list">
        <div className="flex-1 flex flex-col items-center justify-center text-content-4 text-xs gap-2">
          {hasFilters ? (
            <>
              <Search className="w-6 h-6 text-content-5" />
              <span>{t('session.noMatching')}</span>
              <span className="text-[11px] text-content-5">{t('session.adjustFilters')}</span>
            </>
          ) : (
            <>
              <FileText className="w-6 h-6 text-content-5" />
              <span>{t('session.noSessions')}</span>
              <span className="text-[11px] text-content-5">{t('session.appearAfterUse')}</span>
            </>
          )}
        </div>
      </div>
    )
  }

  const totalHeight = positions[positions.length - 1]! +
    (groupedRows[groupedRows.length - 1]!.kind === 'header' ? HEADER_HEIGHT : ITEM_HEIGHT)

  // Binary search for visible range
  let lo = 0, hi = groupedRows.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const bottom = positions[mid]! + (groupedRows[mid]!.kind === 'header' ? HEADER_HEIGHT : ITEM_HEIGHT)
    if (bottom < scrollTop - OVERSCAN * ITEM_HEIGHT) lo = mid + 1
    else hi = mid - 1
  }
  const visibleStart = Math.max(0, lo - 1)

  lo = visibleStart
  hi = groupedRows.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (positions[mid]! > scrollTop + viewportHeight + OVERSCAN * ITEM_HEIGHT) hi = mid - 1
    else lo = mid + 1
  }
  const visibleEnd = Math.min(groupedRows.length - 1, lo)

  const visibleRows = groupedRows.slice(visibleStart, visibleEnd + 1)

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-surface" role="list" aria-label="Session list">
      <div ref={scrollRef} className="flex-1 overflow-y-auto" onScroll={handleScroll}>
        <div style={{ height: totalHeight, position: 'relative' }}>
          <div style={{ position: 'absolute', top: positions[visibleStart]!, left: 0, right: 0 }}>
            {visibleRows.map(row => {
              if (row.kind === 'header') {
                return (
                  <div
                    key={row.id}
                    className="flex items-center px-4 bg-surface text-[12px] font-semibold text-content-4"
                    style={{ height: HEADER_HEIGHT }}
                  >
                    {t(`date.${row.group}`)}
                  </div>
                )
              }

              const session = row.session
              const gtd = getGTD(session.sessionId)
              const isArchived = gtd.status === 'archived'
              const dimArchived = isArchived && filterStatus !== 'archived'
              const isSelected = selectedSessionId === session.sessionId
              const isBatchSelected = batchSelectedIds.has(session.sessionId)
              const actualIndex = sessionIndexMap.get(session.sessionId) ?? -1

              return (
                <button
                  key={session.sessionId}
                  role="listitem"
                  aria-selected={isSelected}
                  onClick={(e) => {
                    if (e.shiftKey && lastClickedIndex.current !== null) {
                      e.preventDefault()
                      batchSelectRange(lastClickedIndex.current, actualIndex, filteredSessions)
                    } else if (e.metaKey || e.ctrlKey) {
                      e.preventDefault()
                      toggleBatchSelect(session.sessionId)
                      lastClickedIndex.current = actualIndex
                    } else {
                      selectSession(session)
                      lastClickedIndex.current = actualIndex
                    }
                  }}
                  className={`group w-full text-left px-4 border-b border-edge-2/70 transition-colors ${isSelected ? 'bg-surface-2 shadow-[inset_3px_0_0_0_var(--color-accent)]' : 'hover:bg-surface-2/70'} ${isBatchSelected ? 'bg-accent-subtle ring-2 ring-accent/35 ring-inset' : ''}`}
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
                    <ProviderLogo provider={session.provider} size="md" className="mt-[1px] flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        {gtd.starred && <Star className="w-3 h-3 text-amber-400 fill-amber-400 flex-shrink-0" />}
                        <span className={`text-[13px] font-medium truncate ${dimArchived ? 'text-content-4' : isSelected ? 'text-content' : 'text-content-2'}`}>
                          {session.title}
                        </span>
                      </div>
                      <div className={`text-[11px] mt-1 truncate ${dimArchived ? 'text-content-5' : 'text-content-4'}`}>
                        {relativeProjectName(session.projectName)}
                      </div>
                      {contentResults.has(session.sessionId) && (
                        <div className="text-[10px] text-content-3 mt-0.5 truncate italic">
                          {contentResults.get(session.sessionId)!.snippet}
                        </div>
                      )}
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[10px] text-content-4 flex items-center gap-0.5">
                          <MessageSquare className="w-2.5 h-2.5" />{session.messageCount}
                        </span>
                        <span className="text-[10px] text-content-4">{formatDate(session.modified)}</span>
                        {dimArchived && (
                          <span className="rounded border border-edge/70 bg-surface-2 px-1 py-px text-[9px] font-medium uppercase tracking-wide text-content-5">
                            {t('session.archived')}
                          </span>
                        )}
                        {session.gitBranch && session.gitBranch !== 'HEAD' && (
                          <span className="text-[10px] text-content-4 flex items-center gap-0.5">
                            <GitBranch className="w-2.5 h-2.5" />{session.gitBranch}
                          </span>
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
