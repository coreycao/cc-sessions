import { useCallback, useEffect, useRef, useMemo, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { SessionInfo, GTDMetadata, ContentSearchResult } from '../../shared/types'
import { formatDate, relativeProjectName, buildGroupedRows } from '../lib/utils'
import { MessageSquare, GitBranch, Star, FileText, Search, CheckSquare, Square, PencilLine } from 'lucide-react'
import { ProviderLogo } from './ProviderLogo'
import { useI18n } from '../lib/i18n'

type FilterView = 'all' | 'new' | 'archived' | 'starred'

const ITEM_HEIGHT = 76
const HEADER_HEIGHT = 34
const OVERSCAN = 5

type SessionRow = ReturnType<typeof buildGroupedRows>[number]

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
  const deferredSelectFrame = useRef<number | null>(null)
  const deferredSelectTimer = useRef<number | null>(null)
  const [optimisticSelectedId, setOptimisticSelectedId] = useState<string | null>(selectedSessionId)

  useEffect(() => {
    setOptimisticSelectedId(selectedSessionId)
  }, [selectedSessionId])

  useEffect(() => () => {
    if (deferredSelectFrame.current != null) {
      cancelAnimationFrame(deferredSelectFrame.current)
    }
    if (deferredSelectTimer.current != null) {
      window.clearTimeout(deferredSelectTimer.current)
    }
  }, [])

  const selectSessionAfterSelectionPaint = useCallback((session: SessionInfo) => {
    setOptimisticSelectedId(session.sessionId)
    if (deferredSelectFrame.current != null) {
      cancelAnimationFrame(deferredSelectFrame.current)
    }
    if (deferredSelectTimer.current != null) {
      window.clearTimeout(deferredSelectTimer.current)
    }
    deferredSelectFrame.current = requestAnimationFrame(() => {
      deferredSelectFrame.current = null
      deferredSelectTimer.current = window.setTimeout(() => {
        deferredSelectTimer.current = null
        selectSession(session)
      }, 0)
    })
  }, [selectSession])

  const hasBatchSelection = batchSelectedIds.size > 0

  const groupedRows = useMemo(() => buildGroupedRows(filteredSessions), [filteredSessions])

  const rowVirtualizer = useVirtualizer({
    count: groupedRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: index => groupedRows[index]?.kind === 'header' ? HEADER_HEIGHT : ITEM_HEIGHT,
    getItemKey: index => groupedRows[index]?.id ?? index,
    initialRect: { width: 340, height: 640 },
    overscan: OVERSCAN,
  })

  const virtualRows = rowVirtualizer.getVirtualItems()

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

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-surface" role="list" aria-label="Session list">
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="relative" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
          {virtualRows.map(virtualRow => {
            const row = groupedRows[virtualRow.index]
            if (!row) return null

            return (
              <div
                key={virtualRow.key}
                className="absolute left-0 right-0 top-0"
                style={{
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <SessionListRow
                  row={row}
                  selectedSessionId={optimisticSelectedId}
                  selectSession={selectSessionAfterSelectionPaint}
                  getGTD={getGTD}
                  contentResults={contentResults}
                  hasBatchSelection={hasBatchSelection}
                  batchSelectedIds={batchSelectedIds}
                  toggleBatchSelect={toggleBatchSelect}
                  batchSelectRange={batchSelectRange}
                  lastClickedIndex={lastClickedIndex}
                  filteredSessions={filteredSessions}
                  sessionIndexMap={sessionIndexMap}
                  filterStatus={filterStatus}
                  t={t}
                />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function SessionListRow({
  row,
  selectedSessionId,
  selectSession,
  getGTD,
  contentResults,
  hasBatchSelection,
  batchSelectedIds,
  toggleBatchSelect,
  batchSelectRange,
  lastClickedIndex,
  filteredSessions,
  sessionIndexMap,
  filterStatus,
  t,
}: {
  row: SessionRow
  selectedSessionId: string | null
  selectSession: (session: SessionInfo) => void
  getGTD: (sessionId: string) => GTDMetadata
  contentResults: Map<string, ContentSearchResult>
  hasBatchSelection: boolean
  batchSelectedIds: Set<string>
  toggleBatchSelect: (sessionId: string) => void
  batchSelectRange: (fromIndex: number, toIndex: number, filteredSessions: SessionInfo[]) => void
  lastClickedIndex: React.MutableRefObject<number | null>
  filteredSessions: SessionInfo[]
  sessionIndexMap: Map<string, number>
  filterStatus: FilterView
  t: (key: string) => string
}) {
  if (row.kind === 'header') {
    return (
      <div
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
            {gtd.displayTitle?.trim() && (
              <PencilLine className="w-3 h-3 flex-shrink-0 text-accent/80" />
            )}
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
}
