import { useRef, useState, useMemo, useEffect, useCallback, startTransition } from 'react'
import type { MutableRefObject } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { parseConversation } from '../lib/parseConversation'
import { TurnRenderer, FullscreenMessageModal } from './ConversationMessage'
import type { MessageActions, TurnSelection } from './ConversationMessage'
import type { ConversationTurn, SessionProvider, TextMessage } from '../../shared/types'
import { useI18n } from '../lib/i18n'
import { Save, X } from 'lucide-react'

export { FullscreenMessageModal } from './ConversationMessage'
export type { MessageActions } from './ConversationMessage'

export function ConversationPreview({ content, sessionId, provider, assistantLabel, compact, actions, onScroll, scrollContainerRef, selectMode, onEnterSelectMode, onExitSelectMode }: {
  content: string
  sessionId: string
  provider: SessionProvider
  assistantLabel: string
  compact: boolean
  actions: MessageActions
  onScroll?: (scrollTop: number) => void
  scrollContainerRef?: MutableRefObject<HTMLDivElement | null>
  selectMode?: boolean
  onEnterSelectMode?: () => void
  onExitSelectMode?: () => void
}) {
  const [expandedMsg, setExpandedMsg] = useState<{ role: string; text: string; timestamp: string } | null>(null)
  const internalScrollRef = useRef<HTMLDivElement>(null)
  const scrollRef = scrollContainerRef ?? internalScrollRef
  const renderKey = conversationParseKey(content, provider, sessionId)
  const [selectedTurnIds, setSelectedTurnIds] = useState<Set<string>>(new Set())
  const lastClickedIndex = useRef<number | null>(null)

  const { turns, parsing, error } = useParsedConversation(content, provider, sessionId)

  // ---- Multi-turn selection (mirrors SessionList's batch helpers) ----

  const toggleTurnSelect = useCallback((turnId: string) => {
    setSelectedTurnIds(prev => {
      const next = new Set(prev)
      if (next.has(turnId)) next.delete(turnId)
      else next.add(turnId)
      return next
    })
  }, [])

  const selectTurnRange = useCallback((from: number, to: number) => {
    const [start, end] = from < to ? [from, to] : [to, from]
    const ids = turns.slice(start, end + 1).map(tr => tr.id)
    setSelectedTurnIds(prev => {
      const next = new Set(prev)
      ids.forEach(id => next.add(id))
      return next
    })
  }, [turns])

  // Unified selection handler for both the checkbox and Cmd/Shift-click on a
  // bubble. Entering select mode is a no-op when already on (React bails the
  // identical setState), so this is safe to call from either trigger.
  const handleSelect = useCallback((turnId: string, index: number, shiftKey: boolean, _metaKey: boolean) => {
    onEnterSelectMode?.()
    if (shiftKey && lastClickedIndex.current != null) {
      selectTurnRange(lastClickedIndex.current, index)
    } else {
      toggleTurnSelect(turnId)
      lastClickedIndex.current = index
    }
  }, [onEnterSelectMode, selectTurnRange, toggleTurnSelect])

  const selectAllTurns = useCallback(() => {
    setSelectedTurnIds(new Set(turns.filter(tr => tr.kind !== 'system').map(tr => tr.id)))
  }, [turns])

  const clearSelection = useCallback(() => {
    setSelectedTurnIds(new Set())
    lastClickedIndex.current = null
  }, [])

  const handleSaveSelected = useCallback(() => {
    if (!actions.onSaveMany) return
    const msgs: TextMessage[] = []
    for (const tr of turns) {
      if (!selectedTurnIds.has(tr.id)) continue
      if (tr.kind === 'user_turn') {
        msgs.push(tr.message)
      } else if (tr.kind === 'assistant_turn') {
        for (const m of tr.messages) if (m.kind === 'text' && m.content.trim()) msgs.push(m)
      }
    }
    if (msgs.length === 0) return
    actions.onSaveMany(msgs)
    clearSelection()
    onExitSelectMode?.()
  }, [turns, selectedTurnIds, actions, onExitSelectMode, clearSelection])
  const virtualizer = useVirtualizer({
    count: turns.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => estimateTurnHeight(turns[index]),
    getItemKey: (index) => turns[index]?.id ?? index,
    initialRect: { width: 900, height: 640 },
    overscan: 8,
  })

  useEffect(() => {
    setExpandedMsg(null)
    clearSelection()
    scrollRef.current?.scrollTo({ top: 0 })
  }, [renderKey, clearSelection])

  useEffect(() => {
    virtualizer.measure()
  }, [compact, renderKey, virtualizer])

  // Clear selection whenever select mode is turned off (Cancel/Save/Esc/session switch)
  useEffect(() => {
    if (selectMode) return
    clearSelection()
  }, [selectMode, clearSelection])

  // Escape exits select mode (capture phase so it wins over per-message menus)
  useEffect(() => {
    if (!selectMode) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onExitSelectMode?.()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [selectMode, onExitSelectMode])

  if (parsing) {
    return <ConversationParseState />
  }

  if (error) {
    return <PlainConversation content={content} provider={provider} />
  }

  if (turns.length === 0) {
    return <div className="text-content-4 text-xs">No conversation content available.</div>
  }

  const virtualItems = virtualizer.getVirtualItems()

  return (
    <>
      <div
        ref={scrollRef}
        className="h-full overflow-y-auto"
        onScroll={event => onScroll?.(event.currentTarget.scrollTop)}
      >
        <div
          className="relative mx-7 my-5"
          style={{ height: `${virtualizer.getTotalSize()}px` }}
        >
          {virtualItems.map(virtualItem => {
            const turn = turns[virtualItem.index]
            if (!turn) return null
            const selection: TurnSelection | undefined = selectMode
              ? { selectMode: true, selected: selectedTurnIds.has(turn.id), turnIndex: virtualItem.index, onToggle: handleSelect }
              : undefined
            return (
              <div
                key={virtualItem.key}
                ref={virtualizer.measureElement}
                data-index={virtualItem.index}
                className="absolute left-0 right-0 top-0 pb-5"
                style={{ transform: `translateY(${virtualItem.start}px)` }}
              >
                <TurnRenderer
                  turn={turn}
                  onExpand={setExpandedMsg}
                  compact={compact}
                  actions={actions}
                  assistantLabel={assistantLabel}
                  selection={selection}
                  turnIndex={virtualItem.index}
                  onActivateSelect={handleSelect}
                />
              </div>
            )
          })}
        </div>
        {turns.length > 80 && !selectMode && (
          <div className="pointer-events-none sticky bottom-2 mx-auto mb-1 w-fit rounded-full border border-edge/70 bg-surface/90 px-2 py-1 text-[10px] text-content-4 shadow-sm backdrop-blur">
            {(virtualItems[0]?.index ?? 0) + 1} / {turns.length}
          </div>
        )}
        {selectMode && (
          <SelectionBar
            selectedCount={selectedTurnIds.size}
            onSelectAll={selectAllTurns}
            onSave={handleSaveSelected}
            onCancel={() => onExitSelectMode?.()}
          />
        )}
      </div>
      {expandedMsg && (
        <FullscreenMessageModal
          message={expandedMsg}
          assistantLabel={assistantLabel}
          onClose={() => setExpandedMsg(null)}
        />
      )}
    </>
  )
}

// Floating batch bar shown only in select mode. Owns its i18n lookup so the
// surrounding ConversationPreview stays free of an I18nProvider requirement
// (and thus renderable in tests / PlainConversation fallback paths).
function SelectionBar({ selectedCount, onSelectAll, onSave, onCancel }: {
  selectedCount: number
  onSelectAll: () => void
  onSave: () => void
  onCancel: () => void
}) {
  const { t } = useI18n()
  return (
    <div className="sticky bottom-3 z-10 mx-auto mb-1 flex w-fit items-center gap-1.5 rounded-full border border-edge bg-surface/95 px-2.5 py-1.5 text-[12px] shadow-md backdrop-blur">
      <span className="font-medium text-accent">{t('detail.selectedCount', { count: selectedCount })}</span>
      <button
        type="button"
        onClick={onSelectAll}
        className="rounded-full px-2 py-0.5 text-content-3 transition-colors hover:bg-surface-3 hover:text-content-1"
      >
        {t('detail.selectAllTurns')}
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={selectedCount === 0}
        className="flex items-center gap-1 rounded-full bg-accent px-2.5 py-0.5 font-medium text-white transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Save className="h-3 w-3" />
        {t('detail.saveSelected', { count: selectedCount })}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-full p-1 text-content-4 transition-colors hover:bg-surface-3 hover:text-content-1"
        title={t('common.cancel')}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

export function PlainConversation({ content, provider = 'claude' }: { content: string; provider?: SessionProvider }) {
  const turns = useMemo(() => parseConversation(content, provider), [content, provider])
  if (turns.length === 0) {
    return <pre className="text-[11px] text-content-3 whitespace-pre-wrap break-all">{content}</pre>
  }
  return (
    <div className="space-y-3">
      {turns.map(turn => {
        if (turn.kind === 'user_turn') {
          return <pre key={turn.id} className="text-xs text-content-2 whitespace-pre-wrap bg-surface-2 rounded-md p-3">{turn.message.content}</pre>
        }
        if (turn.kind === 'assistant_turn') {
          const texts = turn.messages.filter((m): m is Extract<typeof m, { kind: 'text' }> => m.kind === 'text')
          if (texts.length === 0) return null
          return (
            <div key={turn.id} className="space-y-2">
              {texts.map(m => <pre key={m.id} className="text-xs text-content whitespace-pre-wrap">{m.content}</pre>)}
            </div>
          )
        }
        return null
      })}
    </div>
  )
}

const WORKER_PARSE_THRESHOLD = 100_000

type ParseState = {
  key: string
  turns: ConversationTurn[]
  parsing: boolean
  error: string | null
}

function useParsedConversation(content: string, provider: SessionProvider, sessionId: string): Omit<ParseState, 'key'> {
  const key = conversationParseKey(content, provider, sessionId)
  const [state, setState] = useState<ParseState>(() => parseInitialConversation(content, provider, key))

  useEffect(() => {
    const canUseWorker = shouldUseParseWorker(content)
    const nextKey = conversationParseKey(content, provider, sessionId)

    if (!canUseWorker) {
      setState(parseInitialConversation(content, provider, nextKey))
      return
    }

    let cancelled = false
    const requestId = Date.now()
    let worker: Worker

    try {
      worker = new Worker(new URL('../lib/parseConversation.worker.ts', import.meta.url), { type: 'module' })
    } catch (error) {
      setState(parseConversationState(content, provider, nextKey))
      return
    }

    setState({ key: nextKey, turns: [], parsing: true, error: null })
    worker.onmessage = (event: MessageEvent<{ id: number; turns?: ConversationTurn[]; error?: string }>) => {
      if (cancelled || event.data.id !== requestId) return
      startTransition(() => {
        setState({
          key: nextKey,
          turns: event.data.turns ?? [],
          parsing: false,
          error: event.data.error ?? null,
        })
      })
      worker.terminate()
    }
    worker.onerror = (event) => {
      if (cancelled) return
      setState({ key: nextKey, turns: [], parsing: false, error: event.message })
      worker.terminate()
    }
    worker.postMessage({ id: requestId, content, provider })

    return () => {
      cancelled = true
      worker.terminate()
    }
  }, [content, provider, sessionId])

  return state.key === key
    ? { turns: state.turns, parsing: state.parsing, error: state.error }
    : { turns: [], parsing: true, error: null }
}

function parseInitialConversation(content: string, provider: SessionProvider, key: string): ParseState {
  if (shouldUseParseWorker(content)) {
    return { key, turns: [], parsing: true, error: null }
  }

  return parseConversationState(content, provider, key)
}

function parseConversationState(content: string, provider: SessionProvider, key: string): ParseState {
  try {
    return {
      key,
      turns: parseConversation(content, provider),
      parsing: false,
      error: null,
    }
  } catch (error) {
    return {
      key,
      turns: [],
      parsing: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

function shouldUseParseWorker(content: string): boolean {
  return typeof Worker !== 'undefined' && content.length > WORKER_PARSE_THRESHOLD
}

function conversationParseKey(content: string, provider: SessionProvider, sessionId: string): string {
  return [
    sessionId,
    provider,
    content.length,
    content.slice(0, 64),
    content.slice(-64),
  ].join(':')
}

function estimateTurnHeight(turn: ConversationTurn | undefined): number {
  if (!turn) return 120
  if (turn.kind === 'system') return 56
  if (turn.kind === 'user_turn') {
    return Math.min(260, 92 + Math.ceil(turn.message.content.length / 88) * 18)
  }
  if (turn.kind === 'assistant_turn') {
    const textLength = turn.messages.reduce((sum, message) => (
      message.kind === 'text' || message.kind === 'thinking'
        ? sum + message.content.length
        : sum + 160
    ), 0)
    const visibleMessageCount = Math.max(1, turn.messages.length)
    return Math.min(520, 72 + visibleMessageCount * 56 + Math.ceil(textLength / 92) * 18)
  }
  return 120
}

function ConversationParseState() {
  return (
    <div className="flex min-h-[220px] items-center justify-center text-[12px] text-content-4">
      <span>Preparing conversation...</span>
    </div>
  )
}
