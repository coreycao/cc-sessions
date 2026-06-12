import { useRef, useState, useMemo, useEffect, startTransition } from 'react'
import type { MutableRefObject } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { parseConversation } from '../lib/parseConversation'
import { TurnRenderer, FullscreenMessageModal } from './ConversationMessage'
import type { MessageActions } from './ConversationMessage'
import type { ConversationTurn, SessionProvider } from '../../shared/types'

export { FullscreenMessageModal } from './ConversationMessage'
export type { MessageActions } from './ConversationMessage'

export function ConversationPreview({ content, sessionId, provider, assistantLabel, compact, actions, onScroll, scrollContainerRef }: {
  content: string
  sessionId: string
  provider: SessionProvider
  assistantLabel: string
  compact: boolean
  actions: MessageActions
  onScroll?: (scrollTop: number) => void
  scrollContainerRef?: MutableRefObject<HTMLDivElement | null>
}) {
  const [expandedMsg, setExpandedMsg] = useState<{ role: string; text: string; timestamp: string } | null>(null)
  const internalScrollRef = useRef<HTMLDivElement>(null)
  const scrollRef = scrollContainerRef ?? internalScrollRef
  const renderKey = conversationParseKey(content, provider, sessionId)

  const { turns, parsing, error } = useParsedConversation(content, provider, sessionId)
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
    scrollRef.current?.scrollTo({ top: 0 })
  }, [renderKey])

  useEffect(() => {
    virtualizer.measure()
  }, [compact, renderKey, virtualizer])

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
                />
              </div>
            )
          })}
        </div>
        {turns.length > 80 && (
          <div className="pointer-events-none sticky bottom-2 mx-auto mb-1 w-fit rounded-full border border-edge/70 bg-surface/90 px-2 py-1 text-[10px] text-content-4 shadow-sm backdrop-blur">
            {(virtualItems[0]?.index ?? 0) + 1} / {turns.length}
          </div>
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
