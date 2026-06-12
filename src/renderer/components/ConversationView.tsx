import { useState, useMemo, useEffect, startTransition } from 'react'
import { parseConversation } from '../lib/parseConversation'
import { TurnRenderer, FullscreenMessageModal } from './ConversationMessage'
import type { MessageActions } from './ConversationMessage'
import type { ConversationTurn, SessionProvider } from '../../shared/types'

export { FullscreenMessageModal } from './ConversationMessage'
export type { MessageActions } from './ConversationMessage'

export function ConversationPreview({ content, sessionId, provider, assistantLabel, compact, actions }: {
  content: string
  sessionId: string
  provider: SessionProvider
  assistantLabel: string
  compact: boolean
  actions: MessageActions
}) {
  const [expandedMsg, setExpandedMsg] = useState<{ role: string; text: string; timestamp: string } | null>(null)
  const renderKey = conversationParseKey(content, provider, sessionId)

  const { turns, parsing, error } = useParsedConversation(content, provider, sessionId)
  const visibleCount = useProgressiveMount(turns.length, renderKey)

  useEffect(() => {
    setExpandedMsg(null)
  }, [renderKey])

  if (parsing) {
    return <ConversationParseState />
  }

  if (error) {
    return <PlainConversation content={content} provider={provider} />
  }

  if (turns.length === 0) {
    return <div className="text-content-4 text-xs">No conversation content available.</div>
  }

  const visibleTurns = visibleCount >= turns.length ? turns : turns.slice(0, visibleCount)
  const remaining = turns.length - visibleCount

  return (
    <>
      <div className="space-y-5 flex flex-col">
        {visibleTurns.map((turn, i) => (
          <div key={turn.id} className="turn-enter" style={{ animationDelay: `${Math.min(i, 12) * 8}ms` }}>
            <TurnRenderer turn={turn} onExpand={setExpandedMsg} compact={compact} actions={actions} assistantLabel={assistantLabel} />
          </div>
        ))}
        {remaining > 0 && <LoadingIndicator remaining={remaining} total={turns.length} />}
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

const FIRST_BATCH = 20
const BATCH_SIZE = 12
const BATCH_SIZE_LARGE = 24
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

function useProgressiveMount(total: number, resetKey: string): number {
  const [visibleCount, setVisibleCount] = useState(() => Math.min(total, FIRST_BATCH))

  useEffect(() => {
    setVisibleCount(Math.min(total, FIRST_BATCH))
    if (total <= FIRST_BATCH) return

    let cancelled = false
    let rafId = 0
    let current = Math.min(total, FIRST_BATCH)

    const step = () => {
      if (cancelled) return
      const batch = current < 80 ? BATCH_SIZE : BATCH_SIZE_LARGE
      const next = Math.min(total, current + batch)
      current = next
      startTransition(() => setVisibleCount(next))
      if (next < total) {
        rafId = requestAnimationFrame(step)
      }
    }

    rafId = requestAnimationFrame(step)
    return () => {
      cancelled = true
      cancelAnimationFrame(rafId)
    }
  }, [total, resetKey])

  return visibleCount
}

function ConversationParseState() {
  return (
    <div className="flex min-h-[220px] items-center justify-center text-[12px] text-content-4">
      <span>Preparing conversation...</span>
    </div>
  )
}

function LoadingIndicator({ remaining, total }: { remaining: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-2 py-2 text-[10px] text-content-5">
      <span className="inline-flex gap-0.5">
        <span className="w-1 h-1 rounded-full bg-content-4 animate-pulse" style={{ animationDelay: '0ms' }} />
        <span className="w-1 h-1 rounded-full bg-content-4 animate-pulse" style={{ animationDelay: '150ms' }} />
        <span className="w-1 h-1 rounded-full bg-content-4 animate-pulse" style={{ animationDelay: '300ms' }} />
      </span>
      <span>Loading {total - remaining} / {total} messages…</span>
    </div>
  )
}
